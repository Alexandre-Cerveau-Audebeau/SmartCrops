using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SmartCrops.Infrastructure.ExternalApis.Trefle;

/// <summary>
/// Typed <see cref="HttpClient"/> wrapper around Trefle's two consumed
/// endpoints (<c>/species/search</c> and <c>/species/{id}</c>). Resilience
/// (retries / circuit breaker / per-request timeout) is attached at
/// registration via <c>AddStandardResilienceHandler()</c>; this class focuses
/// on URL composition + JSON deserialisation.
///
/// <para><b>Token leakage</b>: Trefle requires the token on every request as
/// a query-string parameter (no Authorization header support). It therefore
/// lands in HTTP server access logs by default. Redaction is an operator
/// responsibility; acceptable for D1 since the token is rate-limited not
/// high-privilege.</para>
/// </summary>
public class TrefleClient
{
    private readonly HttpClient _http;
    private readonly ILogger<TrefleClient> _logger;
    private readonly string _token;

    public TrefleClient(HttpClient http, IOptions<TrefleOptions> options, ILogger<TrefleClient> logger)
    {
        _http = http;
        _logger = logger;
        _token = options.Value.Token;
    }

    /// <summary>
    /// Calls <c>/species/search?q={name}&amp;token=...</c>. Returns <c>null</c> only
    /// on transport failure after the resilience handler exhausts retries;
    /// an empty result set surfaces as a populated response with an empty
    /// <c>Data</c> list for the resolver to interpret.
    /// </summary>
    public async Task<TrefleSearchResponse?> SearchAsync(string scientificName, CancellationToken ct)
    {
        var url = $"species/search?token={Uri.EscapeDataString(_token)}&q={Uri.EscapeDataString(scientificName)}";
        try
        {
            var response = await _http.GetFromJsonAsync<TrefleSearchResponse>(url, ct);
            _logger.LogInformation(
                "Trefle search for {Name}: matches={Count}",
                scientificName, response?.Data?.Count ?? 0);
            return response;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Trefle search transport failure for {Name}", scientificName);
            return null;
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            // HttpClient.Timeout surfaces as TaskCanceledException without the
            // caller's token being signalled. Treat as a transport failure per
            // the contract; real caller cancellation falls through to propagate.
            _logger.LogWarning(ex, "Trefle search timed out for {Name}", scientificName);
            return null;
        }
    }

    /// <summary>
    /// Calls <c>/species/{id}?token=...</c>. Returns <c>null</c> on transport
    /// failure / timeout; a 404 from Trefle (deleted species) likewise surfaces
    /// as <c>null</c> since <see cref="HttpClient.GetFromJsonAsync{T}(string, CancellationToken)"/>
    /// throws <see cref="HttpRequestException"/> on non-success status codes.
    /// </summary>
    public async Task<TrefleSpeciesResponse?> GetSpeciesAsync(int trefleId, CancellationToken ct)
    {
        var url = $"species/{trefleId}?token={Uri.EscapeDataString(_token)}";
        try
        {
            return await _http.GetFromJsonAsync<TrefleSpeciesResponse>(url, ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Trefle species fetch transport failure for id {Id}", trefleId);
            return null;
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Trefle species fetch timed out for id {Id}", trefleId);
            return null;
        }
    }
}
