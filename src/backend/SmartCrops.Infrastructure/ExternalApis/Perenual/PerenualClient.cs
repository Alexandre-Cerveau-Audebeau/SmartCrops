using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Polly.Timeout;
using SmartCrops.Core.Models;

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

    // Matches HttpClientJsonExtensions' default (web) deserialisation so the
    // literal-capture path parses identically to the prior ReadFromJsonAsync.
    private static readonly JsonSerializerOptions WebJsonOptions = new(JsonSerializerDefaults.Web);

    // The care-guide endpoint lives at /api/, one level above the configured
    // /api/v2/ base. Derive it from the client's BaseAddress so the host stays
    // single-sourced from PerenualOptions.BaseUrl rather than hard-coded here.
    private Uri ApiRootV1 => new(_http.BaseAddress!, "../");

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
    /// Calls <c>/species/details/{id}?key=...</c> and returns only the parsed
    /// DTO — a thin wrapper over <see cref="GetSpeciesDetailsWithLiteralAsync"/>
    /// for callers that do not need the literal capture. Returns <c>null</c> on
    /// transport failure, timeout, malformed JSON, non-success status, or a
    /// non-JSON Content-Type.
    /// </summary>
    public async Task<PerenualSpeciesResponse?> GetSpeciesDetailsAsync(int perenualId, CancellationToken ct)
        => (await GetSpeciesDetailsWithLiteralAsync(perenualId, ct)).Species;

    /// <summary>
    /// Calls <c>/species/details/{id}?key=...</c> and returns BOTH the parsed
    /// <see cref="PerenualSpeciesResponse"/> and the verbatim HTTP body with the
    /// API key redacted (<see cref="PerenualSpeciesFetch.LiteralJson"/>) — the
    /// SMA-71 loss-proof capture. The body is read as a string FIRST and the DTO
    /// is deserialised from it, so fields we do not bind survive in the literal.
    /// Returns the <c>default</c> <c>(null, null)</c> tuple on transport failure,
    /// timeout, malformed JSON, non-success status, or a non-JSON Content-Type.
    /// </summary>
    public async Task<PerenualSpeciesFetch> GetSpeciesDetailsWithLiteralAsync(int perenualId, CancellationToken ct)
    {
        var url = $"species/details/{perenualId}?key={Uri.EscapeDataString(_apiKey)}";
        try
        {
            using var response = await _http.GetAsync(url, ct);
            // Preserve the documented null-on-non-success contract: a 404
            // (deleted species / wrong id) throws HttpRequestException here,
            // caught below.
            response.EnsureSuccessStatusCode();

            // D5: Content-Type pre-check to discriminate "deleted id" (HTML
            // response) from a genuine API-broken state. Perenual's bug at ids
            // >=8574 causes deleted ids to return 200 OK with an HTML error body
            // (Phase 1 Postman audit). A 2xx-non-JSON body is TERMINAL — the id is
            // genuinely gone — distinct from a transient outage (SMA-94).
            var contentType = response.Content.Headers.ContentType?.MediaType;
            if (!string.Equals(contentType, "application/json", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning(
                    "Perenual returned non-JSON content-type '{ContentType}' for species id {SpeciesId} (likely deleted id, see PR B). Treating as terminal no-body.",
                    contentType ?? "(none)",
                    perenualId);
                return new PerenualSpeciesFetch(null, null, PerenualFetchOutcome.TerminalNoBody);
            }

            // Read the literal body FIRST, then deserialise from the string. The
            // API key is scrubbed before the body leaves this method so the secret
            // never reaches PlantPerenualData.LiteralResponseJson — Perenual echoes
            // it inside the care_guides / hardiness_location URLs.
            var rawBody = await response.Content.ReadAsStringAsync(ct);
            var species = JsonSerializer.Deserialize<PerenualSpeciesResponse>(rawBody, WebJsonOptions);
            var literal = PerenualKeyRedactor.Redact(rawBody, _apiKey);
            return new PerenualSpeciesFetch(species, literal, PerenualFetchOutcome.Success);
        }
        // Every exception path is TRANSIENT (transport/5xx/timeout/malformed):
        // the resource is not proven gone, so callers must be free to retry
        // rather than burn a permanent skip (SMA-94).
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Perenual species fetch transport failure for id {Id}", perenualId);
            return new PerenualSpeciesFetch(null, null, PerenualFetchOutcome.TransientFailure);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Perenual species fetch returned malformed JSON for id {Id}", perenualId);
            return new PerenualSpeciesFetch(null, null, PerenualFetchOutcome.TransientFailure);
        }
        catch (NotSupportedException ex)
        {
            _logger.LogWarning(ex, "Perenual species fetch returned unsupported content for id {Id}", perenualId);
            return new PerenualSpeciesFetch(null, null, PerenualFetchOutcome.TransientFailure);
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Perenual species fetch timed out for id {Id}", perenualId);
            return new PerenualSpeciesFetch(null, null, PerenualFetchOutcome.TransientFailure);
        }
        catch (TimeoutRejectedException ex)
        {
            _logger.LogWarning(ex, "Perenual species fetch hit resilience-handler timeout for id {Id}", perenualId);
            return new PerenualSpeciesFetch(null, null, PerenualFetchOutcome.TransientFailure);
        }
    }

    /// <summary>
    /// Calls <c>/species-care-guide-list?key=...&amp;species_id={id}</c> (this
    /// endpoint lives at <c>/api/</c>, NOT under the <c>/api/v2/</c> base) and
    /// returns the verbatim response body with the API key redacted — the SMA-71
    /// capture of Perenual's per-species pruning/sunlight/watering care sections,
    /// which the rest of the ETL never consumes. Additive and NON-FATAL: the
    /// returned <see cref="PerenualCareGuideFetch.LiteralJson"/> is <c>null</c> on
    /// any miss, so a care-guide miss never blocks the primary enrichment write.
    /// The <see cref="PerenualCareGuideFetch.Outcome"/> distinguishes a 2xx-non-JSON
    /// terminal miss from a transient one (SMA-94) so the raw-cache aspiration can
    /// retry the latter.
    /// </summary>
    public async Task<PerenualCareGuideFetch> GetCareGuideLiteralAsync(int speciesId, CancellationToken ct)
    {
        var url = new Uri(ApiRootV1, $"species-care-guide-list?key={Uri.EscapeDataString(_apiKey)}&species_id={speciesId}");
        try
        {
            using var response = await _http.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            var contentType = response.Content.Headers.ContentType?.MediaType;
            if (!string.Equals(contentType, "application/json", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning(
                    "Perenual care-guide returned non-JSON content-type '{ContentType}' for species id {SpeciesId}; terminal no-body (non-fatal).",
                    contentType ?? "(none)",
                    speciesId);
                return new PerenualCareGuideFetch(PerenualFetchOutcome.TerminalNoBody, null);
            }

            var rawBody = await response.Content.ReadAsStringAsync(ct);
            var literal = PerenualKeyRedactor.Redact(rawBody, _apiKey);

            // The care-guide body is stored verbatim (not deserialised), so verify
            // it is well-formed JSON before returning — the column is jsonb and a
            // malformed insert would roll back the whole enrichment transaction. A
            // malformed body is treated as TRANSIENT (a re-fetch may return clean
            // JSON) rather than terminal.
            try
            {
                using var _ = JsonDocument.Parse(literal);
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Perenual care-guide body was not valid JSON for species id {SpeciesId}; transient (non-fatal).", speciesId);
                return new PerenualCareGuideFetch(PerenualFetchOutcome.TransientFailure, null);
            }

            return new PerenualCareGuideFetch(PerenualFetchOutcome.Success, literal);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Perenual care-guide transport failure for species id {Id}", speciesId);
            return new PerenualCareGuideFetch(PerenualFetchOutcome.TransientFailure, null);
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Perenual care-guide timed out for species id {Id}", speciesId);
            return new PerenualCareGuideFetch(PerenualFetchOutcome.TransientFailure, null);
        }
        catch (TimeoutRejectedException ex)
        {
            _logger.LogWarning(ex, "Perenual care-guide hit resilience-handler timeout for species id {Id}", speciesId);
            return new PerenualCareGuideFetch(PerenualFetchOutcome.TransientFailure, null);
        }
    }

    /// <summary>
    /// Calls <c>/species-list?key=...&amp;page={page}</c> (catalog enumeration
    /// path, SMA-13 batch 2 scale-up) and returns only the parsed DTO — a thin
    /// wrapper over <see cref="GetSpeciesListWithLiteralAsync"/> so the request,
    /// Content-Type guard (the off-by-one ≥8574 HTML responses, PR #76), and
    /// failure handling stay single-sourced (parallels how
    /// <see cref="GetSpeciesDetailsAsync"/> delegates). Returns <c>null</c> on
    /// transport failure, timeout, malformed JSON, non-success status, or a
    /// non-JSON Content-Type.
    /// </summary>
    public async Task<PerenualSpeciesListResponse?> GetSpeciesListAsync(int page, CancellationToken ct)
        => (await GetSpeciesListWithLiteralAsync(page, ct)).List;

    /// <summary>
    /// Calls <c>/species-list?key=...&amp;page={page}</c> and returns BOTH the parsed
    /// <see cref="PerenualSpeciesListResponse"/> and the verbatim HTTP body with the
    /// API key redacted (<see cref="PerenualSpeciesListFetch.LiteralJson"/>) — the
    /// SMA-93 raw-cache capture. The body is read as a string FIRST and deserialised
    /// from it, so the page is preserved byte-for-byte. Returns the <c>default</c>
    /// <c>(null, null)</c> tuple on transport failure, timeout, malformed JSON,
    /// non-success status, or a non-JSON Content-Type.
    /// </summary>
    public async Task<PerenualSpeciesListFetch> GetSpeciesListWithLiteralAsync(int page, CancellationToken ct)
    {
        var url = $"species-list?key={Uri.EscapeDataString(_apiKey)}&page={page}";
        try
        {
            using var response = await _http.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            var contentType = response.Content.Headers.ContentType?.MediaType;
            if (!string.Equals(contentType, "application/json", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning(
                    "Perenual returned non-JSON content-type '{ContentType}' for species-list page {Page}. Terminal no-body.",
                    contentType ?? "(none)", page);
                return new PerenualSpeciesListFetch(null, null, PerenualFetchOutcome.TerminalNoBody);
            }

            // Read the literal body FIRST, then deserialise from it. The key is
            // scrubbed before the body leaves this method — species-list has no key
            // in its body today, but the redaction contract is uniform with #102.
            var rawBody = await response.Content.ReadAsStringAsync(ct);
            var list = JsonSerializer.Deserialize<PerenualSpeciesListResponse>(rawBody, WebJsonOptions);
            var literal = PerenualKeyRedactor.Redact(rawBody, _apiKey);
            return new PerenualSpeciesListFetch(list, literal, PerenualFetchOutcome.Success);
        }
        // Exception paths are TRANSIENT — the page is not proven gone (SMA-94).
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Perenual species-list transport failure for page {Page}", page);
            return new PerenualSpeciesListFetch(null, null, PerenualFetchOutcome.TransientFailure);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Perenual species-list returned malformed JSON for page {Page}", page);
            return new PerenualSpeciesListFetch(null, null, PerenualFetchOutcome.TransientFailure);
        }
        catch (NotSupportedException ex)
        {
            _logger.LogWarning(ex, "Perenual species-list returned unsupported content for page {Page}", page);
            return new PerenualSpeciesListFetch(null, null, PerenualFetchOutcome.TransientFailure);
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Perenual species-list timed out for page {Page}", page);
            return new PerenualSpeciesListFetch(null, null, PerenualFetchOutcome.TransientFailure);
        }
        catch (TimeoutRejectedException ex)
        {
            _logger.LogWarning(ex, "Perenual species-list hit resilience-handler timeout for page {Page}", page);
            return new PerenualSpeciesListFetch(null, null, PerenualFetchOutcome.TransientFailure);
        }
    }

    /// <summary>
    /// Calls <c>/api/pest-disease-list?key=...&amp;page={page}</c> (the <c>/api/</c>
    /// v1-level endpoint, like the care guide) and returns one redacted page of
    /// the global pest/disease catalogue (SMA-71 PR2). The body is read as a
    /// string, the API key is redacted, then parsed: <c>last_page</c> drives
    /// pagination and each <c>data[]</c> item is surfaced with its verbatim
    /// (redacted) JSON via <see cref="JsonElement.GetRawText"/>. Returns
    /// <c>null</c> on transport failure, timeout, non-success status, non-JSON
    /// Content-Type, or malformed JSON.
    /// </summary>
    public async Task<PerenualPestPage?> GetPestDiseaseListAsync(int page, CancellationToken ct)
    {
        var url = new Uri(ApiRootV1, $"pest-disease-list?key={Uri.EscapeDataString(_apiKey)}&page={page}");
        try
        {
            using var response = await _http.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            var contentType = response.Content.Headers.ContentType?.MediaType;
            if (!string.Equals(contentType, "application/json", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning(
                    "Perenual pest-disease-list returned non-JSON content-type '{ContentType}' for page {Page}; treating as failure.",
                    contentType ?? "(none)", page);
                return null;
            }

            // Read the literal body, redact the key (defence-in-depth — this body
            // has none today, but the contract is uniform), then parse the
            // REDACTED text so the per-item GetRawText() is already scrubbed.
            var rawBody = await response.Content.ReadAsStringAsync(ct);
            var redacted = PerenualKeyRedactor.Redact(rawBody, _apiKey);

            using var doc = JsonDocument.Parse(redacted);
            var root = doc.RootElement;
            int lastPage;
            if (root.TryGetProperty("last_page", out var lp) && lp.TryGetInt32(out var lpVal))
            {
                lastPage = lpVal;
            }
            else
            {
                // No parseable last_page → the harvest loop would treat this as a
                // single-page catalogue and silently truncate. Leave a breadcrumb.
                lastPage = page;
                _logger.LogWarning(
                    "Perenual pest-disease-list page {Page} omitted a parseable 'last_page'; falling back to single-page — harvest may truncate.",
                    page);
            }

            var items = new List<PerenualPestCatalogEntry>();
            if (root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in data.EnumerateArray())
                {
                    if (el.ValueKind != JsonValueKind.Object) continue;
                    // Skip entries with no usable natural key.
                    if (!(el.TryGetProperty("id", out var idEl) && idEl.TryGetInt32(out var id))) continue;
                    items.Add(new PerenualPestCatalogEntry(
                        PerenualPestId: id,
                        CommonName: GetStringOrNull(el, "common_name"),
                        ScientificName: GetStringOrNull(el, "scientific_name"),
                        LiteralJson: el.GetRawText()));
                }
            }

            _logger.LogInformation(
                "Perenual pest-disease-list page {Page}: lastPage={LastPage} items={Count}",
                page, lastPage, items.Count);
            return new PerenualPestPage(lastPage, items);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Perenual pest-disease-list transport failure for page {Page}", page);
            return null;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Perenual pest-disease-list returned malformed JSON for page {Page}", page);
            return null;
        }
        catch (NotSupportedException ex)
        {
            _logger.LogWarning(ex, "Perenual pest-disease-list returned unsupported content for page {Page}", page);
            return null;
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Perenual pest-disease-list timed out for page {Page}", page);
            return null;
        }
        catch (TimeoutRejectedException ex)
        {
            _logger.LogWarning(ex, "Perenual pest-disease-list hit resilience-handler timeout for page {Page}", page);
            return null;
        }
    }

    private static string? GetStringOrNull(JsonElement element, string propertyName)
        => element.TryGetProperty(propertyName, out var p) && p.ValueKind == JsonValueKind.String
            ? p.GetString()
            : null;
}

