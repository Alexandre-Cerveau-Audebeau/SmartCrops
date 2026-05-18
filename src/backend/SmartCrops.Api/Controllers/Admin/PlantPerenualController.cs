using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Controllers.Admin;

/// <summary>
/// Admin-triggered Perenual enrichment. Third application of the ADR-0003
/// dual-write rule (after GBIF and Trefle). Each successful enrichment commits,
/// in one EF transaction:
/// <list type="number">
///   <item><c>PlantPerenualData</c> — upserted (1-1 with Plant)</item>
///   <item><c>PlantImage</c> rows where <c>Source = Perenual</c> — delete-then-insert</item>
///   <item><c>PlantPest</c> rows where <c>Source = "perenual"</c> — delete-then-insert</item>
///   <item><c>PlantLongDescription</c> rows where <c>Language = "en"</c> AND
///   <c>SourceMethod = "perenual"</c> — delete-then-insert</item>
///   <item><c>PlantSource</c> Perenual row — upserted (one per source per plant)</item>
///   <item><c>Plant</c> denormalized fields — null-coalesce on scalars (Perenual
///   is complementary, not authoritative; we don't overwrite values set by
///   Manual/GBIF/Trefle). The <c>EdibleParts</c> JSON payload is owned by
///   Perenual and overwritten when present.</item>
/// </list>
///
/// <para>Bare <c>[Authorize]</c> matches PR #58 / PR #59 — Identity Roles
/// aren't in place yet. Tighten to an admin role when role-based authz lands.</para>
/// </summary>
[ApiController]
[Authorize]
[Route("api/admin/perenual")]
public class PlantPerenualController : ControllerBase
{
    private readonly SmartCropsDbContext _db;
    private readonly IPlantPerenualEnrichmentService _perenual;
    private readonly ILogger<PlantPerenualController> _logger;

    public PlantPerenualController(
        SmartCropsDbContext db,
        IPlantPerenualEnrichmentService perenual,
        ILogger<PlantPerenualController> logger)
    {
        _db = db;
        _perenual = perenual;
        _logger = logger;
    }

    /// <summary>
    /// Enrich a single plant. Idempotent by default: skipped when the
    /// <see cref="EnrichmentStatus.PerenualEnriched"/> flag is already set,
    /// unless <paramref name="force"/> is supplied to re-fetch.
    ///
    /// <para>When <paramref name="perenualId"/> is provided, the resolver
    /// search step is skipped — useful for cultivars and reclassified species
    /// where Perenual's index does not return the queried scientific name
    /// (e.g. Rosmarinus officinalis is indexed as Salvia rosmarinus).</para>
    /// </summary>
    [HttpPost("enrich/{plantId:guid}")]
    public async Task<IActionResult> Enrich(
        Guid plantId,
        [FromQuery] int? perenualId = null,
        [FromQuery] bool force = false,
        CancellationToken ct = default)
    {
        var plant = await _db.Plants
            .Include(p => p.PerenualData)
            .FirstOrDefaultAsync(p => p.Id == plantId, ct);
        if (plant is null)
        {
            return NotFound();
        }

        if (!force && plant.EnrichmentStatus.HasFlag(EnrichmentStatus.PerenualEnriched))
        {
            return Ok(new EnrichSkippedResponse(true, "AlreadyEnriched"));
        }

        var result = perenualId is int explicitId
            ? await _perenual.ResolveByIdAsync(explicitId, ct)
            : await _perenual.ResolveAsync(plant.ScientificName, ct);

        if (result.PerenualId is null)
        {
            return Ok(new EnrichNoMatchResponse(false, result.MatchType,
                $"No Perenual species found for '{plant.ScientificName}'"));
        }

        // ADR-0003 dual-write — five targets, one transaction. A CHECK or
        // unique-index violation anywhere rolls all writes back, preserving
        // the previous (consistent) state.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        UpsertPerenualData(plant, result);
        await ReplacePerenualImagesAsync(plantId, result.Images, ct);
        await ReplacePerenualPestsAsync(plantId, result.Pests, result.PerenualId.Value, ct);
        await ReplacePerenualLongDescriptionAsync(plantId, result.LongDescriptionEn, ct);
        await UpsertPerenualSourceAsync(plantId, result.PerenualId.Value, ct);
        ApplyPlantDenormalisation(plant, result);

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        _logger.LogInformation(
            "Perenual-enriched plant {PlantId}: id={PerenualId} cultivar={Cultivar} images={Images} pests={Pests} longDescriptions={Descs} supreme={Supreme}",
            plantId, result.PerenualId, result.Cultivar,
            result.Images.Count, result.Pests.Count,
            result.LongDescriptionEn is null ? 0 : 1, result.HasSupremeData);

        return Ok(new EnrichMatchedResponse(
            Matched: true,
            PerenualId: result.PerenualId.Value,
            PerenualScientificName: result.CanonicalScientificName,
            ImagesAdded: result.Images.Count,
            PestsAdded: result.Pests.Count,
            LongDescriptionsAdded: result.LongDescriptionEn is null ? 0 : 1,
            IsExactScientificMatch: IsExactMatch(plant.ScientificName, result.CanonicalScientificName),
            HasSupremeData: result.HasSupremeData));
    }

