using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;

namespace SmartCrops.Api.DTOs;

/// <summary>
/// Plant → <see cref="PlantDetailResponse"/> projection used by
/// <c>PlantsController.GetById</c>. Image ordering is applied here rather than in
/// the repository because <see cref="PlantImageType"/> stores Habit as <c>5</c>
/// but the gallery wants it second after Main(=1) — a plain SQL <c>ORDER BY</c>
/// on the enum int would push Habit behind Flower/Leaf/Fruit. The repository
/// pre-sorts images by <c>DisplayOrder</c>, then this mapper applies the
/// stable type-priority sort on top.
///
/// <para>The <see cref="PlantImageType"/>-to-priority table is the canonical
/// gallery ordering for both backend and frontend — keep them in sync.</para>
/// </summary>
public static class PlantDetailMapper
{
    /// <summary>
    /// Priority used for hero selection and gallery ordering. Lower = earlier.
    /// Anything not listed falls through to <see cref="int.MaxValue"/>.
    /// </summary>
    private static readonly Dictionary<PlantImageType, int> ImageTypePriority = new()
    {
        [PlantImageType.Main] = 0,
        [PlantImageType.Habit] = 1,
        [PlantImageType.Flower] = 2,
        [PlantImageType.Leaf] = 3,
        [PlantImageType.Fruit] = 4,
        [PlantImageType.Bark] = 5,
        [PlantImageType.Other] = 6,
    };

