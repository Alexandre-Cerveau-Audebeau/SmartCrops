using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Controllers.Admin;

/// <summary>
/// SMA-135 — admin re-pin of a plant's taxonomic identity. Repoints a plant to a
/// clean nominal species (or, when no accepted species is defensible, to an
/// intentional genus-level identity) and PURGES the now-stale source-derived
/// fields so a subsequent forced re-enrichment re-sources cleanly.
///
/// <para>This endpoint does IDENTITY + PURGE only — it does NOT re-enrich. The
/// species path deliberately nulls <c>GbifTaxonKey</c> and clears the external
/// enrichment bits so the operator's follow-up <c>enrich?force=true</c> calls
/// (GBIF → Trefle → Perenual) re-resolve and re-populate. The genus path keeps
/// the GBIF identity (genus + archived genus key) and removes Trefle/Perenual
/// data outright, because neither source can represent a bare genus.</para>
///
/// <para>Why purge: the denormalised <c>Plant</c> scalars are first-writer-wins
/// (<c>x ??= ...</c> / <c>if (x is null) x = ...</c>) per ADR-0003, so a plain
/// re-enrich would NOT overwrite values seeded from the previous (wrong-species)
/// identity. Nulling them first is what makes the re-source effective.</para>
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Admin)]
[Route("api/admin/plants")]
public class PlantRepinController : ControllerBase
{
    private readonly SmartCropsDbContext _db;
    private readonly ILogger<PlantRepinController> _logger;

