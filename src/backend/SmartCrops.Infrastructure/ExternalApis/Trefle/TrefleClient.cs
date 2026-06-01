using System.Net.Http.Json;
using System.Text.Json;
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
    /// Calls <c>/species/search?q={name}&amp;token=...</c>. Returns <c>null</c>
    /// on transport failure (after the resilience handler exhausts retries),
    /// timeout, malformed JSON response, or unsupported response Content-Type.
    /// An empty result set is <b>not</b> a failure — it surfaces as a populated
    /// response with an empty <c>Data</c> list for the resolver to interpret.
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
        catch (JsonException ex)
        {
            // Malformed payload from Trefle — honor the documented "null on
            // failure" contract instead of letting the deserialiser crash the
            // enrichment flow.
            _logger.LogWarning(ex, "Trefle search returned malformed JSON for {Name}", scientificName);
            return null;
        }
        catch (NotSupportedException ex)
        {
            // GetFromJsonAsync throws this on unexpected Content-Type. Same
            // graceful-degradation rationale as JsonException above.
            _logger.LogWarning(ex, "Trefle search returned unsupported content for {Name}", scientificName);
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

    // Matches GetFromJsonAsync's default (web) deserialisation so the literal-capture
    // path parses identically to the prior ReadFromJsonAsync.
    private static readonly JsonSerializerOptions WebJsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Calls <c>/species/{id}?token=...</c> and returns only the parsed DTO — a thin
    /// wrapper over <see cref="GetSpeciesWithLiteralAsync"/> for callers that do not
    /// need the literal. Returns <c>null</c> on transport failure, timeout, malformed
    /// JSON, non-success status, or unsupported Content-Type.
    /// </summary>
    public async Task<TrefleSpeciesResponse?> GetSpeciesAsync(int trefleId, CancellationToken ct)
        => (await GetSpeciesWithLiteralAsync(trefleId, ct)).Species;

    /// <summary>
    /// Calls <c>/species/{id}?token=...</c> and returns BOTH the parsed
    /// <see cref="TrefleSpeciesResponse"/> and the verbatim HTTP body with the token
    /// redacted (<see cref="TrefleSpeciesFetch.LiteralJson"/>) — the SMA-71 loss-proof
    /// capture. The body is read as a STRING first and the DTO is deserialised from
    /// it, so fields we do not bind (e.g. <c>growth.soil_salinity</c>) survive in the
    /// literal. Returns the <c>default</c> <c>(null, null)</c> tuple on transport
    /// failure, timeout, malformed JSON, non-success status, or non-JSON Content-Type.
    /// </summary>
    public async Task<TrefleSpeciesFetch> GetSpeciesWithLiteralAsync(int trefleId, CancellationToken ct)
    {
        var url = $"species/{trefleId}?token={Uri.EscapeDataString(_token)}";
        try
        {
            using var response = await _http.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            // Read the literal body FIRST, then deserialise from the string. The
            // token is scrubbed before the body leaves this method (defence-in-depth —
            // the Trefle body has no token today, but the contract is uniform with #102).
            var rawBody = await response.Content.ReadAsStringAsync(ct);
            var species = JsonSerializer.Deserialize<TrefleSpeciesResponse>(rawBody, WebJsonOptions);
            var literal = TrefleTokenRedactor.Redact(rawBody, _token);
            return new TrefleSpeciesFetch(species, literal);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Trefle species fetch transport failure for id {Id}", trefleId);
            return default;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Trefle species fetch returned malformed JSON for id {Id}", trefleId);
            return default;
        }
        catch (NotSupportedException ex)
        {
            _logger.LogWarning(ex, "Trefle species fetch returned unsupported content for id {Id}", trefleId);
            return default;
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Trefle species fetch timed out for id {Id}", trefleId);
            return default;
        }
    }
}

/// <summary>
/// Result of <see cref="TrefleClient.GetSpeciesWithLiteralAsync"/>: the parsed DTO
/// plus the verbatim, token-redacted HTTP body. Both are <c>null</c> on any failure
/// path (the <c>default</c> value), so callers branch on <see cref="Species"/>
/// exactly as they did on the prior nullable return.
/// </summary>
/// <param name="Species">Parsed species response, or <c>null</c> on no-match/failure.</param>
/// <param name="LiteralJson">Verbatim response body, token redacted, or <c>null</c>.</param>
public readonly record struct TrefleSpeciesFetch(TrefleSpeciesResponse? Species, string? LiteralJson);