/// <summary>
/// Classifies the terminal disposition of a Perenual literal fetch (SMA-94):
/// whether a missing body means the resource is GENUINELY gone or the fetch
/// merely failed transiently and should be retried. Lets the raw-cache
/// aspiration persist a permanent "no body" skip ONLY for terminal cases, so a
/// transient outage can never burn a permanent cache hole.
/// </summary>
public enum PerenualFetchOutcome
{
    /// <summary>2xx + JSON body parsed and captured.</summary>
    Success,

    /// <summary>
    /// 2xx with a non-JSON (HTML) body — the resource is genuinely gone (the
    /// deleted-id ≥8574 placeholder). Safe to record as a permanent skip.
    /// </summary>
    TerminalNoBody,

    /// <summary>
    /// Transport failure / 5xx / timeout / malformed body — NOT proven gone.
    /// Callers must retry rather than write a skip row.
    /// </summary>
    TransientFailure,
}

/// <summary>
/// Result of <see cref="PerenualClient.GetSpeciesDetailsWithLiteralAsync"/>:
/// the parsed DTO plus the verbatim, key-redacted HTTP body. <see cref="Species"/>
/// and <see cref="LiteralJson"/> stay <c>null</c> on every non-<see cref="PerenualFetchOutcome.Success"/>
/// path, so existing callers branch on <see cref="Species"/> exactly as before;
/// <see cref="Outcome"/> is the SMA-94 addition for callers that must tell a
/// terminal miss from a transient one.
/// </summary>
/// <param name="Species">Parsed species response, or <c>null</c> on no-match/failure.</param>
/// <param name="LiteralJson">Verbatim response body, API key redacted, or <c>null</c>.</param>
/// <param name="Outcome">Terminal disposition (SMA-94).</param>
public readonly record struct PerenualSpeciesFetch(
    PerenualSpeciesResponse? Species, string? LiteralJson, PerenualFetchOutcome Outcome);

