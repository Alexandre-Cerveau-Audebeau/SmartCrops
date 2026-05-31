using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Controllers.Admin;

/// <summary>
/// Admin-triggered taxonomy enrichment. First application of the ADR-0003
/// dual-write rule: every successful match commits a raw audit row on
/// <c>PlantSources</c> and the curated denormalized fields on <c>Plants</c>
/// in a single transaction.
///
/// Gated to the Admin role (SMA-33/#68): every endpoint here is an admin/ETL
/// operation, so the controller requires <c>[Authorize(Roles = "Admin")]</c>.
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Admin)]
[Route("api/admin/taxonomy")]
public class PlantTaxonomyController : ControllerBase
{
    private readonly SmartCropsDbContext _db;
    private readonly IPlantTaxonomyService _taxonomy;
    private readonly ILogger<PlantTaxonomyController> _logger;

    public PlantTaxonomyController(
        SmartCropsDbContext db,
        IPlantTaxonomyService taxonomy,
        ILogger<PlantTaxonomyController> logger)
    {
        _db = db;
        _taxonomy = taxonomy;
        _logger = logger;
    }

    /// <summary>
    /// Enrich a single plant. Idempotent by default: skipped when the
    /// <see cref="EnrichmentStatus.GbifEnriched"/> flag is already set, unless
    /// <paramref name="force"/> is supplied to re-fetch.
    /// </summary>
    [HttpPost("enrich/{plantId:guid}")]
    public async Task<IActionResult> Enrich(
        Guid plantId,
        [FromQuery] bool force = false,
        CancellationToken ct = default)
    {
        var plant = await _db.Plants.FirstOrDefaultAsync(p => p.Id == plantId, ct);
        if (plant is null)
        {
            return NotFound();
        }

        if (!force && plant.EnrichmentStatus.HasFlag(EnrichmentStatus.GbifEnriched))
        {
            return Ok(new EnrichSkippedResponse(true, "AlreadyEnriched"));
        }

        var result = await _taxonomy.ResolveAsync(plant.ScientificName, ct);
        if (result.GbifTaxonKey is null)
        {
            return Ok(new EnrichNoMatchResponse(false, result.MatchType));
        }

        // ADR-0003 dual-write — both writes commit together via a single EF
        // transaction so a CHECK or FK failure rolls both back. The query
        // window between the existence check and the insert is acceptable
        // (admin-triggered, single writer per plant id at a time in D1).
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var existingSource = await _db.PlantSources
            .FirstOrDefaultAsync(
                s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF,
                ct);

        if (existingSource is null)
        {
            _db.PlantSources.Add(new PlantSource
            {
                PlantId = plantId,
                SourceType = PlantSourceType.GBIF,
                ExternalId = result.GbifTaxonKey.Value.ToString(),
                Url = $"https://api.gbif.org/v1/species/{result.GbifTaxonKey.Value}",
                LastFetchedAt = DateTime.UtcNow,
            });
        }
        else
        {
            existingSource.ExternalId = result.GbifTaxonKey.Value.ToString();
            existingSource.Url = $"https://api.gbif.org/v1/species/{result.GbifTaxonKey.Value}";
            existingSource.LastFetchedAt = DateTime.UtcNow;
        }

        plant.GbifTaxonKey = result.GbifTaxonKey;
        plant.Family = result.Family;
        plant.Genus = result.Genus;
        plant.SpeciesEpithet = result.SpeciesEpithet;
        plant.EnrichmentStatus |= EnrichmentStatus.GbifEnriched;
        plant.LastEnrichmentAt = DateTime.UtcNow;

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        // ADR-0004 layer (c): catch the specific 23505 on IX_Plants_GbifTaxonKey
        // and classify as Skipped/DuplicateTaxonKey instead of letting it fall
        // through to the generic catch in EnrichAll (which would count it as
        // Failed). The literal index name mirrors the EF index defined in
        // SmartCrops.Infrastructure/Migrations/20260509013833_AddPlantEnrichmentSchema.cs:487
        // (and PlantConfiguration.cs HasIndex(p => p.GbifTaxonKey)). If the
        // index is renamed in a future migration, update this literal accordingly.
        // Server-side uniqueness enforcement remains authoritative; this catch
        // only classifies the outcome. The `await using var tx` rolls back on
        // exception via dispose, so the staged PlantSources upsert is undone too.
        catch (DbUpdateException ex) when (
            ex.InnerException is PostgresException pg
            && pg.SqlState == "23505"
            && pg.ConstraintName == "IX_Plants_GbifTaxonKey")
        {
            var winning = await _db.Plants
                .AsNoTracking()
                .Where(p => p.GbifTaxonKey == result.GbifTaxonKey)
                .Select(p => new { p.Id, p.ScientificName })
                .FirstOrDefaultAsync(ct);

            _logger.LogWarning(
                "[Skipped/DuplicateTaxonKey] Plant {LosingPlantId} '{LosingScientificName}' resolves to GbifTaxonKey {GbifTaxonKey} already held by Plant {WinningPlantId} '{WinningScientificName}'. Batch continues. Source={Source}.",
                plant.Id,
                plant.ScientificName,
                result.GbifTaxonKey,
                winning?.Id,
                winning?.ScientificName,
                "GBIF");

            return Ok(new EnrichSkippedResponse(true, "DuplicateTaxonKey"));
        }
        await tx.CommitAsync(ct);

        _logger.LogInformation(
            "GBIF-enriched plant {PlantId}: key={GbifTaxonKey} matchType={MatchType} confidence={Confidence}",
            plantId, result.GbifTaxonKey, result.MatchType, result.Confidence);

        return Ok(new EnrichMatchedResponse(
            true,
            result.GbifTaxonKey,
            result.Family,
            result.Genus,
            result.MatchType,
            result.Confidence));
    }

