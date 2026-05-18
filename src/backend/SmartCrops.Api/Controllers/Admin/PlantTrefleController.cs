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
/// Admin-triggered Trefle enrichment. Second application of the ADR-0003
/// dual-write rule (after the GBIF taxonomy controller). Each successful
/// enrichment commits, in one EF transaction:
/// <list type="number">
///   <item><c>PlantTrefleData</c> — upserted (1-1 with Plant)</item>
///   <item><c>PlantImage</c> rows where <c>Source = Trefle</c> — delete-then-insert</item>
///   <item><c>PlantCommonName</c> rows — delete-then-insert (Trefle is the only D1 source)</item>
///   <item><c>PlantSynonym</c> rows — delete-then-insert (Trefle is the only D1 source)</item>
///   <item><c>PlantSource</c> Trefle row — upserted (one per source per plant)</item>
///   <item><c>Plant</c> denormalized fields — null-coalesce on scalars (Trefle is
///   complementary, not authoritative; we don't overwrite values set by
///   manual/GBIF/seed). JSON payload fields are overwritten because Trefle
///   owns them entirely.</item>
/// </list>
///
/// <para>Bare <c>[Authorize]</c> matches PR #58 — Identity Roles aren't in
/// place yet (tracked in project memory). Tighten to an admin role when the
/// role-based authz lands.</para>
/// </summary>
[ApiController]
[Authorize]
[Route("api/admin/trefle")]
public class PlantTrefleController : ControllerBase
{
    private readonly SmartCropsDbContext _db;
    private readonly IPlantTrefleEnrichmentService _trefle;
    private readonly ILogger<PlantTrefleController> _logger;

    public PlantTrefleController(
        SmartCropsDbContext db,
        IPlantTrefleEnrichmentService trefle,
        ILogger<PlantTrefleController> logger)
    {
        _db = db;
        _trefle = trefle;
        _logger = logger;
    }

    /// <summary>
    /// Enrich a single plant. Idempotent by default: skipped when the
    /// <see cref="EnrichmentStatus.TrefleEnriched"/> flag is already set,
    /// unless <paramref name="force"/> is supplied to re-fetch.
    /// </summary>
    [HttpPost("enrich/{plantId:guid}")]
    public async Task<IActionResult> Enrich(
        Guid plantId,
        [FromQuery] bool force = false,
        CancellationToken ct = default)
    {
        var plant = await _db.Plants
            .Include(p => p.TrefleData)
            .FirstOrDefaultAsync(p => p.Id == plantId, ct);
        if (plant is null)
        {
            return NotFound();
        }

        if (!force && plant.EnrichmentStatus.HasFlag(EnrichmentStatus.TrefleEnriched))
        {
            return Ok(new EnrichSkippedResponse(true, "AlreadyEnriched"));
        }

        var result = await _trefle.ResolveAsync(plant.ScientificName, ct);
        if (result.TrefleId is null)
        {
            return Ok(new EnrichNoMatchResponse(false, result.MatchType));
        }

        // ADR-0003 dual-write — five targets, one transaction. A CHECK or
        // unique-index violation anywhere rolls all writes back, preserving
        // the previous (consistent) state.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        UpsertTrefleData(plant, result);
        await ReplaceTrefleImagesAsync(plantId, result.Images, ct);
        await ReplaceCommonNamesAsync(plantId, result.CommonNames, ct);
        await ReplaceSynonymsAsync(plantId, result.Synonyms, ct);
        await UpsertTrefleSourceAsync(plantId, result.TrefleId.Value, ct);
        ApplyPlantDenormalisation(plant, result);

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        _logger.LogInformation(
            "Trefle-enriched plant {PlantId}: id={TrefleId} slug={Slug} images={Images} commonNames={Names} synonyms={Synonyms}",
            plantId, result.TrefleId, result.TrefleSlug,
            result.Images.Count, result.CommonNames.Count, result.Synonyms.Count);

        return Ok(new EnrichMatchedResponse(
            true,
            result.TrefleId.Value,
            result.TrefleSlug,
            result.Images.Count,
            result.CommonNames.Count,
            result.Synonyms.Count));
    }

