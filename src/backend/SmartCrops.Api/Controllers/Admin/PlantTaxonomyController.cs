using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
/// Bare <c>[Authorize]</c> is intentional for D1 — Identity Roles aren't in
/// place yet (tracked in project memory). Tighten to an admin role when the
/// role-based authz lands.
/// </summary>
[ApiController]
[Authorize]
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
            existingSource.LastFetchedAt = DateTime.UtcNow;
        }

        plant.GbifTaxonKey = result.GbifTaxonKey;
        plant.Family = result.Family;
        plant.Genus = result.Genus;
        plant.SpeciesEpithet = result.SpeciesEpithet;
        plant.EnrichmentStatus |= EnrichmentStatus.GbifEnriched;
        plant.LastEnrichmentAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
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
    /// </summary>
    [HttpPost("enrich-all")]
    public async Task<IActionResult> EnrichAll(
        [FromQuery] bool force = false,
        CancellationToken ct = default)
    {
        var query = _db.Plants.AsQueryable();
        if (!force)
        {
            query = query.Where(p => (p.EnrichmentStatus & EnrichmentStatus.GbifEnriched) == 0);
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
            catch (Exception ex)
            {
                failed++;
                _logger.LogError(ex, "Failed to enrich plant {Id}", id);
            }
        }

        return Ok(new EnrichAllResponse(
            Total: plantIds.Count,
            Matched: matched,
            NotMatched: notMatched,
            Skipped: skipped,
            Failed: failed));
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
        int Failed);
}
