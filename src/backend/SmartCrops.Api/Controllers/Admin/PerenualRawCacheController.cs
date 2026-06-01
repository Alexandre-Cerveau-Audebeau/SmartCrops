using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.ExternalApis.Perenual;

namespace SmartCrops.Api.Controllers.Admin;

/// <summary>
/// SMA-93 — fills the shape-agnostic <see cref="PerenualRawCache"/> by aspirating
/// the Perenual catalogue (species-list pages, then per-species details + care
/// guides) ahead of the Supreme cancel. DECOUPLED: creates no <c>Plant</c> and
/// touches neither GBIF nor Trefle. The pest catalogue is already fully captured
/// in <c>PerenualPestCatalog</c>, so it is out of scope here.
///
/// <para>The capture is chunked and resumable: a single POST processes up to
/// <c>limit</c> resources past <c>afterId</c>, paces requests under the Perenual
/// quota, and returns a <c>nextCursor</c> the driver advances. Idempotent — an
/// already-cached resource is skipped unless <c>force=true</c>. Every captured
/// body passes <see cref="PerenualKeyRedactor.AssertRedacted"/> before it is
/// stored, so a redaction regression can never make a key durable.</para>
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Admin)]
[Route("api/admin/perenual")]
public class PerenualRawCacheController : ControllerBase
{
    private const string ListEndpoint = "species-list";
    private const string DetailsEndpoint = "species-details";
    private const string CareGuideEndpoint = "care-guide";

    // Sentinel HttpStatus for "fetch returned no usable body" (deleted id ≥8574
    // serving HTML, or a transport failure) — recorded so the resource is not
    // re-fetched on the next pass.
    private const int NoBodyStatus = 0;

    private readonly SmartCropsDbContext _db;
    private readonly PerenualClient _client;
    private readonly ILogger<PerenualRawCacheController> _logger;

    public PerenualRawCacheController(
        SmartCropsDbContext db,
        PerenualClient client,
        ILogger<PerenualRawCacheController> logger)
    {
        _db = db;
        _client = client;
        _logger = logger;
    }

    /// <summary>
    /// Capture one chunk of a phase into <see cref="PerenualRawCache"/>.
    /// <list type="bullet">
    ///   <item><c>phase=list</c> — fetch species-list pages (cache key = page).</item>
    ///   <item><c>phase=details</c> — fetch <c>/species/details/{id}</c> for the real
    ///   ids enumerated from the cached list pages (cache key = id).</item>
    ///   <item><c>phase=careguide</c> — fetch the care guide for the same ids.</item>
    /// </list>
    /// Counts-only response; the cached bodies are internal/audit and never returned.
    /// </summary>
    /// <param name="phase">"list", "details", or "careguide".</param>
    /// <param name="limit">Max resources to process this chunk (default 200).</param>
    /// <param name="afterId">Keyset cursor: process pages/ids strictly greater than this.</param>
    /// <param name="delayMs">Polite pacing between API calls (default 700ms).</param>
    /// <param name="force">Re-fetch and overwrite already-cached resources.</param>
    [HttpPost("cache-catalog")]
    public async Task<ActionResult<CacheCatalogResponse>> CacheCatalog(
        [FromQuery] string phase,
        [FromQuery] int limit = 200,
        [FromQuery] int? afterId = null,
        [FromQuery] int delayMs = 700,
        [FromQuery] bool force = false,
        CancellationToken ct = default)
    {
        return phase?.ToLowerInvariant() switch
        {
            "list" => Ok(await CacheListAsync(afterId, limit, delayMs, force, ct)),
            "details" => Ok(await CacheBySpeciesIdAsync(DetailsEndpoint, afterId ?? 0, limit, delayMs, force, ct)),
            "careguide" => Ok(await CacheBySpeciesIdAsync(CareGuideEndpoint, afterId ?? 0, limit, delayMs, force, ct)),
            _ => BadRequest("phase must be one of: list, details, careguide."),
        };
    }

