using System.Globalization;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Models;

namespace SmartCrops.Infrastructure.ExternalApis.SearchIndex;

/// <summary>
/// Builds the Typesense <c>filter_by</c> expression from a
/// <see cref="PlantSearchQuery"/>, encoding the SMA-9 "absence never excludes"
/// rule for every facet family:
/// <list type="bullet">
///   <item>enum facets → <c>careLevel:=[Easy,Medium,unknown]</c> — the
///     "unknown" sentinel is ALWAYS appended so null-valued plants stay in;</item>
///   <item>tri-state booleans → <c>isEdible:=[true,unknown]</c>;</item>
///   <item>numeric ranges → interval overlap against the plant's own min/max
///     pair, OR-ed with the pair's Known companions:
///     <c>((docMax:&gt;=uMin &amp;&amp; docMin:&lt;=uMax) || docMinKnown:=false || docMaxKnown:=false)</c>
///     — a plant with EITHER bound unknown must not be excluded, since the
///     overlap test cannot evaluate against a missing bound;</item>
///   <item>groups join with <c>&amp;&amp;</c>.</item>
/// </list>
/// Injection guard (defense in depth behind
/// <see cref="PlantSearchQueryValidator"/>): enum values are re-validated
/// against the C# enum member names and ranges re-checked — an unexpected
/// value throws <see cref="ArgumentException"/> instead of reaching the
/// engine. Numbers are formatted with the invariant culture.
/// </summary>
internal static class PlantSearchFilterBuilder
{
    private const string Unknown = PlantSearchDocumentMapper.Unknown;

    /// <summary>Returns the filter_by expression, or null when no facet is active.</summary>
    public static string? Build(PlantSearchQuery query)
    {
        var groups = new List<string>();

        if (query.PlantTypeIds is { Length: > 0 })
        {
            // plantTypeId is never null in Postgres — no unknown branch.
            groups.Add($"plantTypeId:=[{string.Join(",", query.PlantTypeIds)}]");
        }

        AddEnumFacet<PlantCareLevel>(groups, "careLevel", query.CareLevels);
        AddEnumFacet<PlantWateringNeed>(groups, "wateringNeedLevel", query.WateringNeedLevels);
        AddEnumFacet<PlantGrowthRate>(groups, "growthRate", query.GrowthRates);
        AddEnumFacet<PlantLifeCycle>(groups, "lifeCycle", query.LifeCycles);

        AddTriStateBoolean(groups, "isEdible", query.IsEdible);
        AddTriStateBoolean(groups, "isToxicToHumans", query.IsToxicToHumans);
        AddTriStateBoolean(groups, "isToxicToPets", query.IsToxicToPets);
        AddTriStateBoolean(groups, "isIndoor", query.IsIndoor);
        AddTriStateBoolean(groups, "isDroughtTolerant", query.IsDroughtTolerant);
        AddTriStateBoolean(groups, "isMedicinal", query.IsMedicinal);
        AddTriStateBoolean(groups, "isSaltTolerant", query.IsSaltTolerant);
        AddTriStateBoolean(groups, "isThorny", query.IsThorny);
        AddTriStateBoolean(groups, "isTropical", query.IsTropical);
        AddTriStateBoolean(groups, "isInvasive", query.IsInvasive);

        AddPairedRange(groups, "hardinessZoneMin", "hardinessZoneMax",
            Num(query.HardinessZoneMin), Num(query.HardinessZoneMax));
        AddPairedRange(groups, "minHeightCm", "maxHeightCm",
            Num(query.HeightCmMin), Num(query.HeightCmMax));
        AddPairedRange(groups, "xSunlightHoursMin", "xSunlightHoursMax",
            Num(query.XSunlightHoursMin), Num(query.XSunlightHoursMax));
        AddPairedRange(groups, "xWateringPhMin", "xWateringPhMax",
            Num(query.XWateringPhMin), Num(query.XWateringPhMax));
        AddPairedRange(groups, "xWateringBasedTempMinC", "xWateringBasedTempMaxC",
            Num(query.XWateringBasedTempCMin), Num(query.XWateringBasedTempCMax));
        AddSingleRange(groups, "xPlantSpacingValue",
            Num(query.XPlantSpacingValueMin), Num(query.XPlantSpacingValueMax));
        AddPairedRange(groups, "xTemperatureToleranceMinC", "xTemperatureToleranceMaxC",
            Num(query.XTemperatureToleranceCMin), Num(query.XTemperatureToleranceCMax));

        return groups.Count == 0 ? null : string.Join(" && ", groups);
    }

