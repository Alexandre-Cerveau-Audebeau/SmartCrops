using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Polly.Timeout;

namespace SmartCrops.Infrastructure.ExternalApis.WeatherApi;

/// <summary>
/// Typed <see cref="HttpClient"/> wrapper around the two WeatherAPI.com
/// endpoints SmartCrops consumes (SMA-336 PR 3a/5): <c>/search.json</c>
/// (geocoding) and <c>/forecast.json</c> (current weather, daily and hourly
/// forecast, official alerts — ONE call per place for every widget size).
/// Resilience (retries / circuit breaker / per-request timeout) is attached at
/// registration via <c>AddStandardResilienceHandler</c>; this class composes
/// URLs, reads bodies and CLASSIFIES failures.
///
/// <para>Unlike <c>TrefleClient</c> and <c>PerenualClient</c>, it does not
/// answer « null on failure »: it returns a <see cref="WeatherApiResult{T}"/>
/// whose <see cref="WeatherApiFailureKind"/> the product branches on — no
/// match is an invitation, a refusal is served from the last known data, a
/// bad credential is an operator's problem behind a neutral message. To do
/// that it reads EVERY body as a string first and, on a non-success status,
/// binds the provider's <c>{ "error": { "code" } }</c> envelope BEFORE
/// deciding — never <c>EnsureSuccessStatusCode</c>, which would throw the
/// envelope away.</para>
///
/// <para><b>Key leakage</b>: the key travels as a query-string parameter on
/// every request. The client's logging goes through
/// <c>RedactingHttpClientLogger</c>, whose <c>key=</c> rule already covers this
/// provider; nothing here logs a URI. A missing key is answered without any
/// request (<see cref="WeatherApiFailureKind.MissingKey"/>) and logged ONCE
/// per process: the boot is allowed without it (SMA-377), the weather is not.</para>
/// </summary>
public sealed class WeatherApiClient
{
    private readonly HttpClient _http;
    private readonly ILogger<WeatherApiClient> _logger;
    private readonly WeatherApiOptions _options;

    // Matches HttpClientJsonExtensions' default (web) deserialisation: camelCase
    // tolerant, case-insensitive — which is what lets the documented `msgType`
    // and the observed `msgtype` both bind.
    private static readonly JsonSerializerOptions WebJsonOptions = new(JsonSerializerDefaults.Web);

    // One warning per PROCESS for the absent key, not one per request: the
    // typed client is transient, so an instance field would say it on every
    // dashboard load.
    private static int _missingKeyWarned;

    public WeatherApiClient(
        HttpClient http,
        IOptions<WeatherApiOptions> options,
        ILogger<WeatherApiClient> logger)
    {
        _http = http;
        _logger = logger;
        _options = options.Value;
    }

    /// <summary>
    /// Calls <c>/search.json?key=…&amp;q={query}</c>. The provider answers a
    /// bare array of matches; an empty array and its code 1006 are BOTH
    /// « nothing matches » — the first surfaces as a success holding no
    /// location, the second as <see cref="WeatherApiFailureKind.NoLocation"/>,
    /// and the caller treats them alike.
    /// </summary>
    public async Task<WeatherApiResult<WeatherApiSearchResponse>> SearchAsync(string query, CancellationToken ct)
    {
        var url = $"search.json?key={Uri.EscapeDataString(_options.ApiKey)}&q={Uri.EscapeDataString(query)}";
        var result = await GetAsync<List<WeatherApiSearchLocation>>(url, "search", ct);
        if (!result.IsSuccess)
        {
            return WeatherApiResult<WeatherApiSearchResponse>.Failed(
                result.Failure.Kind, result.Failure.ProviderCode, result.Failure.HttpStatus);
        }

        // A null element is data the provider did not document; drop it rather
        // than hand a hole to the caller.
        var locations = result.Value.Where(l => l is not null).ToList();
        _logger.LogInformation("WeatherAPI search: matches={Count}", locations.Count);
        return WeatherApiResult<WeatherApiSearchResponse>.Success(new WeatherApiSearchResponse(locations));
    }

    /// <summary>
    /// Calls <c>/forecast.json?key=…&amp;q={lat},{lon}&amp;days={n}&amp;alerts=yes&amp;aqi=no&amp;lang={lang}</c>.
    /// Coordinates are formatted with the INVARIANT culture (a « 45,76 » under
    /// fr-FR would be a different query). The provider may answer fewer days
    /// than requested; the shortfall is logged and the answer is still a
    /// success — the caller shows what there is.
    /// </summary>
    /// <param name="latitude">Decimal degrees, −90..90.</param>
    /// <param name="longitude">Decimal degrees, −180..180.</param>
    /// <param name="language">The <c>lang=</c> code for <c>condition:text</c>; null or blank falls back to <see cref="WeatherApiOptions.Language"/>.</param>
    /// <param name="ct">Cancellation token.</param>
    public async Task<WeatherApiResult<WeatherApiForecastResponse>> ForecastAsync(
        double latitude,
        double longitude,
        string? language,
        CancellationToken ct)
    {
        var lang = string.IsNullOrWhiteSpace(language) ? _options.Language : language;
        // Digits, a dot, a minus and a comma: every character is URL-safe, so
        // the pair travels verbatim (« 45.7640,4.8357 »), the documented form.
        var q = string.Create(
            CultureInfo.InvariantCulture,
            $"{latitude:F4},{longitude:F4}");
        var url =
            $"forecast.json?key={Uri.EscapeDataString(_options.ApiKey)}" +
            $"&q={q}" +
            $"&days={_options.ForecastDays.ToString(CultureInfo.InvariantCulture)}" +
            "&alerts=yes&aqi=no";
        // English is the provider's default and is NOT in its documented list
        // of `lang` codes (read 2026-09-12): it is asked for by omission.
        if (!string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase))
        {
            url += $"&lang={Uri.EscapeDataString(lang)}";
        }

