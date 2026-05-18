using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Polly.Timeout;

namespace SmartCrops.Infrastructure.ExternalApis.Perenual;

/// <summary>
/// Typed <see cref="HttpClient"/> wrapper around Perenual's two consumed
/// endpoints (<c>/species-list?q={name}</c> and <c>/species/details/{id}</c>).
/// Resilience (retries / circuit breaker / per-request timeout) is attached
/// at registration via <c>AddStandardResilienceHandler()</c>; this class
/// focuses on URL composition + JSON deserialisation.
///
/// <para><b>Key leakage</b>: Perenual requires the key on every request as
/// a query-string parameter (<c>?key=...</c>). It therefore lands in HTTP
/// server access logs by default. Redaction is an operator responsibility;
/// acceptable for D1 since the key is rate-limited not high-privilege.</para>
///
/// <para><b>Care guide URL leakage</b>: Perenual responses embed the API key
/// in <c>care_guides</c> and <c>hardiness_location.full_url</c> fields.
/// Those are intentionally NOT mapped on <see cref="PerenualSpeciesResponse"/>
/// so they cannot accidentally land in <c>PlantPerenualData.RawResponseJson</c>
/// from a deserialise-then-reserialise round-trip — only the consumed surface
/// is round-tripped to the audit JSON.</para>
/// </summary>
public class PerenualClient
{
    private readonly HttpClient _http;
    private readonly ILogger<PerenualClient> _logger;
    private readonly string _apiKey;

    public PerenualClient(HttpClient http, IOptions<PerenualOptions> options, ILogger<PerenualClient> logger)
    {
        _http = http;
        _logger = logger;
        _apiKey = options.Value.ApiKey;
    }

    /// <summary>
    /// Calls <c>/species-list?key=...&amp;q={name}</c>. Returns <c>null</c> on
    /// transport failure (after the resilience handler exhausts retries),
    /// timeout, malformed JSON response, or unsupported response Content-Type.
    /// An empty result set is <b>not</b> a failure — it surfaces as a populated
    /// response with an empty <c>Data</c> list for the resolver to interpret
    /// (e.g. Rosmarinus officinalis is known to return 0 matches because
    /// Perenual indexes the post-2017 reclassification Salvia rosmarinus).
    /// </summary>
    public async Task<PerenualSpeciesListResponse?> SearchAsync(string scientificName, CancellationToken ct)
    {
        var url = $"species-list?key={Uri.EscapeDataString(_apiKey)}&q={Uri.EscapeDataString(scientificName)}";
        try
        {
            var response = await _http.GetFromJsonAsync<PerenualSpeciesListResponse>(url, ct);
            _logger.LogInformation(
                "Perenual search for {Name}: matches={Count}",
                scientificName, response?.Data?.Count ?? 0);
            return response;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Perenual search transport failure for {Name}", scientificName);
            return null;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Perenual search returned malformed JSON for {Name}", scientificName);
            return null;
        }
        catch (NotSupportedException ex)
        {
            _logger.LogWarning(ex, "Perenual search returned unsupported content for {Name}", scientificName);
            return null;
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Perenual search timed out for {Name}", scientificName);
            return null;
        }
        catch (TimeoutRejectedException ex)
        {
            // The standard resilience handler's TotalRequestTimeout (default 30s)
            // throws this when retries can't complete within the global budget.
            // Treat as transport failure per the documented null-on-failure contract.
            _logger.LogWarning(ex, "Perenual search hit resilience-handler timeout for {Name}", scientificName);
            return null;
        }
    }

    /// <summary>
    /// Calls <c>/species/details/{id}?key=...</c>. Returns <c>null</c> on
    /// transport failure, timeout, malformed JSON response, or unsupported
    /// response Content-Type. A 404 from Perenual (deleted species or wrong id)
    /// likewise surfaces as <c>null</c> since
    /// <see cref="HttpClient.GetFromJsonAsync{T}(string, CancellationToken)"/>
    /// throws <see cref="HttpRequestException"/> on non-success status codes.
    /// </summary>
    public async Task<PerenualSpeciesResponse?> GetSpeciesDetailsAsync(int perenualId, CancellationToken ct)
    {
        var url = $"species/details/{perenualId}?key={Uri.EscapeDataString(_apiKey)}";
        try
        {
            return await _http.GetFromJsonAsync<PerenualSpeciesResponse>(url, ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Perenual species fetch transport failure for id {Id}", perenualId);
            return null;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Perenual species fetch returned malformed JSON for id {Id}", perenualId);
            return null;
        }
        catch (NotSupportedException ex)
        {
            _logger.LogWarning(ex, "Perenual species fetch returned unsupported content for id {Id}", perenualId);
            return null;
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Perenual species fetch timed out for id {Id}", perenualId);
            return null;
        }
        catch (TimeoutRejectedException ex)
        {
            _logger.LogWarning(ex, "Perenual species fetch hit resilience-handler timeout for id {Id}", perenualId);
            return null;
        }
    }
}