    // ── phase=list ─────────────────────────────────────────────────────────

    private async Task<CacheCatalogResponse> CacheListAsync(
        int? afterPage, int limit, int delayMs, bool force, CancellationToken ct)
    {
        int processed = 0, cached = 0, htmlSkipped = 0, failures = 0;
        int? lastPage = null;
        var start = (afterPage ?? 0) + 1;

        // nextCursor = the page the next chunk resumes PAST; null once the end
        // (last_page) is reached. Seeded with the input cursor so a failure before
        // any progress still re-points the next chunk at this chunk's first page.
        int? nextCursor = afterPage;
        var reachedEnd = false;

        for (var page = start; page - start < limit; page++)
        {
            ct.ThrowIfCancellationRequested();
            var stop = false;

            try
            {
                var existing = await FindAsync(ListEndpoint, page.ToString(), ct);
                if (existing is { RawJson: not null } && !force)
                {
                    cached++;
                    nextCursor = page;
                    lastPage ??= ExtractLastPage(existing.RawJson); // learn the bound even when skipping
                    if (lastPage is int lpc && page >= lpc) { reachedEnd = true; break; }
                    continue;
                }

                var fetch = await _client.GetSpeciesListWithLiteralAsync(page, ct);
                switch (fetch.Outcome)
                {
                    case PerenualFetchOutcome.Success:
                        PerenualKeyRedactor.AssertRedacted(fetch.LiteralJson, "PerenualRawCache.species-list");
                        await UpsertAsync(ListEndpoint, page.ToString(), fetch.LiteralJson, 200, ct);
                        processed++;
                        nextCursor = page;
                        lastPage = fetch.List!.LastPage ?? lastPage;
                        await PaceAsync(delayMs, ct);
                        // End is detected from the RESPONSE BODY's last_page, so the
                        // loop terminates ON the last page and never fetches
                        // last_page+1 (SMA-94: no march-past-end / infinite resume).
                        if (lastPage is int lp && page >= lp) { reachedEnd = true; }
                        break;

                    case PerenualFetchOutcome.TerminalNoBody:
                        // A genuinely-gone page (rare for list). Record + advance.
                        await UpsertAsync(ListEndpoint, page.ToString(), null, NoBodyStatus, ct);
                        htmlSkipped++;
                        nextCursor = page;
                        await PaceAsync(delayMs, ct);
                        break;

                    case PerenualFetchOutcome.TransientFailure:
                        // Write no skip row and do NOT advance past this page — the
                        // next chunk must retry it. Resume so its start == page.
                        failures++;
                        nextCursor = page - 1;
                        stop = true;
                        break;
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Defensive: an unexpected throw (AssertRedacted / DB) is transient —
                // count it, write nothing, and pin the resume at this page.
                failures++;
                _logger.LogError(ex, "Perenual raw-cache (list) failed for page {Page}", page);
                _db.ChangeTracker.Clear();
                nextCursor = page - 1;
                stop = true;
            }

            if (stop || reachedEnd) { break; }
        }

        return Log(new CacheCatalogResponse(
            "list", processed, cached, htmlSkipped, failures,
            reachedEnd ? null : nextCursor?.ToString()));
    }

    // ── phase=details / careguide ────────────────────────────────────────────

    private async Task<CacheCatalogResponse> CacheBySpeciesIdAsync(
        string endpoint, int afterId, int limit, int delayMs, bool force, CancellationToken ct)
    {
        var ids = await GetSpeciesIdsFromListCacheAsync(afterId, limit, ct);

        int processed = 0, cached = 0, htmlSkipped = 0, failures = 0;
        int? minTransientId = null; // smallest transient-failed id (ids are ascending)
        var maxId = afterId;        // largest id we are "done past"
        var failedIds = new List<int>(); // SMA-100: transient ids this chunk, for the driver's stall guard

        foreach (var id in ids)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var existing = await FindAsync(endpoint, id.ToString(), ct);
                if (existing is not null && !force)
                {
                    // Already captured (Success or terminal no-body). Transient
                    // failures NEVER write a row, so an existing row is genuinely done.
                    cached++;
                    maxId = id;
                    continue;
                }

                var (outcome, literal, httpStatus) = endpoint == DetailsEndpoint
                    ? await FetchDetailsAsync(id, ct)
                    : await FetchCareGuideAsync(id, ct);

                switch (outcome)
                {
                    case PerenualFetchOutcome.Success:
                        PerenualKeyRedactor.AssertRedacted(literal, $"PerenualRawCache.{endpoint}");
                        await UpsertAsync(endpoint, id.ToString(), literal, 200, ct);
                        processed++;
                        maxId = id;
                        break;

                    case PerenualFetchOutcome.TerminalNoBody:
                        // Genuinely gone — a permanent skip is wanted so the cursor
                        // advances past it. SMA-100: record the REAL status (404/410
                        // for an id-space gap), falling back to the NoBody sentinel (0)
                        // for the 200+HTML deleted-id placeholder, so the two are
                        // distinguishable in the cache for audit.
                        await UpsertAsync(endpoint, id.ToString(), null, httpStatus ?? NoBodyStatus, ct);
                        htmlSkipped++;
                        maxId = id;
                        break;

                    case PerenualFetchOutcome.TransientFailure:
                        // Write NOTHING (no skip row) so the id stays re-fetchable, and
                        // remember the smallest failed id so the cursor never jumps past it.
                        failures++;
                        minTransientId ??= id;
                        failedIds.Add(id);
                        break;
                }

                await PaceAsync(delayMs, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Defensive: an unexpected throw is transient — count it, keep the id
                // re-fetchable (no skip row), and pin the resume below it.
                failures++;
                minTransientId ??= id;
                failedIds.Add(id);
                _logger.LogError(ex, "Perenual raw-cache ({Endpoint}) failed for id {Id}", endpoint, id);
                _db.ChangeTracker.Clear();
            }
        }

        // RESUME INVARIANT (SMA-94): never skip a transient-failed id. If any failed,
        // resume just BELOW the smallest failed id — already-cached higher ids
        // re-visit as idempotent skips (a cheap DB check, no re-fetch). Otherwise
        // advance past the largest id handled. Empty chunk ⇒ end (null).
        int? nextCursor = ids.Count == 0
            ? null
            : (minTransientId is int mt ? mt - 1 : maxId);

        return Log(new CacheCatalogResponse(
            endpoint == DetailsEndpoint ? "details" : "careguide",
            processed, cached, htmlSkipped, failures, nextCursor?.ToString(),
            failedIds.Count > 0 ? failedIds : null));
    }