    public PlantRepinController(SmartCropsDbContext db, ILogger<PlantRepinController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Re-pin a single plant's identity (transactional, all-or-nothing).
    /// 404 when the plant id misses; 400 on a blank name or an unknown rank.
    /// </summary>
    [HttpPost("{id:guid}/repin")]
    public async Task<IActionResult> Repin(
        Guid id,
        [FromBody] RepinRequest request,
        CancellationToken ct = default)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.ScientificName))
        {
            return BadRequest("scientificName is required.");
        }

        if (!Enum.TryParse<PlantTaxonRank>(request.TaxonRank, ignoreCase: true, out var rank)
            || !Enum.IsDefined(rank))
        {
            return BadRequest("taxonRank must be 'Species' or 'Genus'.");
        }

        var plant = await _db.Plants
            .Include(p => p.TrefleData)
            .Include(p => p.PerenualData)
            .FirstOrDefaultAsync(p => p.Id == id, ct);
        if (plant is null)
        {
            return NotFound();
        }

        var oldName = plant.ScientificName;
        var newName = request.ScientificName.Trim();
        var isGenus = rank == PlantTaxonRank.Genus;

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        // ── Common purge: the 31 first-writer-wins scalars (both ranks). The 4
        // source-EXCLUSIVE OVERWRITE fields (FlowerColors/NativeRegions/
        // IntroducedRegions/EdibleParts) auto-refresh on a species re-enrich, so
        // they're only purged on the genus path (no Trefle/Perenual re-source to
        // rewrite them). ──
        var scalarsCleared = PurgeScalars(plant, includeSourceExclusive: isGenus);

        plant.ScientificName = newName;
        plant.GbifTaxonKey = null; // both paths — avoids the IX_Plants_GbifTaxonKey
                                   // unique collision and forces GBIF re-resolution.
        plant.TaxonRank = rank;

        var sourcesDeleted = 0;
        var collectionRowsDeleted = 0;

        if (!isGenus)
        {
            // ── SPECIES path ──
            // Keep Family/Genus/SpeciesEpithet as-is: the GBIF re-enrich OVERWRITES
            // them from the new name. PlantSources + collections are left untouched —
            // the forced re-enrich corrects them via upsert / delete-then-insert.
            plant.IdentityNeedsReview = false;
            // Keep Manual, clear Gbif|Trefle|Perenual so the re-enrich re-posts them.
            plant.EnrichmentStatus = EnrichmentStatus.Manual;
        }
        else
        {
            // ── GENUS path ──
            plant.Genus = newName;
            plant.SpeciesEpithet = null;
            // Family is kept: a species shares its genus's family, so the
            // genus-level family stays correct.
            plant.IdentityNeedsReview = true;
            // GBIF identity stays (Manual | Gbif); Trefle/Perenual are removed.
            plant.EnrichmentStatus = EnrichmentStatus.Manual | EnrichmentStatus.GbifEnriched;

            // Archive the provided genus key on the GBIF PlantSource (non-unique
            // (SourceType, ExternalId) index → genus-shared keys don't collide).
            if (request.GbifTaxonKey is long genusKey)
            {
                await ArchiveGenusKeyAsync(plant.Id, genusKey, ct);
            }

            // Drop the 1:1 source audit rows (species-specific identity, now stale).
            if (plant.TrefleData is not null)
            {
                _db.PlantTrefleData.Remove(plant.TrefleData);
                collectionRowsDeleted++;
            }
            if (plant.PerenualData is not null)
            {
                _db.PlantPerenualData.Remove(plant.PerenualData);
                collectionRowsDeleted++;
            }

            // Drop the Trefle + Perenual PlantSources (keep the GBIF one).
            var staleSources = await _db.PlantSources
                .Where(s => s.PlantId == plant.Id
                    && (s.SourceType == PlantSourceType.Trefle
                        || s.SourceType == PlantSourceType.Perenual))
                .ToListAsync(ct);
            _db.PlantSources.RemoveRange(staleSources);
            sourcesDeleted += staleSources.Count;

            // Drop the Trefle/Perenual-sourced collection rows (attribution per
            // Étape 0: Images by Source enum; CommonNames/Synonyms are wholly
            // Trefle-owned with no Source column; LongDescriptions by
            // SourceMethod="perenual"; Pests by Source="perenual").
            collectionRowsDeleted += await DeleteWhereAsync(
                _db.PlantImages.Where(i => i.PlantId == plant.Id
                    && (i.Source == PlantSourceType.Trefle || i.Source == PlantSourceType.Perenual)), ct);

            collectionRowsDeleted += await DeleteWhereAsync(
                _db.PlantCommonNames.Where(c => c.PlantId == plant.Id), ct);

            collectionRowsDeleted += await DeleteWhereAsync(
                _db.PlantSynonyms.Where(s => s.PlantId == plant.Id), ct);

            collectionRowsDeleted += await DeleteWhereAsync(
                _db.PlantLongDescriptions.Where(d => d.PlantId == plant.Id && d.SourceMethod == "perenual"), ct);

            collectionRowsDeleted += await DeleteWhereAsync(
                _db.PlantPests.Where(p => p.PlantId == plant.Id && p.Source == "perenual"), ct);
        }

        plant.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        // The new ScientificName collides with another plant on the
        // case-insensitive unique index (e.g. re-pinning a "(group)" duplicate
        // onto an already-clean species). The `await using` transaction rolls the
        // whole unit back on dispose; surface a 409 instead of a 500 so the
        // operator can merge/delete the duplicate instead.
        catch (DbUpdateException ex) when (
            ex.InnerException is PostgresException pg
            && pg.SqlState == "23505"
            && pg.ConstraintName == "IX_Plants_ScientificName_Lower")
        {
            _logger.LogWarning(
                "Re-pin of plant {PlantId} to '{NewName}' rejected: a plant with that scientific name already exists. Rolled back.",
                plant.Id, newName);
            return Conflict($"A plant with scientific name '{newName}' already exists.");
        }

        await tx.CommitAsync(ct);

        _logger.LogInformation(
            "Re-pinned plant {PlantId}: '{OldName}' → '{NewName}' rank={Rank} review={Review}; "
            + "purged scalars={Scalars} sources={Sources} collectionRows={Collections}",
            plant.Id, oldName, newName, rank, plant.IdentityNeedsReview,
            scalarsCleared, sourcesDeleted, collectionRowsDeleted);

        return Ok(new RepinResponse(
            PlantId: plant.Id,
            OldScientificName: oldName,
            NewScientificName: newName,
            TaxonRank: rank.ToString(),
            GbifTaxonKey: isGenus ? request.GbifTaxonKey : null,
            IdentityNeedsReview: plant.IdentityNeedsReview,
            Purged: new RepinPurgeCounts(scalarsCleared, sourcesDeleted, collectionRowsDeleted)));
    }

    // ── helpers ────────────────────────────────────────────────────────

    /// <summary>
    /// NULL the first-writer-wins scalars seeded by Trefle/Perenual gap-fill (and
    /// the GBIF-owned <c>Author</c>, which is <c>??=</c>). Returns how many fields
    /// were actually cleared (were non-null). When <paramref name="includeSourceExclusive"/>
    /// is set, also clears the 4 source-exclusive OVERWRITE JSON fields — needed on
    /// the genus path where no re-source will rewrite them.
    /// </summary>
    private static int PurgeScalars(Plant plant, bool includeSourceExclusive)
    {
        var n = 0;

        // GBIF-owned, ??= (first-writer-wins).
        if (plant.Author is not null) { plant.Author = null; n++; }

        // Trefle/Perenual gap-fill scalars.
        if (plant.WfoId is not null) { plant.WfoId = null; n++; }
        if (plant.LightLevel is not null) { plant.LightLevel = null; n++; }
        if (plant.SoilNutriments is not null) { plant.SoilNutriments = null; n++; }
        if (plant.SoilPhMin is not null) { plant.SoilPhMin = null; n++; }
        if (plant.SoilPhMax is not null) { plant.SoilPhMax = null; n++; }
        if (plant.MinTempC is not null) { plant.MinTempC = null; n++; }
        if (plant.MaxTempC is not null) { plant.MaxTempC = null; n++; }
        if (plant.IsEdible is not null) { plant.IsEdible = null; n++; }
        if (plant.IsVegetable is not null) { plant.IsVegetable = null; n++; }
        if (plant.GrowthHabit is not null) { plant.GrowthHabit = null; n++; }
        if (plant.RequestedPerenualId is not null) { plant.RequestedPerenualId = null; n++; }
        if (plant.LifeCycle is not null) { plant.LifeCycle = null; n++; }
        if (plant.GrowthRate is not null) { plant.GrowthRate = null; n++; }
        if (plant.WateringNeedLevel is not null) { plant.WateringNeedLevel = null; n++; }
        if (plant.CareLevel is not null) { plant.CareLevel = null; n++; }
        if (plant.HardinessZoneMin is not null) { plant.HardinessZoneMin = null; n++; }
        if (plant.HardinessZoneMax is not null) { plant.HardinessZoneMax = null; n++; }
        if (plant.MinHeightCm is not null) { plant.MinHeightCm = null; n++; }
        if (plant.MaxHeightCm is not null) { plant.MaxHeightCm = null; n++; }
        if (plant.IsIndoor is not null) { plant.IsIndoor = null; n++; }
        if (plant.IsDroughtTolerant is not null) { plant.IsDroughtTolerant = null; n++; }
        if (plant.IsSaltTolerant is not null) { plant.IsSaltTolerant = null; n++; }
        if (plant.IsThorny is not null) { plant.IsThorny = null; n++; }
        if (plant.IsInvasive is not null) { plant.IsInvasive = null; n++; }
        if (plant.IsTropical is not null) { plant.IsTropical = null; n++; }
        if (plant.IsMedicinal is not null) { plant.IsMedicinal = null; n++; }
        if (plant.IsToxicToHumans is not null) { plant.IsToxicToHumans = null; n++; }
        if (plant.IsToxicToPets is not null) { plant.IsToxicToPets = null; n++; }
        if (plant.PropagationInstructions is not null) { plant.PropagationInstructions = null; n++; }
        if (plant.SowingInstructions is not null) { plant.SowingInstructions = null; n++; }

        if (includeSourceExclusive)
        {
            if (plant.FlowerColors is not null) { plant.FlowerColors = null; n++; }
            if (plant.NativeRegions is not null) { plant.NativeRegions = null; n++; }
            if (plant.IntroducedRegions is not null) { plant.IntroducedRegions = null; n++; }
            if (plant.EdibleParts is not null) { plant.EdibleParts = null; n++; }
        }

        return n;
    }

    /// <summary>
    /// Update the plant's GBIF <see cref="PlantSource"/> to point at the genus key
    /// (create it if absent). Mirrors the upsert shape used by the enrich
    /// controllers; the genus key is archived here rather than on
    /// <c>Plant.GbifTaxonKey</c> to dodge the partial-unique index on shared genera.
    /// </summary>
    private async Task ArchiveGenusKeyAsync(Guid plantId, long genusKey, CancellationToken ct)
    {
        var idStr = genusKey.ToString(CultureInfo.InvariantCulture);
        var url = $"https://api.gbif.org/v1/species/{idStr}";
        var existing = await _db.PlantSources
            .FirstOrDefaultAsync(
                s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF,
                ct);

        if (existing is null)
        {
            _db.PlantSources.Add(new PlantSource
            {
                PlantId = plantId,
                SourceType = PlantSourceType.GBIF,
                ExternalId = idStr,
                Url = url,
                LastFetchedAt = DateTime.UtcNow,
            });
        }
        else
        {
            existing.ExternalId = idStr;
            existing.Url = url;
            existing.LastFetchedAt = DateTime.UtcNow;
        }
    }

    /// <summary>Materialise + RemoveRange a filtered set, returning the row count deleted.</summary>
    private async Task<int> DeleteWhereAsync<T>(IQueryable<T> query, CancellationToken ct)
        where T : class
    {
        var rows = await query.ToListAsync(ct);
        _db.Set<T>().RemoveRange(rows);
        return rows.Count;
    }

    public record RepinRequest(string ScientificName, string TaxonRank, long? GbifTaxonKey);

    public record RepinResponse(
        Guid PlantId,
        string OldScientificName,
        string NewScientificName,
        string TaxonRank,
        long? GbifTaxonKey,
        bool IdentityNeedsReview,
        RepinPurgeCounts Purged);

    public record RepinPurgeCounts(int ScalarsCleared, int PlantSourcesDeleted, int CollectionRowsDeleted);
}
