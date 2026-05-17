using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace SmartCrops.Infrastructure.ExternalApis.Gbif;

/// <summary>
/// Typed <see cref="HttpClient"/> wrapper around GBIF's species-match endpoint.
/// Resilience (retries / circuit breaker / timeout) is attached at registration
/// time via <c>AddStandardResilienceHandler()</c>, so this class focuses purely
/// on URL composition + JSON deserialisation.
/// </summary>
public class GbifClient
{
    private readonly HttpClient _http;
    private readonly ILogger<GbifClient> _logger;

    public GbifClient(HttpClient http, ILogger<GbifClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    /// <summary>
    /// Calls <c>/v1/species/match?verbose=true&amp;name=...</c>. Returns <c>null</c>
    /// only on transport failure after the resilience handler exhausts retries —
    /// a GBIF "no match" is surfaced as a normal response with <c>matchType=NONE</c>
    /// for the resolver to interpret.
    /// </summary>
    public async Task<GbifMatchResponse?> MatchAsync(string scientificName, CancellationToken ct)
    {
        var url = $"v1/species/match?verbose=true&name={Uri.EscapeDataString(scientificName)}";
        try
        {
            var response = await _http.GetFromJsonAsync<GbifMatchResponse>(url, ct);
            _logger.LogInformation(
                "GBIF match for {Name}: matchType={MatchType} confidence={Confidence}",
                scientificName, response?.MatchType, response?.Confidence);
            return response;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "GBIF transport failure for {Name}", scientificName);
            return null;
        }
    }
}
