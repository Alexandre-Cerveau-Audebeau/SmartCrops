using SmartCrops.Core.Enums;

namespace SmartCrops.Core.Models;

/// <summary>
/// Query contract for the public plant finder (SMA-255 T3). Bound from the
/// query string by ASP.NET's default conventions: scalars as
/// <c>?q=...&amp;page=2</c>, arrays as repeated keys
/// (<c>?careLevels=Easy&amp;careLevels=Medium</c>). Enum multi-selects carry
/// exact C# enum member names (PascalCase — the same strings the facet counts
/// return); the <c>unknown</c> sentinel is never sent by clients, it is
/// appended engine-side so absence never excludes (SMA-9).
/// </summary>
public record PlantSearchQuery
{
    /// <summary>Free text; null/empty means match-all.</summary>
    public string? Q { get; set; }

    /// <summary>"en" or "fr" — drives query_by fields and hydration language.</summary>
    public string Language { get; set; } = "en";

    public int Page { get; set; } = 1;

    public int PerPage { get; set; } = 24;

    public int[]? PlantTypeIds { get; set; }

    // Enum multi-selects (values = C# enum member names).
    public string[]? CareLevels { get; set; }
    public string[]? WateringNeedLevels { get; set; }
    public string[]? GrowthRates { get; set; }
    public string[]? LifeCycles { get; set; }

    // Tri-state booleans: null = facet inactive; true/false additionally
    // matches "unknown" (absence never excludes).
    public bool? IsEdible { get; set; }
    public bool? IsToxicToHumans { get; set; }
    public bool? IsToxicToPets { get; set; }
    public bool? IsIndoor { get; set; }
    public bool? IsDroughtTolerant { get; set; }
    public bool? IsMedicinal { get; set; }
    public bool? IsSaltTolerant { get; set; }
    public bool? IsThorny { get; set; }
    public bool? IsTropical { get; set; }
    public bool? IsInvasive { get; set; }

    // Numeric ranges (either bound optional). Range semantics are
    // interval-overlap against the plant's own min/max pair, plus the
    // unknown branch.
    public int? HardinessZoneMin { get; set; }
    public int? HardinessZoneMax { get; set; }
    public int? HeightCmMin { get; set; }
    public int? HeightCmMax { get; set; }
    public int? XSunlightHoursMin { get; set; }
    public int? XSunlightHoursMax { get; set; }
    public decimal? XWateringPhMin { get; set; }
    public decimal? XWateringPhMax { get; set; }
    public int? XWateringBasedTempCMin { get; set; }
    public int? XWateringBasedTempCMax { get; set; }
    public int? XPlantSpacingValueMin { get; set; }
    public int? XPlantSpacingValueMax { get; set; }
    public int? XTemperatureToleranceCMin { get; set; }
    public int? XTemperatureToleranceCMax { get; set; }
}

/// <summary>
/// Request-surface validation for <see cref="PlantSearchQuery"/> — bounds,
/// language, range sanity, and the enum-vocabulary guard (filter values are
/// validated against the C# enum member names so raw user strings can never
/// reach the engine's <c>filter_by</c>; unknown values are a 400, not a
/// pass-through). The Infrastructure filter builder re-checks the same rules
/// as defense in depth.
/// </summary>
public static class PlantSearchQueryValidator
{
    public static List<string> Validate(PlantSearchQuery query)
    {
        var errors = new List<string>();

        if (query.Language is not ("en" or "fr"))
            errors.Add("language must be 'en' or 'fr'.");
        if (query.Page < 1)
            errors.Add("page must be >= 1.");
        if (query.PerPage is < 1 or > 100)
            errors.Add("perPage must be between 1 and 100.");

        CheckVocabulary<PlantCareLevel>(errors, "careLevels", query.CareLevels);
        CheckVocabulary<PlantWateringNeed>(errors, "wateringNeedLevels", query.WateringNeedLevels);
        CheckVocabulary<PlantGrowthRate>(errors, "growthRates", query.GrowthRates);
        CheckVocabulary<PlantLifeCycle>(errors, "lifeCycles", query.LifeCycles);

        CheckRange(errors, "hardinessZone", query.HardinessZoneMin, query.HardinessZoneMax);
        CheckRange(errors, "heightCm", query.HeightCmMin, query.HeightCmMax);
        CheckRange(errors, "xSunlightHours", query.XSunlightHoursMin, query.XSunlightHoursMax);
        CheckRange(errors, "xWateringPh", query.XWateringPhMin, query.XWateringPhMax);
        CheckRange(errors, "xWateringBasedTempC", query.XWateringBasedTempCMin, query.XWateringBasedTempCMax);
        CheckRange(errors, "xPlantSpacingValue", query.XPlantSpacingValueMin, query.XPlantSpacingValueMax);
        CheckRange(errors, "xTemperatureToleranceC", query.XTemperatureToleranceCMin, query.XTemperatureToleranceCMax);

        return errors;
    }

    private static void CheckVocabulary<TEnum>(List<string> errors, string paramName, string[]? values)
        where TEnum : struct, Enum
    {
        if (values is not { Length: > 0 })
            return;

        var invalid = values.Except(Enum.GetNames<TEnum>()).ToList();
        if (invalid.Count > 0)
        {
            errors.Add(
                $"Unknown {paramName} value(s): {string.Join(", ", invalid)}. " +
                $"Valid values: {string.Join(", ", Enum.GetNames<TEnum>())}.");
        }
    }

    private static void CheckRange<T>(List<string> errors, string paramName, T? min, T? max)
        where T : struct, IComparable<T>
    {
        if (min.HasValue && max.HasValue && min.Value.CompareTo(max.Value) > 0)
            errors.Add($"{paramName}Min must be <= {paramName}Max.");
    }
}