    /// <summary>
    /// Enrich every plant. Sequential by design — 30 seed plants at ~500 ms
    /// each is ~15 s end-to-end and the GBIF API doesn't reward parallelism
    /// at this scale. When <paramref name="force"/> is false, plants that
    /// already carry the <see cref="EnrichmentStatus.GbifEnriched"/> flag
    /// are skipped via a SQL filter to avoid loading them at all.
    ///
    /// The optional <paramref name="limit"/> caps the chunk size and
    /// <paramref name="afterId"/> is a keyset cursor: when set, the query
    /// adds <c>WHERE Id &gt; afterId</c>, so every plant is scanned exactly
    /// once per pass regardless of match outcome (CR r1 #2 — the previous
    /// <c>OrderBy(Id).Take</c> over the <c>!GbifEnriched</c> set could stall
    /// if a front block of unmatchable plants stayed at the head of every
    /// chunk). The response includes <c>NextAfterId</c> (max processed Id,
    /// null when the chunk is empty) for the driver to advance the cursor,
    /// and <c>NotEnrichedRemaining</c> as a kept-for-observability count of
    /// plants still lacking the flag.
    /// </summary>
    [HttpPost("enrich-all")]
    public async Task<IActionResult> EnrichAll(
        [FromQuery] bool force = false,
        [FromQuery] int? limit = null,
        [FromQuery] Guid? afterId = null,
        CancellationToken ct = default)
    {
        var query = _db.Plants.AsQueryable();
        if (!force)
        {
            query = query.Where(p => (p.EnrichmentStatus & EnrichmentStatus.GbifEnriched) == 0);
        }

        if (afterId is { } cursor)
        {
            // Keyset/seek: Id comparison + OrderBy stay server-side (Npgsql
            // translates uuid > and uuid ORDER BY natively), so both sides
            // use the same PostgreSQL uuid ordering and the cursor is
            // consistent across chunks.
            query = query.Where(p => p.Id > cursor);
        }

        // OrderBy(Id) IS the cursor key — it MUST match the Id comparison
        // above. Replacing it with a composite (e.g. CreatedAt.ThenBy(Id))
        // would break the seek invariant since the WHERE Id > cursor would
        // skip plants that should still appear in a later chunk.
        query = query.OrderBy(p => p.Id);
        if (limit is > 0)
        {
            query = query.Take(limit.Value);
        }

        var plantIds = await query.Select(p => p.Id).ToListAsync(ct);

        var matched = 0;
        var notMatched = 0;
        var skipped = 0;
        var failed = 0;

        foreach (var id in plantIds)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var resp = await Enrich(id, force, ct);
                switch (resp)
                {
                    case OkObjectResult { Value: EnrichMatchedResponse }:
                        matched++;
                        break;
                    case OkObjectResult { Value: EnrichNoMatchResponse }:
                        notMatched++;
                        break;
                    case OkObjectResult { Value: EnrichSkippedResponse }:
                        skipped++;
                        break;
                    default:
                        failed++;
                        break;
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                failed++;
                _logger.LogError(ex, "Failed to enrich plant {Id}", id);
            }
            finally
            {
                // The scoped DbContext survives a per-iteration failure: any
                // entity staged before the throw stays tracked, and the next
                // iteration's SaveChangesAsync would flush it alongside its
                // own writes. Clearing the change tracker isolates each plant.
                _db.ChangeTracker.Clear();
            }
        }

        // NextAfterId = max processed Id (last of the ordered list); null
        // when the chunk is empty, signalling the cursor has reached the
        // tail of the !flagged set. Termination of the driver loop is
        // "short chunk OR nextAfterId is null", not a stalled-remaining
        // guard (the cursor guarantees forward progress).
        Guid? nextAfterId = plantIds.Count > 0 ? plantIds[^1] : (Guid?)null;

        // NotEnrichedRemaining is kept for observability: at the end of a
        // full driver run this counts plants no upstream source matched
        // (data variance, not a bug). Computed AFTER the per-plant commits
        // so it reflects the post-chunk state.
        var notEnrichedRemaining = await _db.Plants
            .CountAsync(p => (p.EnrichmentStatus & EnrichmentStatus.GbifEnriched) == 0, ct);

        return Ok(new EnrichAllResponse(
            Total: plantIds.Count,
            Matched: matched,
            NotMatched: notMatched,
            Skipped: skipped,
            Failed: failed,
            NotEnrichedRemaining: notEnrichedRemaining,
            NextAfterId: nextAfterId));
    }

    // Response DTOs are kept as records for cheap pattern-matching in EnrichAll
    // and so the JSON shape is stable for the future admin UI.
    public record EnrichMatchedResponse(
        bool Matched,
        int? GbifTaxonKey,
        string? Family,
        string? Genus,
        string MatchType,
        int? Confidence);

    public record EnrichNoMatchResponse(bool Matched, string MatchType);

    public record EnrichSkippedResponse(bool Skipped, string Reason);

    public record EnrichAllResponse(
        int Total,
        int Matched,
        int NotMatched,
        int Skipped,
        int Failed,
        int NotEnrichedRemaining,
        Guid? NextAfterId);
}