    private async Task<(PerenualFetchOutcome Outcome, string? Literal, int? HttpStatus)> FetchDetailsAsync(int id, CancellationToken ct)
    {
        var fetch = await _client.GetSpeciesDetailsWithLiteralAsync(id, ct);
        return (fetch.Outcome, fetch.LiteralJson, fetch.HttpStatus);
    }

    private async Task<(PerenualFetchOutcome Outcome, string? Literal, int? HttpStatus)> FetchCareGuideAsync(int id, CancellationToken ct)
    {
        var fetch = await _client.GetCareGuideLiteralAsync(id, ct);
        return (fetch.Outcome, fetch.LiteralJson, fetch.HttpStatus);
    }

    /// <summary>
    /// Enumerate the REAL Perenual species ids from the cached <c>species-list</c>
    /// pages (<c>data[].id</c>), de-duplicated, ordered, strictly greater than
    /// <paramref name="afterId"/>, capped at <paramref name="limit"/>. Using the
    /// cached ids (not 1..total) skips the deleted-id gaps ≥8574 that serve HTML.
    /// </summary>
    private async Task<List<int>> GetSpeciesIdsFromListCacheAsync(int afterId, int limit, CancellationToken ct)
    {
        var pages = await _db.PerenualRawCache
            .Where(c => c.Endpoint == ListEndpoint && c.RawJson != null)
            .Select(c => c.RawJson!)
            .ToListAsync(ct);

        var ids = new SortedSet<int>();
        foreach (var raw in pages)
        {
            try
            {
                using var doc = JsonDocument.Parse(raw);
                if (doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in data.EnumerateArray())
                    {
                        if (el.ValueKind == JsonValueKind.Object
                            && el.TryGetProperty("id", out var idEl)
                            && idEl.TryGetInt32(out var id)
                            && id > afterId)
                        {
                            ids.Add(id);
                        }
                    }
                }
            }
            catch (JsonException)
            {
                // A malformed cached page is skipped — the others still drive ids.
            }
        }

