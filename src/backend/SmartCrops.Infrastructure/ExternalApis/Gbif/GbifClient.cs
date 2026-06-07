using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace SmartCrops.Infrastructure.ExternalApis.Gbif;

/// <summary>
/// Typed <see cref="HttpClient"/> wrapper around GBIF's species-match endpoint.
/// Resilience (retries / circuit breaker / timeout) is attached at registration
/// time via <c>AddStandardResilienceHandler()</c>, so this class focuses purely
/// on URL composition + JSON deserialisation.
///
/// <para>SMA-71 loss-proof capture: <see cref="MatchWithLiteralAsync"/> reads the
/// response body as a STRING first and deserialises from it, so the verbatim GBIF
/// payload (including fields the DTO never binds) survives for the audit row. GBIF
/// requires no API key — nothing in the URL or body is secret, so no redaction.</para>
/// </summary>
public class GbifClient
{
    private readonly HttpClient _http;
    private readonly ILogger<GbifClient> _logger;

    // Matches GetFromJsonAsync's default (web) deserialisation so the literal path
    // parses identically to the prior ReadFromJsonAsync.
    private static readonly JsonSerializerOptions WebJsonOptions = new(JsonSerializerDefaults.Web);

    // GBIF's vernacularNames endpoint defaults to a page size of 100; we set it
    // explicitly so the pagination loop's offset arithmetic is unambiguous.
    private const int VernacularPageSize = 100;

    public GbifClient(HttpClient http, ILogger<GbifClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    /// <summary>
    /// Calls <c>/v1/species/match?verbose=true&amp;name=...</c> and returns only the
    /// parsed DTO — a thin wrapper over <see cref="MatchWithLiteralAsync"/> for
    /// callers that do not need the literal. Returns <c>null</c> on transport
    /// failure; a GBIF "no match" surfaces as a populated response with
    /// <c>matchType=NONE</c> for the resolver.
    /// </summary>
    public async Task<GbifMatchResponse?> MatchAsync(string scientificName, CancellationToken ct)
        => (await MatchWithLiteralAsync(scientificName, ct)).Match;

    /// <summary>
    /// Calls <c>/v1/species/match?verbose=true&amp;name=...</c> and returns BOTH the
    /// parsed <see cref="GbifMatchResponse"/> and the verbatim HTTP body
    /// (<see cref="GbifMatchFetch.LiteralJson"/>) — the SMA-71 loss-proof capture.
    /// The body is read as a string FIRST and the DTO is deserialised from it, so
    /// fields we do not bind (kingdom..order, status, vernacularNames, …) survive in
    /// the literal. Returns the <c>default</c> <c>(null, null)</c> tuple on transport
    /// failure, timeout, malformed JSON, or non-success status.
    /// </summary>
    public async Task<GbifMatchFetch> MatchWithLiteralAsync(string scientificName, CancellationToken ct)
    {
        var url = $"v1/species/match?verbose=true&name={Uri.EscapeDataString(scientificName)}";
        try
        {
            using var response = await _http.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            var rawBody = await response.Content.ReadAsStringAsync(ct);
            var match = JsonSerializer.Deserialize<GbifMatchResponse>(rawBody, WebJsonOptions);
            _logger.LogInformation(
                "GBIF match for {Name}: matchType={MatchType} confidence={Confidence}",
                scientificName, match?.MatchType, match?.Confidence);
            return new GbifMatchFetch(match, rawBody);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "GBIF transport failure for {Name}", scientificName);
            return default;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "GBIF returned malformed JSON for {Name}", scientificName);
            return default;
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            // HttpClient timeout (Timeout property) surfaces as TaskCanceledException
            // without the caller's token being signalled. Treat as a transport failure
            // per the contract; real caller cancellation falls through to propagate.
            _logger.LogWarning(ex, "GBIF request timed out for {Name}", scientificName);
            return default;
        }
    }

    /// <summary>
    /// SMA-124 — fetch ALL vernacular (common) names for a GBIF taxon via
    /// <c>/v1/species/{taxonKey}/vernacularNames</c>, following the
    /// <c>offset</c>/<c>limit</c> pagination until <c>endOfRecords</c>. Returns the
    /// accumulated entries across every language (FR selection is the caller's job
    /// via <see cref="GbifVernacularSelector"/>); the list is empty when the taxon
    /// has no vernaculars.
    ///
    /// <para>Failure contract mirrors <see cref="MatchWithLiteralAsync"/>: transport
    /// failure, malformed JSON, or HttpClient timeout return an EMPTY list (never
    /// throw), so a single bad taxon degrades to "no FR name" in a batch backfill
    /// rather than aborting the run. Genuine caller cancellation still propagates.
    /// GBIF requires no API key, so nothing here is secret (no redaction).</para>
    /// </summary>
    public async Task<IReadOnlyList<GbifVernacularName>> GetVernacularNamesAsync(int taxonKey, CancellationToken ct)
    {
        var accumulated = new List<GbifVernacularName>();
        var offset = 0;
        try
        {
            while (true)
            {
                var url = $"v1/species/{taxonKey}/vernacularNames?limit={VernacularPageSize}&offset={offset}";
                using var response = await _http.GetAsync(url, ct);
                response.EnsureSuccessStatusCode();

                var rawBody = await response.Content.ReadAsStringAsync(ct);
                var page = JsonSerializer.Deserialize<GbifVernacularNamesResponse>(rawBody, WebJsonOptions);

                if (page is null)
                {
                    break;
                }
                // GBIF returns "results": [] in practice, but guard against an
                // explicit "results": null mapping to a null list — treating it as
                // an empty page avoids a NullReferenceException on .Count below.
                var results = page.Results ?? [];
                if (results.Count > 0)
                {
                    accumulated.AddRange(results);
                }
                // Stop on the last page or an empty page — the empty-page guard is a
                // backstop in case GBIF never flips endOfRecords, preventing a loop.
                if (page.EndOfRecords || results.Count == 0)
                {
                    break;
                }
                offset += VernacularPageSize;
            }
            return accumulated;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "GBIF vernacularNames transport failure for taxon {TaxonKey}", taxonKey);
            return [];
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "GBIF returned malformed vernacularNames JSON for taxon {TaxonKey}", taxonKey);
            return [];
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "GBIF vernacularNames request timed out for taxon {TaxonKey}", taxonKey);
            return [];
        }
    }
}

/// <summary>
/// Result of <see cref="GbifClient.MatchWithLiteralAsync"/>: the parsed DTO plus the
/// verbatim GBIF response body (SMA-71). Both are <c>null</c> on any failure path
/// (the <c>default</c> value), so callers branch on <see cref="Match"/> exactly as
/// they did on the prior nullable return.
/// </summary>
/// <param name="Match">Parsed GBIF match, or <c>null</c> on transport/parse failure.</param>
/// <param name="LiteralJson">Verbatim GBIF response body, or <c>null</c>.</param>
public readonly record struct GbifMatchFetch(GbifMatchResponse? Match, string? LiteralJson);
