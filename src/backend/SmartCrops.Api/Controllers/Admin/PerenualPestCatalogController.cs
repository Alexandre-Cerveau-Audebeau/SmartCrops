using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.ExternalApis.Perenual;

namespace SmartCrops.Api.Controllers.Admin;

/// <summary>
/// Admin-triggered, one-time harvest of the global Perenual pest/disease
/// catalogue (SMA-71 PR2). Separate from <c>PlantPerenualController</c> because
/// this is a GLOBAL reference table, not per-plant enrichment.
///
/// <para>Bare <c>[Authorize]</c> matches the other admin controllers — Identity
/// Roles aren't in place yet (see issue #68).</para>
/// </summary>
[ApiController]
[Authorize]
[Route("api/admin/perenual/pest-catalog")]
public class PerenualPestCatalogController : ControllerBase
{
    private readonly SmartCropsDbContext _db;
    private readonly IPerenualPestCatalogService _catalog;
    private readonly ILogger<PerenualPestCatalogController> _logger;

    public PerenualPestCatalogController(
        SmartCropsDbContext db,
        IPerenualPestCatalogService catalog,
        ILogger<PerenualPestCatalogController> logger)
    {
        _db = db;
        _catalog = catalog;
        _logger = logger;
    }

    /// <summary>
    /// Harvest the catalogue: paginate <c>/api/pest-disease-list</c> from page 1
    /// to <c>last_page</c>, fail-fast guard each (already-redacted) literal, and
    /// upsert one row per <c>PerenualPestId</c>. Idempotent — re-running updates
    /// in place rather than duplicating. Page 1 must succeed (it carries the page
    /// count); a later-page failure is counted and skipped (re-run to mop up).
    /// Run separately after merge — NOT exercised in CI.
    /// </summary>
    [HttpPost("harvest")]
    public async Task<IActionResult> Harvest(CancellationToken ct = default)
    {
        var first = await _catalog.GetPageAsync(1, ct);
        if (first is null)
        {
            // Page 1 fetch failed → we can't determine pagination. 502 lets a
            // driver distinguish "upstream down, retry" from a genuine result.
            return StatusCode(StatusCodes.Status502BadGateway, "Perenual pest-disease-list page 1 fetch failed.");
        }

        var pagesFetched = 0;
        var failures = 0;
        var upserted = 0;

        for (var page = 1; page <= first.LastPage; page++)
        {
            // Reuse the page-1 fetch; fetch the rest.
            var pg = page == 1 ? first : await _catalog.GetPageAsync(page, ct);
            if (pg is null)
            {
                _logger.LogWarning("Perenual pest-catalog page {Page} fetch failed; counted as a failure.", page);
                failures++;
                continue;
            }
            pagesFetched++;
            upserted += await UpsertPageAsync(pg, ct);
        }

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Perenual pest-catalog harvest: pagesFetched={Pages} itemsUpserted={Items} failures={Failures}",
            pagesFetched, upserted, failures);

        return Ok(new PestCatalogHarvestResponse(pagesFetched, upserted, failures));
    }

    private async Task<int> UpsertPageAsync(PerenualPestPage page, CancellationToken ct)
    {
        // Batch-fetch the page's existing rows in ONE query (avoids an N+1 SELECT
        // per item). The dictionary also dedupes a PerenualPestId that recurs
        // within a run: a freshly-Added entity isn't yet queryable, so the prior
        // per-item FirstOrDefaultAsync could Add a duplicate and trip the unique
        // index at SaveChanges. (CR PR #103.)
        var ids = page.Items.Select(i => i.PerenualPestId).ToList();
        var existingById = await _db.PerenualPestCatalog
            .Where(c => ids.Contains(c.PerenualPestId))
            .ToDictionaryAsync(c => c.PerenualPestId, ct);

        var count = 0;
        foreach (var item in page.Items)
        {
            // Persistence-boundary guard (SMA-71 contract): the pest body carries
            // no key today, but fail fast if redaction ever regresses rather than
            // letting a secret become durable. The throw rolls the whole harvest
            // back (no SaveChanges has run yet for this call).
            PerenualKeyRedactor.AssertRedacted(item.LiteralJson, "PerenualPestCatalog.LiteralResponseJson");

            if (existingById.TryGetValue(item.PerenualPestId, out var existing))
            {
                existing.CommonName = item.CommonName;
                existing.ScientificName = item.ScientificName;
                existing.LiteralResponseJson = item.LiteralJson;
                existing.FetchedAt = DateTime.UtcNow;
            }
            else
            {
                var added = new PerenualPestCatalog
                {
                    PerenualPestId = item.PerenualPestId,
                    CommonName = item.CommonName,
                    ScientificName = item.ScientificName,
                    LiteralResponseJson = item.LiteralJson,
                    FetchedAt = DateTime.UtcNow,
                };
                _db.PerenualPestCatalog.Add(added);
                // Register it so a duplicate id later in THIS page updates the same
                // tracked instance rather than Add-ing a second row.
                existingById[item.PerenualPestId] = added;
            }
            count++;
        }
        return count;
    }

    /// <summary>Harvest outcome — counts only; never carries the captured literals.</summary>
    public record PestCatalogHarvestResponse(int PagesFetched, int ItemsUpserted, int Failures);
}
