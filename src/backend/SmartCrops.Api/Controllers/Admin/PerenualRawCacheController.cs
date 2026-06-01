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
        int? nextCursor = null;
        var start = (afterPage ?? 0) + 1;

        for (var page = start; page - start < limit; page++)
        {
            ct.ThrowIfCancellationRequested();
            if (lastPage is int lp && page > lp)
            {
                nextCursor = null; // reached the end
                break;
            }

            try
            {
                var existing = await FindAsync(ListEndpoint, page.ToString(), ct);
                if (existing is { RawJson: not null } && !force)
                {
                    cached++;
                    nextCursor = page;
                    lastPage ??= ExtractLastPage(existing.RawJson); // learn the bound even when skipping
                    continue;
                }

                var fetch = await _client.GetSpeciesListWithLiteralAsync(page, ct);
                if (fetch.List is null)
                {
                    await UpsertAsync(ListEndpoint, page.ToString(), null, NoBodyStatus, ct);
                    htmlSkipped++;
                    nextCursor = page;
                }
                else
                {
                    PerenualKeyRedactor.AssertRedacted(fetch.LiteralJson, "PerenualRawCache.species-list");
                    await UpsertAsync(ListEndpoint, page.ToString(), fetch.LiteralJson, 200, ct);
                    lastPage ??= fetch.List.LastPage;
                    processed++;
                    nextCursor = page;
                }

                await PaceAsync(delayMs, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                failures++;
                _logger.LogError(ex, "Perenual raw-cache (list) failed for page {Page}", page);
                _db.ChangeTracker.Clear();
            }
        }

        return Log(new CacheCatalogResponse("list", processed, cached, htmlSkipped, failures, nextCursor?.ToString()));
    }

    // ── phase=details / careguide ────────────────────────────────────────────

    private async Task<CacheCatalogResponse> CacheBySpeciesIdAsync(
        string endpoint, int afterId, int limit, int delayMs, bool force, CancellationToken ct)
    {
        var ids = await GetSpeciesIdsFromListCacheAsync(afterId, limit, ct);

        int processed = 0, cached = 0, htmlSkipped = 0, failures = 0;
        int? nextCursor = null;

        foreach (var id in ids)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var existing = await FindAsync(endpoint, id.ToString(), ct);
                if (existing is not null && !force)
                {
                    cached++;
                    nextCursor = id;
                    continue;
                }

                var (literal, hadBody) = endpoint == DetailsEndpoint
                    ? await FetchDetailsLiteralAsync(id, ct)
                    : (await _client.GetCareGuideLiteralAsync(id, ct), null);

                if (literal is null)
                {
                    // No usable body (deleted id HTML / non-JSON / miss). Record the
                    // attempt so it isn't re-fetched; not a failure.
                    await UpsertAsync(endpoint, id.ToString(), null, NoBodyStatus, ct);
                    htmlSkipped++;
                }
                else
                {
                    PerenualKeyRedactor.AssertRedacted(literal, $"PerenualRawCache.{endpoint}");
                    await UpsertAsync(endpoint, id.ToString(), literal, 200, ct);
                    processed++;
                }
                _ = hadBody;
                nextCursor = id;

                await PaceAsync(delayMs, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                failures++;
                _logger.LogError(ex, "Perenual raw-cache ({Endpoint}) failed for id {Id}", endpoint, id);
                _db.ChangeTracker.Clear();
            }
        }

        return Log(new CacheCatalogResponse(
            endpoint == DetailsEndpoint ? "details" : "careguide",
            processed, cached, htmlSkipped, failures, nextCursor?.ToString()));
    }

    private async Task<(string? Literal, bool? HadBody)> FetchDetailsLiteralAsync(int id, CancellationToken ct)
    {
        var fetch = await _client.GetSpeciesDetailsWithLiteralAsync(id, ct);
        // Species null ⇒ deleted-id HTML / non-JSON / failure ⇒ no body to keep.
        return (fetch.Species is null ? null : fetch.LiteralJson, fetch.Species is not null);
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
    /// SMA-93 raw-cache chunk summary. Counts only — never the cached bodies.
    /// <c>Processed</c> = freshly fetched + stored; <c>Cached</c> = skipped because
    /// already cached (idempotent); <c>HtmlSkipped</c> = fetches with no usable body
    /// (deleted-id HTML / non-JSON), recorded so they aren't retried;
    /// <c>Failures</c> = exceptions; <c>NextCursor</c> = last page/id processed
    /// (null when the phase is exhausted).
    /// </summary>
    public record CacheCatalogResponse(
        string Phase,
        int Processed,
        int Cached,
        int HtmlSkipped,
        int Failures,
        string? NextCursor);
}