        return ids.Take(limit).ToList();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private Task<PerenualRawCache?> FindAsync(string endpoint, string resourceId, CancellationToken ct)
        => _db.PerenualRawCache.FirstOrDefaultAsync(
            c => c.Endpoint == endpoint && c.ResourceId == resourceId, ct);

    /// <summary>Per-resource unit of work (resumable): upsert on (Endpoint, ResourceId) and save.</summary>
    private async Task UpsertAsync(string endpoint, string resourceId, string? rawJson, int httpStatus, CancellationToken ct)
    {
        var existing = await FindAsync(endpoint, resourceId, ct);
        if (existing is null)
        {
            _db.PerenualRawCache.Add(new PerenualRawCache
            {
                Endpoint = endpoint,
                ResourceId = resourceId,
                RawJson = rawJson,
                HttpStatus = httpStatus,
                FetchedAt = DateTime.UtcNow,
            });
        }
        else
        {
            existing.RawJson = rawJson;
            existing.HttpStatus = httpStatus;
            existing.FetchedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
    }

    private static int? ExtractLastPage(string? rawJson)
    {
        if (string.IsNullOrEmpty(rawJson))
        {
            return null;
        }
        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            return doc.RootElement.TryGetProperty("last_page", out var lp) && lp.TryGetInt32(out var v) ? v : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static async Task PaceAsync(int delayMs, CancellationToken ct)
    {
        if (delayMs > 0 && !ct.IsCancellationRequested)
        {
            await Task.Delay(delayMs, ct);
        }
    }

    private CacheCatalogResponse Log(CacheCatalogResponse r)
    {
        _logger.LogInformation(
            "Perenual raw-cache chunk: phase={Phase} processed={Processed} cached={Cached} htmlSkipped={HtmlSkipped} failures={Failures} nextCursor={NextCursor}",
            r.Phase, r.Processed, r.Cached, r.HtmlSkipped, r.Failures, r.NextCursor ?? "(end)");
        return r;
    }

    /// <summary>
    /// SMA-93 raw-cache chunk summary. Counts only (plus the transient id list) —
    /// never the cached bodies.
    /// <c>Processed</c> = freshly fetched + stored; <c>Cached</c> = skipped because
    /// already cached (idempotent); <c>HtmlSkipped</c> = fetches with no usable body
    /// (deleted-id HTML / 404 gap), recorded so they aren't retried;
    /// <c>Failures</c> = transient failures (no row written, id stays re-fetchable);
    /// <c>NextCursor</c> = last page/id processed (null when the phase is exhausted);
    /// <c>FailedIds</c> = SMA-100: the transient ids this chunk (ids only, never
    /// bodies/keys) so the driver can name the blockers when its stall guard trips.
    /// Null for the list phase and whenever there were no transient failures.
    /// </summary>
    public record CacheCatalogResponse(
        string Phase,
        int Processed,
        int Cached,
        int HtmlSkipped,
        int Failures,
        string? NextCursor,
        IReadOnlyList<int>? FailedIds = null);
}