    /// <summary>
    /// Enrich every plant. Sequential by design — 30 seed plants × two HTTP
    /// hops at ~500 ms each stays well under Trefle's 120 req/min budget.
    /// When <paramref name="force"/> is false, plants that already carry the
    /// <see cref="EnrichmentStatus.TrefleEnriched"/> flag are skipped via a
    /// SQL filter to avoid loading them at all.
    /// </summary>
    [HttpPost("enrich-all")]
    public async Task<IActionResult> EnrichAll(
        [FromQuery] bool force = false,
        CancellationToken ct = default)
    {
        var query = _db.Plants.AsQueryable();
        if (!force)
        {
            query = query.Where(p => (p.EnrichmentStatus & EnrichmentStatus.TrefleEnriched) == 0);
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
                _logger.LogError(ex, "Failed to Trefle-enrich plant {Id}", id);
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

        return Ok(new EnrichAllResponse(
            Total: plantIds.Count,
            Matched: matched,
            NotMatched: notMatched,
            Skipped: skipped,
            Failed: failed));
    }

    // ── Dual-write helpers ────────────────────────────────────────────────

    private void UpsertTrefleData(Plant plant, TrefleEnrichmentResult result)
    {
        if (plant.TrefleData is null)
        {
            plant.TrefleData = new PlantTrefleData
            {
                PlantId = plant.Id,
                TrefleSlug = result.TrefleSlug,
                WfoId = result.WfoId,
                GrowthHabit = result.GrowthHabit,
                FlowerColors = result.FlowerColorsJson,
                FoliageColors = result.FoliageColorsJson,
                NativeRegionsJson = result.NativeRegionsJson,
                IntroducedRegionsJson = result.IntroducedRegionsJson,
                SoilNutrimentsLevel = result.SoilNutriments,
                RawResponseJson = result.RawResponseJson,
                LastSyncAt = DateTime.UtcNow,
            };
            _db.PlantTrefleData.Add(plant.TrefleData);
        }
        else
        {
            plant.TrefleData.TrefleSlug = result.TrefleSlug;
            plant.TrefleData.WfoId = result.WfoId;
            plant.TrefleData.GrowthHabit = result.GrowthHabit;
            plant.TrefleData.FlowerColors = result.FlowerColorsJson;
            plant.TrefleData.FoliageColors = result.FoliageColorsJson;
            plant.TrefleData.NativeRegionsJson = result.NativeRegionsJson;
            plant.TrefleData.IntroducedRegionsJson = result.IntroducedRegionsJson;
            plant.TrefleData.SoilNutrimentsLevel = result.SoilNutriments;
            plant.TrefleData.RawResponseJson = result.RawResponseJson;
            plant.TrefleData.LastSyncAt = DateTime.UtcNow;
        }
    }

    private async Task ReplaceTrefleImagesAsync(
        Guid plantId,
        IReadOnlyList<TrefleImage> images,
        CancellationToken ct)
    {
        // Trefle is the only D1 source feeding PlantImage. Re-enrichment
        // replaces the full Trefle-sourced set; non-Trefle rows (e.g. future
        // manual uploads) are untouched.
        var existing = await _db.PlantImages
            .Where(i => i.PlantId == plantId && i.Source == PlantSourceType.Trefle)
            .ToListAsync(ct);
        _db.PlantImages.RemoveRange(existing);

        foreach (var img in images)
        {
            _db.PlantImages.Add(new PlantImage
            {
                PlantId = plantId,
                ImageType = img.ImageType,
                Url = img.Url,
                LicenseName = img.LicenseName,
                Credit = img.Credit,
                Source = PlantSourceType.Trefle,
                // Trefle's API doesn't expose per-image ids. Leaving
                // SourceExternalId null is safe — the partial unique index
                // (PlantId, Source, SourceExternalId) is filtered to NOT
                // NULL, so multiple null-id Trefle rows are allowed and the
                // transaction-scoped delete-then-insert prevents duplicates.
            });
        }
    }

    private async Task ReplaceCommonNamesAsync(
        Guid plantId,
        IReadOnlyList<TrefleCommonName> commonNames,
        CancellationToken ct)
    {
        // PlantCommonName has no Source column today — every D1 row comes
        // from Trefle. Replace wholesale; revisit when a second source
        // (Perenual, user-submitted) starts populating this table.
        var existing = await _db.PlantCommonNames
            .Where(c => c.PlantId == plantId)
            .ToListAsync(ct);
        _db.PlantCommonNames.RemoveRange(existing);

        // The partial unique index (PlantId, LanguageCode) WHERE IsPrimary
        // = TRUE requires at most one primary per language. Mark the first
        // name we see per language as primary; the rest stay non-primary.
        var primarySeen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var cn in commonNames)
        {
            var isPrimary = primarySeen.Add(cn.LanguageCode);
            _db.PlantCommonNames.Add(new PlantCommonName
            {
                PlantId = plantId,
                LanguageCode = cn.LanguageCode,
                Name = cn.Name,
                IsPrimary = isPrimary,
            });
        }
    }

    private async Task ReplaceSynonymsAsync(
        Guid plantId,
        IReadOnlyList<TrefleSynonym> synonyms,
        CancellationToken ct)
    {
        var existing = await _db.PlantSynonyms
            .Where(s => s.PlantId == plantId)
            .ToListAsync(ct);
        _db.PlantSynonyms.RemoveRange(existing);

        foreach (var syn in synonyms)
        {
            _db.PlantSynonyms.Add(new PlantSynonym
            {
                PlantId = plantId,
                Synonym = syn.Name,
                Authority = syn.Authority,
            });
        }
    }