    /// <summary>
    /// Enrich every plant. Sequential by design — 30 seed plants × two HTTP
    /// hops at ~500 ms each stays well under Perenual's Supreme-tier 100k/day
    /// budget. When <paramref name="force"/> is false, plants that already
    /// carry the <see cref="EnrichmentStatus.PerenualEnriched"/> flag are
    /// skipped via a SQL filter to avoid loading them at all.
    /// </summary>
    [HttpPost("enrich-all")]
    public async Task<IActionResult> EnrichAll(
        [FromQuery] bool force = false,
        CancellationToken ct = default)
    {
        var query = _db.Plants.AsQueryable();
        if (!force)
        {
            query = query.Where(p => (p.EnrichmentStatus & EnrichmentStatus.PerenualEnriched) == 0);
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
                var resp = await Enrich(id, perenualId: null, force, ct);
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
                _logger.LogError(ex, "Failed to Perenual-enrich plant {Id}", id);
            }
            finally
            {
                // The scoped DbContext survives a per-iteration failure: any
                // entity staged before the throw stays tracked and would
                // flush alongside the next iteration's writes. Clearing the
                // change tracker isolates each plant — same fix that landed
                // on PlantTrefleController and PlantTaxonomyController.
                _db.ChangeTracker.Clear();
            }
        }

