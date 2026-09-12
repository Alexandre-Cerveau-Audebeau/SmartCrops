using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Text;
using System.Web;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Test double for the <c>WeatherApiClient</c> typed <see cref="HttpClient"/>
/// (SMA-336 PR 3a/5): a programmable <see cref="HttpMessageHandler"/> registered
/// as the client's primary handler in <see cref="PostgresFixture"/>. The
/// controllers inject the concrete client, so the only seam is the transport.
///
/// <para>Routes by the trailing path segment and keys canned answers by the
/// request's <c>q</c>:
/// <list type="bullet">
///   <item><c>search.json</c> — keyed by the decoded <c>q</c> text (« Paris »).</item>
///   <item><c>forecast.json</c> — keyed by the <c>lat,lon</c> pair exactly as the
///   client formats it (four decimals, invariant), so a test configures a
///   place with the same numbers it stored.</item>
/// </list>
/// An unconfigured search answers a valid empty array (200 — « nothing
/// matches », not a failure); an unconfigured forecast answers 404 with no
/// body, which the client classifies as <c>Transport</c> — a test that wants
/// weather must say so.</para>
///
/// <para><see cref="Received"/> is the PROOF the cache tests rest on: it lists
/// every request that reached the transport, so « one call for two gardens »
/// is a count, not an assumption. <see cref="ForecastDelay"/> makes the
/// transport slow on purpose, for the proof that a stalled provider still
/// yields a degraded answer inside the browser's budget. Shared singleton
/// across the integration collection — <c>Reset()</c> per test.</para>
/// </summary>
public sealed class StubWeatherApiHttpHandler : HttpMessageHandler
{
    private readonly record struct Canned(HttpStatusCode Status, string MediaType, string Body);

    private readonly ConcurrentDictionary<string, Canned> _responses = new();

    private const string Json = "application/json";

    /// <summary>Requests that reached the transport, as <c>kind:q</c> (« search:Paris », « forecast:45.7600,4.8400 »).</summary>
    public ConcurrentBag<string> Received { get; } = new();

    /// <summary>When set, every forecast answer waits this long first (honouring cancellation).</summary>
    public TimeSpan? ForecastDelay { get; set; }

    /// <summary>The body (and status) answered to <c>search.json?q={query}</c>.</summary>
    public void SetSearch(string query, string body, HttpStatusCode status = HttpStatusCode.OK, string mediaType = Json)
        => _responses[Key("search", query)] = new Canned(status, mediaType, body);

    /// <summary>The body (and status) answered to <c>forecast.json?q={lat},{lon}</c>.</summary>
    public void SetForecast(double latitude, double longitude, string body, HttpStatusCode status = HttpStatusCode.OK, string mediaType = Json)
        => _responses[Key("forecast", CoordinateQuery(latitude, longitude))] = new Canned(status, mediaType, body);

    /// <summary>The <c>lat,lon</c> text the client sends for a pair — four decimals, invariant culture.</summary>
    public static string CoordinateQuery(double latitude, double longitude)
        => string.Create(CultureInfo.InvariantCulture, $"{latitude:F4},{longitude:F4}");

    /// <summary>How many forecast requests reached the transport, all places together.</summary>
    public int ForecastCalls => Received.Count(r => r.StartsWith("forecast:", StringComparison.Ordinal));

    /// <summary>How many search requests reached the transport.</summary>
    public int SearchCalls => Received.Count(r => r.StartsWith("search:", StringComparison.Ordinal));

    public void Reset()
    {
        _responses.Clear();
        Received.Clear();
        ForecastDelay = null;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var uri = request.RequestUri!;
        var path = uri.AbsolutePath.TrimEnd('/');
        var q = HttpUtility.ParseQueryString(uri.Query).Get("q") ?? string.Empty;

        string kind;
        if (path.EndsWith("/search.json", StringComparison.OrdinalIgnoreCase))
        {
            kind = "search";
        }
        else if (path.EndsWith("/forecast.json", StringComparison.OrdinalIgnoreCase))
        {
            kind = "forecast";
            if (ForecastDelay is { } delay)
            {
                await Task.Delay(delay, cancellationToken);
            }
        }
        else
        {
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }

        Received.Add(Key(kind, q));

        if (_responses.TryGetValue(Key(kind, q), out var canned))
        {
            return new HttpResponseMessage(canned.Status)
            {
                Content = new StringContent(canned.Body, Encoding.UTF8, canned.MediaType),
            };
        }

        return kind == "search"
            ? new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("[]", Encoding.UTF8, Json),
            }
            : new HttpResponseMessage(HttpStatusCode.NotFound);
    }

    private static string Key(string kind, string q) => $"{kind}:{q}";
}
