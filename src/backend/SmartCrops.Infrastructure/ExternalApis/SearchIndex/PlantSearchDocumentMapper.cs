using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.ExternalApis.SearchIndex;

/// <summary>
/// Pure Plant → <see cref="PlantSearchDocument"/> mapping (no I/O, no DB, no
/// logging — unit-testable in isolation). Encodes the "absence never excludes"
/// null-handling contract documented on <see cref="PlantSearchDocument"/>:
/// null enums → <see cref="Unknown"/>, null booleans → 3-state
/// <see cref="Unknown"/>, null numerics → omitted value + companion
/// <c>&lt;field&gt;Known = false</c>.
/// </summary>
public static class PlantSearchDocumentMapper
{
    /// <summary>Sentinel indexed for null enum/boolean facets.</summary>
    public const string Unknown = "unknown";

    /// <summary>
    /// Maps one Plant (with <c>Translations</c> and <c>PerenualData</c> loaded)
    /// to its search document. Localized text resolution mirrors
    /// <c>PlantListItemMapper</c>: the French fields fall back to English when
    /// no French translation exists (so a French search still hits
    /// English-only content); English has no further fallback.
    /// </summary>
    public static PlantSearchDocument ToDocument(Plant plant)
    {
        var en = plant.Translations.FirstOrDefault(t => t.Language == "en");
        var fr = plant.Translations.FirstOrDefault(t => t.Language == "fr");
        var xData = plant.PerenualData;

        return new PlantSearchDocument
        {
            Id = plant.Id.ToString(),

            ScientificName = plant.ScientificName,
            CommonNameEn = en?.CommonName,
            CommonNameFr = fr?.CommonName ?? en?.CommonName,
            DescriptionEn = en?.Description,
            DescriptionFr = fr?.Description ?? en?.Description,

            PlantTypeId = plant.PlantTypeId,

            IsEdible = TriState(plant.IsEdible),
            IsToxicToHumans = TriState(plant.IsToxicToHumans),
            IsToxicToPets = TriState(plant.IsToxicToPets),
            IsIndoor = TriState(plant.IsIndoor),
            IsDroughtTolerant = TriState(plant.IsDroughtTolerant),
            IsMedicinal = TriState(plant.IsMedicinal),
            IsSaltTolerant = TriState(plant.IsSaltTolerant),
            IsThorny = TriState(plant.IsThorny),
            IsTropical = TriState(plant.IsTropical),
            IsInvasive = TriState(plant.IsInvasive),

            CareLevel = plant.CareLevel?.ToString() ?? Unknown,
            WateringNeedLevel = plant.WateringNeedLevel?.ToString() ?? Unknown,
            GrowthRate = plant.GrowthRate?.ToString() ?? Unknown,
            LifeCycle = plant.LifeCycle?.ToString() ?? Unknown,

            HardinessZoneMin = plant.HardinessZoneMin,
            HardinessZoneMinKnown = plant.HardinessZoneMin.HasValue,
            HardinessZoneMax = plant.HardinessZoneMax,
            HardinessZoneMaxKnown = plant.HardinessZoneMax.HasValue,
            MinHeightCm = plant.MinHeightCm,
            MinHeightCmKnown = plant.MinHeightCm.HasValue,
            MaxHeightCm = plant.MaxHeightCm,
            MaxHeightCmKnown = plant.MaxHeightCm.HasValue,

            XSunlightHoursMin = xData?.XSunlightHoursMin,
            XSunlightHoursMinKnown = xData?.XSunlightHoursMin is not null,
            XSunlightHoursMax = xData?.XSunlightHoursMax,
            XSunlightHoursMaxKnown = xData?.XSunlightHoursMax is not null,
            XWateringPhMin = (float?)xData?.XWateringPhMin,
            XWateringPhMinKnown = xData?.XWateringPhMin is not null,
            XWateringPhMax = (float?)xData?.XWateringPhMax,
            XWateringPhMaxKnown = xData?.XWateringPhMax is not null,
            XWateringBasedTempMinC = xData?.XWateringBasedTempMinC,
            XWateringBasedTempMinCKnown = xData?.XWateringBasedTempMinC is not null,
            XWateringBasedTempMaxC = xData?.XWateringBasedTempMaxC,
            XWateringBasedTempMaxCKnown = xData?.XWateringBasedTempMaxC is not null,
            XPlantSpacingValue = xData?.XPlantSpacingValue,
            XPlantSpacingValueKnown = xData?.XPlantSpacingValue is not null,
            XTemperatureToleranceMinC = xData?.XTemperatureToleranceMinC,
            XTemperatureToleranceMinCKnown = xData?.XTemperatureToleranceMinC is not null,
            XTemperatureToleranceMaxC = xData?.XTemperatureToleranceMaxC,
            XTemperatureToleranceMaxCKnown = xData?.XTemperatureToleranceMaxC is not null,
        };
    }

    private static string TriState(bool? value) => value switch
    {
        true => "true",
        false => "false",
        null => Unknown,
    };
}