    private async Task UpsertTrefleSourceAsync(Guid plantId, int trefleId, CancellationToken ct)
    {
        var url = $"https://trefle.io/api/v1/species/{trefleId}";
        var existing = await _db.PlantSources
            .FirstOrDefaultAsync(
                s => s.PlantId == plantId && s.SourceType == PlantSourceType.Trefle,
                ct);

        if (existing is null)
        {
            _db.PlantSources.Add(new PlantSource
            {
                PlantId = plantId,
                SourceType = PlantSourceType.Trefle,
                ExternalId = trefleId.ToString(System.Globalization.CultureInfo.InvariantCulture),
                Url = url,
                LastFetchedAt = DateTime.UtcNow,
            });
        }
        else
        {
            existing.ExternalId = trefleId.ToString(System.Globalization.CultureInfo.InvariantCulture);
            existing.Url = url;
            existing.LastFetchedAt = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Apply denormalized Trefle fields to the curated <c>Plant</c> read model.
    /// Scalars use null-coalescing (don't overwrite a value already set by a
    /// higher-priority source); JSON payloads (Flower / Native / Introduced)
    /// are owned by Trefle and overwritten unconditionally. <c>WfoId</c> is
    /// preserved if GBIF set it first — GBIF's WFO mapping is treated as
    /// authoritative when both sources agree, and the first writer wins
    /// otherwise.
    /// </summary>
    private static void ApplyPlantDenormalisation(Plant plant, TrefleEnrichmentResult result)
    {
        if (string.IsNullOrEmpty(plant.WfoId))
        {
            plant.WfoId = result.WfoId;
        }

        plant.FlowerColors = result.FlowerColorsJson;
        plant.NativeRegions = result.NativeRegionsJson;
        plant.IntroducedRegions = result.IntroducedRegionsJson;

        // Scalar fields: Plant takes precedence. A curated value (manual entry,
        // GBIF, seed data) is never overwritten by Trefle — Trefle only fills
        // gaps. LightLevel + SoilNutriments are additionally range-guarded
        // against Plant CHECK constraints (LightLevel 1-10, SoilNutriments
        // 0-10) so a Trefle outlier (observed: LightLevel=0) cannot abort the
        // whole enrichment transaction.
        if (plant.LightLevel is null && result.LightLevel is int light and >= 1 and <= 10)
        {
            plant.LightLevel = light;
        }

        if (plant.SoilNutriments is null && result.SoilNutriments is int nut and >= 0 and <= 10)
        {
            plant.SoilNutriments = nut;
        }

        if (plant.SoilPhMin is null) plant.SoilPhMin = result.SoilPhMin;
        if (plant.SoilPhMax is null) plant.SoilPhMax = result.SoilPhMax;
        if (plant.MinTempC is null) plant.MinTempC = result.MinTempC;
        if (plant.MaxTempC is null) plant.MaxTempC = result.MaxTempC;
        if (plant.IsEdible is null) plant.IsEdible = result.IsEdible;
        if (plant.IsVegetable is null) plant.IsVegetable = result.IsVegetable;

        if (plant.GrowthHabit is null && TryParseGrowthHabit(result.GrowthHabit, out var habit))
        {
            plant.GrowthHabit = habit;
        }

        plant.EnrichmentStatus |= EnrichmentStatus.TrefleEnriched;
        plant.LastEnrichmentAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Trefle reports growth habits as free-text strings (e.g. "Forb/herb",
    /// "Tree", "Subshrub"). We parse against <see cref="PlantGrowthHabit"/>
    /// case-insensitively; compound values like "Forb/herb" fall back to the
    /// token before the slash so "Forb/herb" → <c>Forb</c>. Unknown values
    /// leave the existing <c>Plant.GrowthHabit</c> untouched.
    /// </summary>
    private static bool TryParseGrowthHabit(string? raw, out PlantGrowthHabit habit)
    {
        habit = default;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        if (Enum.TryParse(raw, ignoreCase: true, out habit))
        {
            return true;
        }

        var slashIdx = raw.IndexOf('/');
        if (slashIdx > 0)
        {
            return Enum.TryParse(raw[..slashIdx].Trim(), ignoreCase: true, out habit);
        }

        return false;
    }

    // ── Response records ──────────────────────────────────────────────────

    public record EnrichMatchedResponse(
        bool Matched,
        int TrefleId,
        string? TrefleSlug,
        int ImagesAdded,
        int CommonNamesAdded,
        int SynonymsAdded);

    public record EnrichNoMatchResponse(bool Matched, string MatchType);

    public record EnrichSkippedResponse(bool Skipped, string Reason);

    public record EnrichAllResponse(
        int Total,
        int Matched,
        int NotMatched,
        int Skipped,
        int Failed);
}
