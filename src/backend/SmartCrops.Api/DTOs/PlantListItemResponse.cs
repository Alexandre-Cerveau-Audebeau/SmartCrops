using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;

namespace SmartCrops.Api.DTOs;

/// <summary>
/// Neutral list/grid projection for <c>GET /api/plants</c>, <c>/type/{id}</c> and
/// <c>/search</c>. Replaces the previous raw-<see cref="Plant"/>-entity response,
/// which leaked licensed Perenual source text (sowing/propagation instructions,
/// edible parts) and serialised every empty navigation — including
/// <c>GardenPlants</c>/<c>Suggestions</c> (SMA-70).
///
/// <para>It carries only identity, type, the primary image (with a non-null
/// attribution), the filterable boolean flags, and factual non-copyrightable
/// scalars (hardiness, dimensions, pH, temperatures, enum keys). It deliberately
/// omits all source free-text and the navigation collections — the detail
/// endpoint is the single place that materialises the full graph, gated by
/// <see cref="Configuration.ContentExposureOptions.ExposeSourceText"/>.</para>
/// </summary>
public record PlantListItemResponse
{
    public Guid Id { get; init; }
    public required string ScientificName { get; init; }

    /// <summary>
    /// Localised common name (SMA-5). <c>null</c> when neither the requested language
    /// nor the English fallback translation is loaded (the list query, via
    /// <c>ApplyListIncludes</c>, materialises only those two languages) — the client
    /// then falls back to <see cref="ScientificName"/>.
    /// </summary>
    public string? CommonName { get; init; }

    /// <summary>
    /// Localised short description (SMA-5). <c>null</c> when neither the requested
    /// language nor the English fallback translation is loaded, or when that
    /// translation simply has no description.
    /// </summary>
    public string? Description { get; init; }

    public int PlantTypeId { get; init; }
    public PlantTypeDto? PlantType { get; init; }

    /// <summary>
    /// Primary image URL: a STABLE-source image (Trefle/PlantNet) chosen by cover-type
    /// priority, or <c>null</c> when the plant has none (SMA-118). Perenual <c>Main</c>
    /// images are deliberately excluded — their signed S3 URLs expire (~24h) and 403 —
    /// and the legacy denormalised scalar is no longer used as a fallback.
    /// </summary>
    public string? ImageUrl { get; init; }

    /// <summary>Attribution for the chosen <see cref="ImageUrl"/> image row; <c>null</c> when <see cref="ImageUrl"/> is null.</summary>
    public string? ImageAttribution { get; init; }

    public string? SunExposure { get; init; }
    public string? WaterNeeds { get; init; }
    public string? SowingPeriod { get; init; }
    public string? HarvestPeriod { get; init; }

    public string? LifeCycle { get; init; }
    public string? GrowthRate { get; init; }
    public string? WateringNeedLevel { get; init; }
    public string? CareLevel { get; init; }
    public string? GrowthHabit { get; init; }

    public int? HardinessZoneMin { get; init; }
    public int? HardinessZoneMax { get; init; }
    public int? MinHeightCm { get; init; }
    public int? MaxHeightCm { get; init; }
    public int? MinSpreadCm { get; init; }
    public int? MaxSpreadCm { get; init; }
    public decimal? SoilPhMin { get; init; }
    public decimal? SoilPhMax { get; init; }
    public int? LightLevel { get; init; }
    public int? MinTempC { get; init; }
    public int? MaxTempC { get; init; }

    public bool? IsEdible { get; init; }
    public bool? IsVegetable { get; init; }
    public bool? IsMedicinal { get; init; }
    public bool? IsIndoor { get; init; }
    public bool? IsDroughtTolerant { get; init; }
    public bool? IsSaltTolerant { get; init; }
    public bool? IsThorny { get; init; }
    public bool? IsInvasive { get; init; }
    public bool? IsTropical { get; init; }
    public bool? IsToxicToHumans { get; init; }
    public bool? IsToxicToPets { get; init; }
    public bool? AttractsPollinators { get; init; }
}

/// <summary>
/// Maps the lean list query (Plant + PlantType + the filtered <c>Main</c> image)
/// to <see cref="PlantListItemResponse"/>. Source free-text and navigation
/// collections are intentionally never read here.
/// </summary>
public static class PlantListItemMapper
{
    public static PlantListItemResponse ToListItem(Plant plant, string language = "en")
    {
        ArgumentNullException.ThrowIfNull(plant);

        // SMA-5: pick the requested language's translation, falling back to English,
        // then any loaded translation. The list query filtered-includes only the
        // requested language + English (<=2 rows), so this is a cheap in-memory pick.
        var translation = plant.Translations.FirstOrDefault(t => t.Language == language)
            ?? plant.Translations.FirstOrDefault(t => t.Language == "en")
            ?? plant.Translations.FirstOrDefault();

        // SMA-118: pick a STABLE-source image (Trefle/PlantNet) only. Perenual
        // `Main` images are time-limited signed S3 URLs that expire (~24h) and now
        // 403, so they must never be surfaced — a plant with only Perenual images
        // gets a null imageUrl (the client renders its placeholder) rather than a
        // dead URL. We deliberately do NOT fall back to the denormalised ImageUrl
        // scalar (a legacy Perenual-era value). Ordering: a sensible cover-type
        // priority (Habit → Flower → Leaf → …), then DisplayOrder/Id so the choice
        // is deterministic across requests. The source filter is defensive — the
        // list query already loads only stable images.
        var primary = plant.Images
            .Where(i => i.Source is PlantSourceType.Trefle or PlantSourceType.PlantNet)
            .OrderBy(i => StableImageRank(i.ImageType))
            .ThenBy(i => i.DisplayOrder)
            .ThenBy(i => i.Id)
            .FirstOrDefault();
        var imageUrl = primary?.Url;
        var attribution = primary is null
            ? null
            : ImageAttribution.Compose(primary.Credit, primary.LicenseName, primary.Source);

        return new PlantListItemResponse
        {
            Id = plant.Id,
            ScientificName = plant.ScientificName,
            CommonName = translation?.CommonName,
            Description = translation?.Description,
            PlantTypeId = plant.PlantTypeId,
            PlantType = plant.PlantType is null
                ? null
                : new PlantTypeDto(plant.PlantType.Id, plant.PlantType.Name, plant.PlantType.Description),

            ImageUrl = imageUrl,
            ImageAttribution = attribution,

            SunExposure = plant.SunExposure,
            WaterNeeds = plant.WaterNeeds,
            SowingPeriod = plant.SowingPeriod,
            HarvestPeriod = plant.HarvestPeriod,

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
        };
    }

    /// <summary>
    /// Cover-image type priority for the list card (SMA-118): a whole-plant
    /// <c>Habit</c> shot reads best, then <c>Flower</c>, then <c>Leaf</c>, then the
    /// remaining detail types. Lower sorts first; unknown types sort last.
    /// </summary>
    private static int StableImageRank(PlantImageType type) => type switch
    {
        PlantImageType.Habit => 0,
        PlantImageType.Flower => 1,
        PlantImageType.Leaf => 2,
        PlantImageType.Fruit => 3,
        PlantImageType.Bark => 4,
        _ => 5,
    };
}