/// <summary>
/// Result of <see cref="PerenualClient.GetSpeciesListWithLiteralAsync"/> (SMA-93):
/// the parsed list page plus the verbatim, key-redacted HTTP body. <see cref="List"/>
/// and <see cref="LiteralJson"/> stay <c>null</c> on every non-Success path;
/// <see cref="Outcome"/> is the SMA-94 terminal/transient discriminator.
/// </summary>
/// <param name="List">Parsed species-list page, or <c>null</c> on failure.</param>
/// <param name="LiteralJson">Verbatim page body, API key redacted, or <c>null</c>.</param>
/// <param name="Outcome">Terminal disposition (SMA-94).</param>
public readonly record struct PerenualSpeciesListFetch(
    PerenualSpeciesListResponse? List, string? LiteralJson, PerenualFetchOutcome Outcome);

/// <summary>
/// Result of <see cref="PerenualClient.GetCareGuideLiteralAsync"/> (SMA-94): the
/// verbatim, key-redacted care-guide body (<c>null</c> on any non-Success path)
/// plus its terminal/transient <see cref="Outcome"/>. The care guide was a bare
/// <c>string?</c> before; it is wrapped here so the raw-cache aspiration can
/// distinguish a genuinely-absent guide from a transient miss.
/// </summary>
/// <param name="Outcome">Terminal disposition (SMA-94).</param>
/// <param name="LiteralJson">Verbatim care-guide body, API key redacted, or <c>null</c>.</param>
public readonly record struct PerenualCareGuideFetch(PerenualFetchOutcome Outcome, string? LiteralJson);
