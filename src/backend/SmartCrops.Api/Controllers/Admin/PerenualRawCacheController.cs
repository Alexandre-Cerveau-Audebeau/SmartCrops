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

    // SMA-103: per-id pacing floor for the revisit drain. These are the ids that
    // failed transiently under the forward sweep's faster pacing (a throttled /
    // truncated cluster), so the drain deliberately spaces them out more — well
    // above the forward sweep's default delay — regardless of the delayMs the
    // driver passes. The long inter-PASS backoffs (30s/2m/10m) live in the driver.
    private const int RevisitDelayFloorMs = 1500;

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
    public async Task<IActionResult> CacheCatalog(
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
            // SMA-103: drain the persisted revisit queue for one endpoint, one id at a
            // time with a higher per-id pacing floor (these are throttle-sensitive ids).
            "revisit-details" => Ok(await DrainRevisitAsync(DetailsEndpoint, limit, delayMs, ct)),
            "revisit-careguide" => Ok(await DrainRevisitAsync(CareGuideEndpoint, limit, delayMs, ct)),
            _ => BadRequest("phase must be one of: list, details, careguide, revisit-details, revisit-careguide."),
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
        var maxId = afterId;        // largest id handled — advances on EVERY outcome (SMA-103)
        var failedIds = new List<int>(); // transient ids this chunk, surfaced for the driver's breaker + run report

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
                        // SMA-103 skip-and-revisit: write NOTHING to the cache (no-loss — an
                        // id is never recorded as "absent" on a transient fault), QUEUE it
                        // for a spaced revisit pass, and let the cursor ADVANCE past it
                        // (maxId = id below). This stops the forward sweep from re-hammering
                        // a throttled cluster (the #111 cursor pin) so the phase completes;
                        // the id is drained later, or re-fetched for free on a future forward
                        // sweep (no cache row ⇒ re-included).
                        failures++;
                        failedIds.Add(id);
                        maxId = id;
                        await EnqueueRevisitAsync(endpoint, id, httpStatus, ct);
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
                // re-fetchable (no skip row), advance past it, and queue it for a revisit.
                // Clear the tracker FIRST so the failed unit of work is discarded, then
                // enqueue as its own clean unit of work.
                failures++;
                failedIds.Add(id);
                maxId = id;
                _logger.LogError(ex, "Perenual raw-cache ({Endpoint}) failed for id {Id}", endpoint, id);
                _db.ChangeTracker.Clear();
                await EnqueueRevisitAsync(endpoint, id, null, ct);
            }
        }

        // SMA-103 cursor invariant: ALWAYS advance past the largest id handled,
        // regardless of outcome — a transient id is accounted for via the revisit
        // queue, not by pinning the sweep (the #111 pin re-hammered the throttled
        // cluster and never completed). Empty chunk ⇒ phase exhausted (null).
        int? nextCursor = ids.Count == 0 ? null : maxId;

        return Log(new CacheCatalogResponse(
            endpoint == DetailsEndpoint ? "details" : "careguide",
            processed, cached, htmlSkipped, failures, nextCursor?.ToString(),
            failedIds.Count > 0 ? failedIds : null));
    }

    // ── phase=revisit-details / revisit-careguide (SMA-103) ────────────────────

    /// <summary>
    /// Drain the persisted <see cref="PerenualRevisitQueue"/> for one endpoint:
    /// re-fetch each still-pending id (<c>ResolvedAt IS NULL</c>) ONE AT A TIME with a
    /// per-id pacing floor well above the forward sweep's (these are the
    /// throttle-sensitive ids). A success writes the cache row AND marks the queue row
    /// resolved; a real 404/410 records a terminal cache row AND resolves; a transient
    /// failure just bumps the attempt and leaves the row pending for a later pass (the
    /// driver spaces K passes with 30s/2m/10m backoff). Counts-only response; the ids
    /// still pending after this chunk are surfaced in <c>FailedIds</c>.
    /// </summary>
    private async Task<RevisitDrainResponse> DrainRevisitAsync(string endpoint, int limit, int delayMs, CancellationToken ct)
    {
        var pacing = Math.Max(delayMs, RevisitDelayFloorMs);
        var phase = endpoint == DetailsEndpoint ? "revisit-details" : "revisit-careguide";

        // The pending set is the (tiny) throttled cluster; re-materialise it cheaply
        // each pass, oldest-seen first so a long-stuck id is retried before newcomers.
        var pending = await _db.PerenualRevisitQueue
            .Where(q => q.Endpoint == endpoint && q.ResolvedAt == null)
            .OrderBy(q => q.FirstSeenAt).ThenBy(q => q.Id)
            .Take(limit)
            .ToListAsync(ct);

        int drained = 0, resolved = 0;
        var stillFailing = new List<int>();

        foreach (var entry in pending)
        {
            ct.ThrowIfCancellationRequested();

            if (!int.TryParse(entry.ResourceId, out var id))
            {
                // Should never happen — the queue only holds numeric species ids. Leave
                // it pending rather than spin; it surfaces in the stillPending count.
                _logger.LogWarning(
                    "Perenual revisit ({Endpoint}) skipping non-numeric queued resourceId '{ResourceId}'.",
                    endpoint, entry.ResourceId);
                continue;
            }

            drained++;
            try
            {
                var (outcome, literal, httpStatus) = endpoint == DetailsEndpoint
                    ? await FetchDetailsAsync(id, ct)
                    : await FetchCareGuideAsync(id, ct);

                switch (outcome)
                {
                    case PerenualFetchOutcome.Success:
                        PerenualKeyRedactor.AssertRedacted(literal, $"PerenualRawCache.{endpoint}");
                        await UpsertAsync(endpoint, entry.ResourceId, literal, 200, ct);
                        await MarkRevisitResolvedAsync(endpoint, entry.ResourceId, 200, null, ct);
                        resolved++;
                        break;

                    case PerenualFetchOutcome.TerminalNoBody:
                        await UpsertAsync(endpoint, entry.ResourceId, null, httpStatus ?? NoBodyStatus, ct);
                        await MarkRevisitResolvedAsync(endpoint, entry.ResourceId, httpStatus ?? NoBodyStatus, null, ct);
                        resolved++;
                        break;

                    case PerenualFetchOutcome.TransientFailure:
                        // Still failing — bump the attempt, leave ResolvedAt null so a
                        // later pass (or a future forward sweep) retries it. No-loss.
                        await BumpRevisitAttemptAsync(endpoint, entry.ResourceId, httpStatus, ct);
                        stillFailing.Add(id);
                        break;
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Defensive: an unexpected throw is transient — bump and leave pending.
                // Clear the failed unit of work first, then bump as its own clean one.
                _logger.LogError(ex, "Perenual revisit ({Endpoint}) failed for id {Id}", endpoint, id);
                _db.ChangeTracker.Clear();
                await BumpRevisitAttemptAsync(endpoint, entry.ResourceId, null, ct);
                stillFailing.Add(id);
            }

            await PaceAsync(pacing, ct);
        }

        var stillPending = await _db.PerenualRevisitQueue
            .CountAsync(q => q.Endpoint == endpoint && q.ResolvedAt == null, ct);

        return LogRevisit(new RevisitDrainResponse(
            phase, drained, resolved, stillPending,
            stillFailing.Count > 0 ? stillFailing : null));
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

    // ── revisit queue (SMA-103) ────────────────────────────────────────────────

    /// <summary>
    /// Upsert a transiently-failed id into <see cref="PerenualRevisitQueue"/> (its own
    /// resumable unit of work). Insert with <c>Attempts=1</c>, or bump an existing row's
    /// attempt/diagnostics. ResolvedAt is (re-)set to null: an id we are enqueueing is, by
    /// definition, currently failing and pending a revisit.
    /// </summary>
    private async Task EnqueueRevisitAsync(string endpoint, int id, int? httpStatus, CancellationToken ct)
    {
        var resourceId = id.ToString();
        var now = DateTime.UtcNow;
        var error = DescribeTransient(httpStatus);

        var existing = await _db.PerenualRevisitQueue.FirstOrDefaultAsync(
            q => q.Endpoint == endpoint && q.ResourceId == resourceId, ct);
        if (existing is null)
        {
            _db.PerenualRevisitQueue.Add(new PerenualRevisitQueue
            {
                Endpoint = endpoint,
                ResourceId = resourceId,
                Attempts = 1,
                LastHttpStatus = httpStatus,
                LastError = error,
                FirstSeenAt = now,
                LastAttemptAt = now,
                ResolvedAt = null,
            });
        }
        else
        {
            existing.Attempts += 1;
            existing.LastAttemptAt = now;
            existing.LastHttpStatus = httpStatus;
            existing.LastError = error;
            existing.ResolvedAt = null;
        }
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Bump a queue row's attempt counter/diagnostics (re-query by key so it is
    /// robust to a cleared change-tracker). Leaves <c>ResolvedAt</c> null — still pending.</summary>
    private async Task BumpRevisitAttemptAsync(string endpoint, string resourceId, int? httpStatus, CancellationToken ct)
    {
        var row = await _db.PerenualRevisitQueue.FirstOrDefaultAsync(
            q => q.Endpoint == endpoint && q.ResourceId == resourceId, ct);
        if (row is null) { return; } // resolved/removed concurrently — nothing to bump
        row.Attempts += 1;
        row.LastAttemptAt = DateTime.UtcNow;
        row.LastHttpStatus = httpStatus;
        row.LastError = DescribeTransient(httpStatus);
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Mark a queue row resolved (captured or proven gone) during a revisit pass.
    /// Re-query by key so it is robust to a cleared change-tracker.</summary>
    private async Task MarkRevisitResolvedAsync(string endpoint, string resourceId, int? httpStatus, string? lastError, CancellationToken ct)
    {
        var row = await _db.PerenualRevisitQueue.FirstOrDefaultAsync(
            q => q.Endpoint == endpoint && q.ResourceId == resourceId, ct);
        if (row is null) { return; }
        var now = DateTime.UtcNow;
        row.Attempts += 1;
        row.LastAttemptAt = now;
        row.LastHttpStatus = httpStatus;
        row.LastError = lastError;
        row.ResolvedAt = now;
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Short, body-free diagnostic for a transient failure (never a body or key).</summary>
    private static string DescribeTransient(int? httpStatus)
        => httpStatus is int s
            ? $"TransientFailure (HTTP {s})"
            : "TransientFailure (no HTTP status: transport/timeout/malformed body)";

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
            "Perenual raw-cache chunk: phase={Phase} processed={Processed} cached={Cached} htmlSkipped={HtmlSkipped} failures={Failures} nextCursor={NextCursor} failedIds={FailedIds}",
            r.Phase, r.Processed, r.Cached, r.HtmlSkipped, r.Failures, r.NextCursor ?? "(end)",
            r.FailedIds is { Count: > 0 } ? string.Join(",", r.FailedIds) : "(none)");
        return r;
    }

    private RevisitDrainResponse LogRevisit(RevisitDrainResponse r)
    {
        _logger.LogInformation(
            "Perenual revisit drain: phase={Phase} drained={Drained} resolved={Resolved} stillPending={StillPending} failedIds={FailedIds}",
            r.Phase, r.Drained, r.Resolved, r.StillPending,
            r.FailedIds is { Count: > 0 } ? string.Join(",", r.FailedIds) : "(none)");
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

    /// <summary>
    /// SMA-103 revisit-drain chunk summary. Counts only (plus the still-pending id list).
    /// <c>Drained</c> = queue rows attempted this chunk; <c>Resolved</c> = captured or
    /// proven-gone this chunk (ResolvedAt set); <c>StillPending</c> = queue rows for this
    /// endpoint still unresolved AFTER the chunk; <c>FailedIds</c> = the ids that failed
    /// again this chunk (still pending — retried on a later pass / future forward sweep).
    /// </summary>
    public record RevisitDrainResponse(
        string Phase,
        int Drained,
        int Resolved,
        int StillPending,
        IReadOnlyList<int>? FailedIds = null);
}