    private static void AddEnumFacet<TEnum>(List<string> groups, string field, string[]? values)
        where TEnum : struct, Enum
    {
        if (values is not { Length: > 0 })
            return;

        var vocabulary = Enum.GetNames<TEnum>();
        var invalid = values.Except(vocabulary).ToList();
        if (invalid.Count > 0)
        {
            throw new ArgumentException(
                $"Unknown {field} filter value(s): {string.Join(", ", invalid)}.");
        }

        var selected = values.Distinct().ToList();
        groups.Add($"{field}:=[{string.Join(",", selected)},{Unknown}]");
    }

    private static void AddTriStateBoolean(List<string> groups, string field, bool? value)
    {
        if (value is null)
            return;

        groups.Add($"{field}:=[{(value.Value ? "true" : "false")},{Unknown}]");
    }

    /// <summary>
    /// Interval overlap for facets stored as a min/max PAIR on the document
    /// (hardiness, height, sunlight, pH, temperatures): the plant's own range
    /// [docMin, docMax] overlaps the user's [uMin, uMax] iff
    /// docMax &gt;= uMin AND docMin &lt;= uMax. The unknown branch ORs both
    /// Known companions: with either bound missing the overlap test cannot
    /// evaluate (Typesense excludes documents lacking a filtered field), and
    /// absence must never exclude.
    /// </summary>
    private static void AddPairedRange(
        List<string> groups, string docMinField, string docMaxField, string? userMin, string? userMax)
    {
        if (userMin is null && userMax is null)
            return;

        GuardRangeOrder(docMinField, userMin, userMax);

        var overlap = (userMin, userMax) switch
        {
            (not null, not null) => $"{docMaxField}:>={userMin} && {docMinField}:<={userMax}",
            (not null, null) => $"{docMaxField}:>={userMin}",
            _ => $"{docMinField}:<={userMax}",
        };

        groups.Add($"(({overlap}) || {docMinField}Known:=false || {docMaxField}Known:=false)");
    }

    /// <summary>
    /// Range for facets stored as a SINGLE value on the document
    /// (xPlantSpacingValue): plain bounds check OR the field's Known companion.
    /// </summary>
    private static void AddSingleRange(
        List<string> groups, string field, string? userMin, string? userMax)
    {
        if (userMin is null && userMax is null)
            return;

        GuardRangeOrder(field, userMin, userMax);

        var bounds = (userMin, userMax) switch
        {
            (not null, not null) => $"{field}:>={userMin} && {field}:<={userMax}",
            (not null, null) => $"{field}:>={userMin}",
            _ => $"{field}:<={userMax}",
        };

        groups.Add($"(({bounds}) || {field}Known:=false)");
    }

    private static void GuardRangeOrder(string field, string? userMin, string? userMax)
    {
        if (userMin is not null && userMax is not null
            && decimal.Parse(userMin, CultureInfo.InvariantCulture)
               > decimal.Parse(userMax, CultureInfo.InvariantCulture))
        {
            throw new ArgumentException($"Range min must be <= max for {field}.");
        }
    }

    private static string? Num(int? value)
        => value?.ToString(CultureInfo.InvariantCulture);

    private static string? Num(decimal? value)
        => value?.ToString(CultureInfo.InvariantCulture);
}