    /// <summary>
    /// Project a fully-loaded <see cref="Plant"/> aggregate into the
    /// <see cref="PlantDetailResponse"/> contract: enum scalars become
    /// strings, the <c>EnrichmentStatus</c> bitfield is exploded into a
    /// string array, collections are reordered for gallery / accessibility
    /// concerns, and audit blobs (<c>RawResponseJson</c>) are dropped.
    /// </summary>
    /// <exception cref="ArgumentNullException">when <paramref name="plant"/> is null.</exception>
    public static PlantDetailResponse ToDto(Plant plant)
    {
        ArgumentNullException.ThrowIfNull(plant);

        return new PlantDetailResponse
        {
            Id = plant.Id,
            ScientificName = plant.ScientificName,
            PlantTypeId = plant.PlantTypeId,
            PlantType = plant.PlantType is null
                ? null
                : new PlantTypeDto(plant.PlantType.Id, plant.PlantType.Name, plant.PlantType.Description),

            SunExposure = plant.SunExposure,
            WaterNeeds = plant.WaterNeeds,
            SowingPeriod = plant.SowingPeriod,
            HarvestPeriod = plant.HarvestPeriod,
            ImageUrl = plant.ImageUrl,

            GbifTaxonKey = plant.GbifTaxonKey,
            Family = plant.Family,
            Genus = plant.Genus,
            SpeciesEpithet = plant.SpeciesEpithet,
            Author = plant.Author,
            WfoId = plant.WfoId,
            Year = plant.Year,

            LifeCycle = plant.LifeCycle?.ToString(),
            GrowthRate = plant.GrowthRate?.ToString(),
            WateringNeedLevel = plant.WateringNeedLevel?.ToString(),
            CareLevel = plant.CareLevel?.ToString(),
            GrowthHabit = plant.GrowthHabit?.ToString(),

            HardinessZoneMin = plant.HardinessZoneMin,
            HardinessZoneMax = plant.HardinessZoneMax,
            MinHeightCm = plant.MinHeightCm,
            MaxHeightCm = plant.MaxHeightCm,
            MinSpreadCm = plant.MinSpreadCm,
            MaxSpreadCm = plant.MaxSpreadCm,
            SoilPhMin = plant.SoilPhMin,
            SoilPhMax = plant.SoilPhMax,
            LightLevel = plant.LightLevel,
            SoilNutriments = plant.SoilNutriments,
            MinTempC = plant.MinTempC,
            MaxTempC = plant.MaxTempC,

            IsEdible = plant.IsEdible,
            IsVegetable = plant.IsVegetable,
            IsMedicinal = plant.IsMedicinal,
            IsIndoor = plant.IsIndoor,
            IsDroughtTolerant = plant.IsDroughtTolerant,
            IsSaltTolerant = plant.IsSaltTolerant,
            IsThorny = plant.IsThorny,
            IsInvasive = plant.IsInvasive,
            IsTropical = plant.IsTropical,
            IsToxicToHumans = plant.IsToxicToHumans,
            IsToxicToPets = plant.IsToxicToPets,
            AttractsPollinators = plant.AttractsPollinators,

            FlowerColors = plant.FlowerColors,
            NativeRegions = plant.NativeRegions,
            IntroducedRegions = plant.IntroducedRegions,
            EdibleParts = plant.EdibleParts,
            SowingInstructions = plant.SowingInstructions,
            PropagationInstructions = plant.PropagationInstructions,

            EnrichmentSources = MapEnrichmentSources(plant.EnrichmentStatus),
            LastEnrichmentAt = plant.LastEnrichmentAt,

            CreatedAt = plant.CreatedAt,
            UpdatedAt = plant.UpdatedAt,

            Translations = plant.Translations
                .Select(t => new PlantTranslationDto(t.Id, t.Language, t.CommonName, t.Description))
                .ToList(),

            Images = plant.Images
                .OrderBy(i => ImageTypePriority.GetValueOrDefault(i.ImageType, int.MaxValue))
                .ThenBy(i => i.DisplayOrder)
                .ThenBy(i => i.Id)
                .Select(i => new PlantImageDto(
                    i.Id,
                    i.ImageType.ToString(),
                    i.Url,
                    i.ThumbnailUrl,
                    i.Width,
                    i.Height,
                    i.LicenseName,
                    i.LicenseUrl,
                    i.Credit,
                    i.Source.ToString(),
                    i.SourceExternalId,
                    i.DisplayOrder,
                    i.IsFlagged))
                .ToList(),

            LongDescriptions = plant.LongDescriptions
                .Select(d => new PlantLongDescriptionDto(d.Id, d.Language, d.LongDescription, d.SourceMethod))
                .ToList(),

            CommonNames = plant.CommonNames
                .Select(c => new PlantCommonNameDto(c.Id, c.LanguageCode, c.Name, c.IsPrimary))
                .ToList(),

            Pests = plant.Pests
                .Select(p => new PlantPestDto(
                    p.Id,
                    p.Name,
                    p.Type.ToString(),
                    p.Description,
                    p.Symptoms,
                    p.Solutions,
                    p.ImageUrl,
                    p.Source,
                    p.SourceExternalId))
                .ToList(),

            Synonyms = plant.Synonyms
                .Select(s => new PlantSynonymDto(s.Id, s.Synonym, s.Authority))
                .ToList(),

            Sources = plant.Sources
                .Select(s => new PlantSourceDto(
                    s.Id,
                    s.SourceType.ToString(),
                    s.ExternalId,
                    s.Url,
                    s.Notes,
                    s.LastFetchedAt))
                .ToList(),

            TrefleData = plant.TrefleData is null
                ? null
                : new PlantTrefleDataDto(
                    plant.TrefleData.Id,
                    plant.TrefleData.TrefleSlug,
                    plant.TrefleData.WfoId,
                    plant.TrefleData.GrowthHabit,
                    plant.TrefleData.FlowerColors,
                    plant.TrefleData.FoliageColors,
                    plant.TrefleData.NativeRegionsJson,
                    plant.TrefleData.IntroducedRegionsJson,
                    plant.TrefleData.SoilNutrimentsLevel,
                    plant.TrefleData.SoilSalinityLevel,
                    plant.TrefleData.AtmosphericHumidityLevel,
                    plant.TrefleData.ApiVersion,
                    plant.TrefleData.LastSyncAt),

            PerenualData = plant.PerenualData is null
                ? null
                : new PlantPerenualDataDto(
                    plant.PerenualData.Id,
                    plant.PerenualData.PerenualId,
                    plant.PerenualData.RequestedPerenualId,
                    plant.PerenualData.Cultivar,
                    plant.PerenualData.PerenualType,
                    plant.PerenualData.OriginCountries,
                    plant.PerenualData.PropagationMethods,
                    plant.PerenualData.WateringBenchmark,
                    plant.PerenualData.WateringBenchmarkUnit,
                    plant.PerenualData.SunlightPreferences,
                    plant.PerenualData.PruningMonths,
                    plant.PerenualData.Maintenance,
                    plant.PerenualData.FloweringSeason,
                    plant.PerenualData.HarvestSeason,
                    plant.PerenualData.HasEdibleFruit,
                    plant.PerenualData.HasEdibleLeaves,
                    plant.PerenualData.IsCulinary,
                    plant.PerenualData.PlantAnatomyJson,
                    plant.PerenualData.ApiVersion,
                    plant.PerenualData.HasSupremeData,
                    plant.PerenualData.LastSyncAt),
        };
    }

    /// <summary>
    /// Explode the <see cref="EnrichmentStatus"/> bitfield into a stable string
    /// array. The labels are display-friendly (<c>"GBIF"</c>, <c>"Trefle"</c>,
    /// <c>"Perenual"</c>) — they intentionally diverge from the enum member
    /// names (<c>GbifEnriched</c>, etc.) so the frontend can render them as-is
    /// without an i18n lookup table.
    /// </summary>
    private static IReadOnlyList<string> MapEnrichmentSources(EnrichmentStatus status)
    {
        var sources = new List<string>(capacity: 4);
        if (status.HasFlag(EnrichmentStatus.Manual)) sources.Add("Manual");
        if (status.HasFlag(EnrichmentStatus.GbifEnriched)) sources.Add("GBIF");
        if (status.HasFlag(EnrichmentStatus.TrefleEnriched)) sources.Add("Trefle");
        if (status.HasFlag(EnrichmentStatus.PerenualEnriched)) sources.Add("Perenual");
        return sources;
    }
}