        var result = await GetAsync<WeatherApiForecastResponse>(url, "forecast", ct);
        if (!result.IsSuccess) return result;

        var days = result.Value.Forecast?.Forecastday?.Count ?? 0;
        if (days < _options.ForecastDays)
        {
            // The documented `days` range is 1..14, but what a given key is
            // served can be shorter — the answer is still weather, and the
            // widget draws the rows it has. Said once per call so an operator
            // can see the shortfall without a failing page.
            _logger.LogWarning(
                "WeatherAPI forecast returned {Days} day(s) where {Requested} were requested",
                days, _options.ForecastDays);
        }
        else
        {
            _logger.LogInformation("WeatherAPI forecast: days={Days}", days);
        }

        return result;
    }

    private async Task<WeatherApiResult<T>> GetAsync<T>(string url, string operation, CancellationToken ct)
        where T : class
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            if (Interlocked.Exchange(ref _missingKeyWarned, 1) == 0)
            {
                _logger.LogWarning(
                    "WeatherAPI key is not configured (WeatherApi__ApiKey): weather and geocoding calls are skipped and the endpoints degrade");
            }

            return WeatherApiResult<T>.Failed(WeatherApiFailureKind.MissingKey);
        }

        try
        {
            using var response = await _http.GetAsync(url, ct);

            // The body FIRST, whatever the status: a 4xx carries the envelope
            // this client exists to read, and a 2xx may not be JSON at all.
            var body = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                var code = TryReadProviderCode(body);
                var kind = Classify(code);
                Log(kind, operation, (int)response.StatusCode, code);
                return WeatherApiResult<T>.Failed(kind, code, (int)response.StatusCode);
            }

            var contentType = response.Content.Headers.ContentType?.MediaType;
            if (!string.Equals(contentType, "application/json", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning(
                    "WeatherAPI {Operation} returned non-JSON content-type '{ContentType}'; classified Transport",
                    operation, contentType ?? "(none)");
                return WeatherApiResult<T>.Failed(WeatherApiFailureKind.Transport, null, (int)response.StatusCode);
            }

            var value = JsonSerializer.Deserialize<T>(body, WebJsonOptions);
            if (value is null)
            {
                _logger.LogWarning("WeatherAPI {Operation} returned an empty JSON body; classified Transport", operation);
                return WeatherApiResult<T>.Failed(WeatherApiFailureKind.Transport, null, (int)response.StatusCode);
            }

            return WeatherApiResult<T>.Success(value);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "WeatherAPI {Operation} transport failure (status={Status})", operation, ex.StatusCode);
            return WeatherApiResult<T>.Failed(
                WeatherApiFailureKind.Transport, null, ex.StatusCode is { } s ? (int)s : null);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "WeatherAPI {Operation} returned malformed JSON", operation);
            return WeatherApiResult<T>.Failed(WeatherApiFailureKind.Transport);
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            // HttpClient.Timeout surfaces as a cancellation whose token is not
            // the caller's — a transport failure, not a caller's decision.
            _logger.LogWarning(ex, "WeatherAPI {Operation} timed out", operation);
            return WeatherApiResult<T>.Failed(WeatherApiFailureKind.Transport);
        }
        catch (TimeoutRejectedException ex)
        {
            // The resilience handler's TotalRequestTimeout: retries could not
            // complete within the pipeline's budget.
            _logger.LogWarning(ex, "WeatherAPI {Operation} hit the resilience-handler timeout", operation);
            return WeatherApiResult<T>.Failed(WeatherApiFailureKind.Transport);
        }
    }

    /// <summary>
    /// The provider's <c>error.code</c> from a 4xx body, or null when the body
    /// is not the documented envelope (an HTML error page, an empty body).
    /// </summary>
    private static int? TryReadProviderCode(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return null;
        try
        {
            return JsonSerializer.Deserialize<WeatherApiErrorEnvelope>(body, WebJsonOptions)?.Error?.Code;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Provider code → failure kind. 1006 is « nothing matches »; 2007 and
    /// 2009 are the provider refusing the call for a reason on the account's
    /// side; 1002, 2006 and 2008 say the credential itself is wrong; every
    /// other code (1003, 1005, 9000, 9001, 9999 — request-shape or internal
    /// errors) is treated as transient.
    /// </summary>
    private static WeatherApiFailureKind Classify(int? code) => code switch
    {
        1006 => WeatherApiFailureKind.NoLocation,
        2007 or 2009 => WeatherApiFailureKind.Refused,
        1002 or 2006 or 2008 => WeatherApiFailureKind.Misconfigured,
        _ => WeatherApiFailureKind.Transport,
    };

    private void Log(WeatherApiFailureKind kind, string operation, int status, int? code)
    {
        switch (kind)
        {
            case WeatherApiFailureKind.NoLocation:
                _logger.LogInformation("WeatherAPI {Operation}: no location matches the query (code 1006)", operation);
                break;
            case WeatherApiFailureKind.Refused:
                _logger.LogWarning(
                    "WeatherAPI {Operation}: provider refused the call (HTTP {Status}, code {Code})",
                    operation, status, code);
                break;
            case WeatherApiFailureKind.Misconfigured:
                _logger.LogError(
                    "WeatherAPI {Operation}: the configured key was rejected by the provider (HTTP {Status}, code {Code}); check WeatherApi__ApiKey",
                    operation, status, code);
                break;
            default:
                _logger.LogWarning(
                    "WeatherAPI {Operation}: unexpected answer (HTTP {Status}, code {Code}); classified Transport",
                    operation, status, code);
                break;
        }
    }
}
