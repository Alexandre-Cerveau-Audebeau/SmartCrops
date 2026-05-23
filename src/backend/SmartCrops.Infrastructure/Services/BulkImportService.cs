using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Infrastructure.Services;

/// <summary>
/// Creates minimal <see cref="Plant"/> rows from a bulk import request. The
/// per-source enrichment endpoints (taxonomy / Trefle / Perenual) are
/// responsible for filling everything else later — bulk-create only writes
/// identity (<c>Id</c>, <c>ScientificName</c>) and the <c>PlantTypeId</c> FK.
///
/// <para>Per-item flow:
/// <list type="number">
///   <item>trim + non-blank guard on <c>ScientificName</c> (Failed if blank);</item>
///   <item>require + lookup <c>PlantType</c> name case-insensitively against
///   the seeded set (Failed if missing or unknown) — no generic default exists,
///   so the caller MUST classify each row;</item>
///   <item>dedup against the existing <c>Plants</c> table (Skipped if the name
///   already exists — bulk-create is additive, never destructive);</item>
///   <item>stage an <c>Add</c> with a client-generated <c>Guid</c>
///   (matches <c>PlantConfiguration.cs</c>'s <c>ValueGeneratedNever</c>) and
///   default <c>EnrichmentStatus = Manual</c> from the entity initializer.</item>
/// </list>
/// Persistence is batched into a single <c>SaveChangesAsync</c> at the end —
/// dedup happens up front so duplicates are never staged; the only way the
/// flush throws is a concurrent insert race, which we surface as a global
/// Failed count rather than per-item (no row-level transactions). The unique
/// index on <see cref="Plant.ScientificName"/> is the backstop.</para>
/// </summary>
public class BulkImportService : IBulkImportService
{
    private readonly SmartCropsDbContext _db;
    private readonly ILogger<BulkImportService> _logger;

    public BulkImportService(SmartCropsDbContext db, ILogger<BulkImportService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<BulkImportResult> CreateAsync(BulkImportRequest request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        var items = request.Items ?? new List<BulkImportItem>();
        var total = items.Count;
        var created = 0;
        var skipped = 0;
        var failed = 0;
        var failedReasons = new List<string>();

        if (total == 0)
        {
            return new BulkImportResult(0, 0, 0, 0, failedReasons);
        }

        // Plant type lookup is keyed case-insensitively because the source JSON
        // commonly ships values like "vegetable" / "Vegetable" / "VEGETABLE" —
        // none of which would equal the canonical "Vegetable" with ordinal
        // comparison. Built once per call so a 1000-item batch resolves locally
        // without a DB round-trip per item.
        var plantTypes = await _db.PlantTypes
            .Select(t => new { t.Id, t.Name })
            .ToListAsync(ct);
        var typesByName = plantTypes.ToDictionary(
            t => t.Name,
            t => t.Id,
            StringComparer.OrdinalIgnoreCase);

        // Collect distinct candidate names from the request (case-insensitive)
        // so the existing-rows lookup only hits the names we're about to insert,
        // not the full Plants table. Bulk-import is the scaling engine for this
        // table (1000-3000 rows in the near term, more later), so preloading
        // every row to dedup a batch of N items wouldn't scale — query bounded
        // by request size instead. CR PR #80 r1.
        var candidateNames = items
            .Select(i => i?.ScientificName?.Trim())
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // NOTE on case sensitivity: the DB-side filter uses Postgres '='
        // (case-sensitive), matching the unique index on ScientificName. If a
        // row already exists under a different case than what the request
        // shipped, this lookup misses it and the staged insert falls through to
        // the unique-index guard at flush time — which lands the row in the
        // Failed bucket via the catch below (with its per-item reason). That's
        // an acceptable trade-off: ScientificNames are normalised at seed
        // time, the in-memory HashSet keeps intra-request dedup
        // case-insensitive, and the unique index remains the backstop.
        var existingNames = candidateNames.Count == 0
            ? new List<string>()
            : await _db.Plants
                .Where(p => candidateNames.Contains(p.ScientificName))
                .Select(p => p.ScientificName)
                .ToListAsync(ct);
        var existing = new HashSet<string>(existingNames, StringComparer.OrdinalIgnoreCase);

        // In-batch dedup: a caller that lists the same scientificName twice in
        // one request hits the unique index on flush. Track names we've
        // already staged this call so the second occurrence Skips instead of
        // crashing the whole SaveChangesAsync.
        var stagedThisBatch = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Per-staged-item record so a batch-flush failure can emit one
        // FailedReasons line per stagéd ScientificName (per the
        // BulkImportResult contract) instead of a single generic message —
        // diagnostics must identify which names actually failed. CR PR #80 r1.
        var stagedNames = new List<string>();

        foreach (var item in items)
        {
            ct.ThrowIfCancellationRequested();

            var name = item?.ScientificName?.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                failed++;
                failedReasons.Add("(blank): ScientificName is required");
                continue;
            }

            if (string.IsNullOrWhiteSpace(item!.PlantType))
            {
                failed++;
                failedReasons.Add($"{name}: PlantType is required");
                continue;
            }

            if (!typesByName.TryGetValue(item.PlantType.Trim(), out var plantTypeId))
            {
                failed++;
                failedReasons.Add($"{name}: unknown plant type '{item.PlantType}'");
                continue;
            }

            if (existing.Contains(name) || !stagedThisBatch.Add(name))
            {
                skipped++;
                continue;
            }

            _db.Plants.Add(new Plant
            {
                Id = Guid.NewGuid(),
                ScientificName = name,
                PlantTypeId = plantTypeId,
                // CreatedAt/UpdatedAt fall through to DB CURRENT_TIMESTAMP defaults;
                // EnrichmentStatus falls through to the Manual entity default. No
                // common names or translations — those land later via Trefle.
            });
            stagedNames.Add(name);
            created++;
        }

        if (created > 0)
        {
            try
            {
                await _db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException ex)
            {
                // A flush failure here means either a concurrent inserter hit the
                // ScientificName unique index between our existing-names snapshot
                // and SaveChanges, or a CHECK constraint we didn't pre-validate
                // (none currently apply to the columns we touch). Roll the counts
                // back so the response reflects what's actually in the DB: nothing
                // from this batch persisted, since SaveChanges is all-or-nothing.
                //
                // Emit one FailedReasons line per staged ScientificName (not a
                // single generic message) so the documented "one line per failed
                // item" contract on BulkImportResult.FailedReasons holds for the
                // flush-failure path too. CR PR #80 r1.
                _logger.LogError(ex,
                    "Bulk-import flush failed; rolling staged inserts back into Failed bucket. Total staged: {Staged}",
                    stagedNames.Count);
                var baseMsg = ex.GetBaseException().Message;
                foreach (var name in stagedNames)
                {
                    failedReasons.Add($"{name}: batch flush failed — {baseMsg}");
                }
                failed += stagedNames.Count;
                created -= stagedNames.Count;
                _db.ChangeTracker.Clear();
            }
        }

        _logger.LogInformation(
            "Bulk-import processed {Total} items: created={Created} skipped={Skipped} failed={Failed}",
            total, created, skipped, failed);

        return new BulkImportResult(total, created, skipped, failed, failedReasons);
    }
}