        return Ok(new EnrichAllResponse(
            Total: plantIds.Count,
            Matched: matched,
            NotMatched: notMatched,
            Skipped: skipped,
            Failed: failed));
    }

    // ── Dual-write helpers ────────────────────────────────────────────────

    private void UpsertPerenualData(Plant plant, PerenualEnrichmentResult result)
    {
        if (plant.PerenualData is null)
        {
            plant.PerenualData = new PlantPerenualData
            {
                PlantId = plant.Id,
                PerenualId = result.PerenualId!.Value,
                Cultivar = result.Cultivar,
                PerenualType = result.PerenualType,
                OriginCountries = result.OriginCountries,
                PropagationMethods = result.PropagationMethods,
                WateringBenchmark = result.WateringBenchmark,
                WateringBenchmarkUnit = result.WateringBenchmarkUnit,
                SunlightPreferences = result.SunlightPreferences,
                PruningMonths = result.PruningMonths,
                Maintenance = result.Maintenance,
                FloweringSeason = result.FloweringSeason,
                HarvestSeason = result.HarvestSeason,
                HasEdibleFruit = result.HasEdibleFruit,
                HasEdibleLeaves = result.HasEdibleLeaves,
                IsCulinary = result.IsCulinary,
                PlantAnatomyJson = result.PlantAnatomyJson,
                RawResponseJson = result.RawResponseJson,
                ApiVersion = "v2",
                HasSupremeData = result.HasSupremeData,
                LastSyncAt = DateTime.UtcNow,
            };
            _db.PlantPerenualData.Add(plant.PerenualData);
        }
        else
        {
            plant.PerenualData.PerenualId = result.PerenualId!.Value;
            plant.PerenualData.Cultivar = result.Cultivar;
            plant.PerenualData.PerenualType = result.PerenualType;
            plant.PerenualData.OriginCountries = result.OriginCountries;
            plant.PerenualData.PropagationMethods = result.PropagationMethods;
            plant.PerenualData.WateringBenchmark = result.WateringBenchmark;
            plant.PerenualData.WateringBenchmarkUnit = result.WateringBenchmarkUnit;
            plant.PerenualData.SunlightPreferences = result.SunlightPreferences;
            plant.PerenualData.PruningMonths = result.PruningMonths;
            plant.PerenualData.Maintenance = result.Maintenance;
            plant.PerenualData.FloweringSeason = result.FloweringSeason;
            plant.PerenualData.HarvestSeason = result.HarvestSeason;
            plant.PerenualData.HasEdibleFruit = result.HasEdibleFruit;
            plant.PerenualData.HasEdibleLeaves = result.HasEdibleLeaves;
            plant.PerenualData.IsCulinary = result.IsCulinary;
            plant.PerenualData.PlantAnatomyJson = result.PlantAnatomyJson;
            plant.PerenualData.RawResponseJson = result.RawResponseJson;
            plant.PerenualData.ApiVersion = "v2";
            plant.PerenualData.HasSupremeData = result.HasSupremeData;
            plant.PerenualData.LastSyncAt = DateTime.UtcNow;
        }
    }

    private async Task ReplacePerenualImagesAsync(
        Guid plantId,
        IReadOnlyList<PerenualImage> images,
        CancellationToken ct)
    {
        // Perenual is one of two sources feeding PlantImage (alongside Trefle).
        // Re-enrichment replaces the full Perenual-sourced set; non-Perenual
        // rows (e.g. Trefle images, future manual uploads) are untouched.
        var existing = await _db.PlantImages
            .Where(i => i.PlantId == plantId && i.Source == PlantSourceType.Perenual)
            .ToListAsync(ct);
        _db.PlantImages.RemoveRange(existing);

        var first = true;
        foreach (var img in images)
        {
            _db.PlantImages.Add(new PlantImage
            {
                PlantId = plantId,
                // First image (Perenual's default_image) is categorised Main;
                // additional images go to Other (Perenual doesn't expose a
                // per-part categorisation).
                ImageType = first ? PlantImageType.Main : PlantImageType.Other,
                Url = img.Url,
                ThumbnailUrl = img.ThumbnailUrl,
                LicenseName = img.LicenseName,
                Source = PlantSourceType.Perenual,
                // Perenual's image entries don't carry stable per-image ids,
                // so SourceExternalId stays null — the partial unique index
                // (PlantId, Source, SourceExternalId) is filtered to NOT NULL,
                // letting multiple null-id Perenual rows coexist within the
                // transaction-scoped delete-then-insert.
            });
            first = false;
        }
    }

    private async Task ReplacePerenualPestsAsync(
        Guid plantId,
        IReadOnlyList<PerenualPest> pests,
        int perenualSpeciesId,
        CancellationToken ct)
    {
        // Perenual is the only D1 source feeding PlantPest. Filter by Source
        // for forward-compat with future pest-data sources.
        const string perenualSource = "perenual";
        var existing = await _db.PlantPests
            .Where(p => p.PlantId == plantId && p.Source == perenualSource)
            .ToListAsync(ct);
        _db.PlantPests.RemoveRange(existing);

        foreach (var pest in pests)
        {
            _db.PlantPests.Add(new PlantPest
            {
                PlantId = plantId,
                Name = pest.Name,
                Type = pest.Type,
                Source = perenualSource,
                // No per-pest external id from /species/details (Perenual
                // returns just names); composite (PlantId, Source, Name) is
                // the de-facto natural key for dedup within a single source.
                SourceExternalId = null,
            });
        }
    }

    private async Task ReplacePerenualLongDescriptionAsync(
        Guid plantId,
        string? longDescriptionEn,
        CancellationToken ct)
    {
        // Filter by Language = "en" only — the schema enforces a unique
        // (PlantId, Language) index (one description per language per plant),
        // so re-enrichment overwrites whatever English description was there
        // regardless of its prior SourceMethod. Other languages survive.
        // Future AI-translated content for non-English languages would land
        // here too without colliding with Perenual's English row.
        const string lang = "en";
        const string sourceMethod = "perenual";
        var existing = await _db.PlantLongDescriptions
            .Where(d => d.PlantId == plantId && d.Language == lang)
            .ToListAsync(ct);
        _db.PlantLongDescriptions.RemoveRange(existing);

        if (string.IsNullOrWhiteSpace(longDescriptionEn))
        {
            return;
        }

        _db.PlantLongDescriptions.Add(new PlantLongDescription
        {
            PlantId = plantId,
            Language = lang,
            LongDescription = longDescriptionEn,
            SourceMethod = sourceMethod,
        });
    }

    private async Task UpsertPerenualSourceAsync(Guid plantId, int perenualId, CancellationToken ct)
    {
        var url = $"https://perenual.com/api/v2/species/details/{perenualId}";
        var existing = await _db.PlantSources
            .FirstOrDefaultAsync(
                s => s.PlantId == plantId && s.SourceType == PlantSourceType.Perenual,
                ct);

        if (existing is null)
        {
            _db.PlantSources.Add(new PlantSource
            {
                PlantId = plantId,
                SourceType = PlantSourceType.Perenual,
                ExternalId = perenualId.ToString(CultureInfo.InvariantCulture),
                Url = url,
                LastFetchedAt = DateTime.UtcNow,
            });
        }
        else
        {
            existing.ExternalId = perenualId.ToString(CultureInfo.InvariantCulture);
            existing.Url = url;
            existing.LastFetchedAt = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Apply denormalized Perenual fields to the curated <c>Plant</c> read
    /// model. Scalars use the canonical null-coalesce contract aligned with
    /// PR #59 round 4: <c>if (plant.X is null) plant.X = result.X;</c> for
    /// every scalar. A curated value (Manual / GBIF / Trefle / seed) is never
    /// overwritten by Perenual — Perenual only fills gaps. The
    /// <c>EdibleParts</c> JSON payload is owned by Perenual (no other source
    /// in D1 produces it) and is overwritten unconditionally when present.
    /// </summary>
    private static void ApplyPlantDenormalisation(Plant plant, PerenualEnrichmentResult result)
    {
        if (plant.LifeCycle is null) plant.LifeCycle = result.LifeCycle;
        if (plant.GrowthRate is null) plant.GrowthRate = result.GrowthRate;
        if (plant.WateringNeedLevel is null) plant.WateringNeedLevel = result.WateringNeed;
        if (plant.CareLevel is null) plant.CareLevel = result.CareLevel;

        if (plant.HardinessZoneMin is null) plant.HardinessZoneMin = result.HardinessZoneMin;
        if (plant.HardinessZoneMax is null) plant.HardinessZoneMax = result.HardinessZoneMax;

        if (plant.MinHeightCm is null) plant.MinHeightCm = result.MinHeightCm;
        if (plant.MaxHeightCm is null) plant.MaxHeightCm = result.MaxHeightCm;

        if (plant.IsEdible is null) plant.IsEdible = result.IsEdible;
        if (plant.IsIndoor is null) plant.IsIndoor = result.IsIndoor;
        if (plant.IsDroughtTolerant is null) plant.IsDroughtTolerant = result.IsDroughtTolerant;
        if (plant.IsSaltTolerant is null) plant.IsSaltTolerant = result.IsSaltTolerant;
        if (plant.IsThorny is null) plant.IsThorny = result.IsThorny;
        if (plant.IsInvasive is null) plant.IsInvasive = result.IsInvasive;
        if (plant.IsTropical is null) plant.IsTropical = result.IsTropical;
        if (plant.IsMedicinal is null) plant.IsMedicinal = result.IsMedicinal;
        if (plant.IsToxicToHumans is null) plant.IsToxicToHumans = result.IsToxicToHumans;
        if (plant.IsToxicToPets is null) plant.IsToxicToPets = result.IsToxicToPets;

        if (plant.PropagationInstructions is null) plant.PropagationInstructions = result.PropagationInstructions;
        if (plant.SowingInstructions is null) plant.SowingInstructions = result.SowingInstructions;

        // Perenual owns EdibleParts in D1 (no other source produces this JSON)
        // — overwrite when present so re-enrichment after a Perenual data fix
        // reaches the read model. NULL result preserves whatever was there.
        if (result.EdiblePartsJson is not null)
        {
            plant.EdibleParts = result.EdiblePartsJson;
        }

        plant.EnrichmentStatus |= EnrichmentStatus.PerenualEnriched;
        plant.LastEnrichmentAt = DateTime.UtcNow;
    }

    private static bool IsExactMatch(string queriedName, string? canonicalName)
        => canonicalName is not null
        && string.Equals(queriedName, canonicalName, StringComparison.OrdinalIgnoreCase);

    // ── Response records ──────────────────────────────────────────────────

    public record EnrichMatchedResponse(
        bool Matched,
        int PerenualId,
        string? PerenualScientificName,
        int ImagesAdded,
        int PestsAdded,
        int LongDescriptionsAdded,
        bool IsExactScientificMatch,
        bool HasSupremeData);

    public record EnrichNoMatchResponse(bool Matched, string MatchType, string Reason);

    public record EnrichSkippedResponse(bool Skipped, string Reason);

    public record EnrichAllResponse(
        int Total,
        int Matched,
        int NotMatched,
        int Skipped,
        int Failed);
}
