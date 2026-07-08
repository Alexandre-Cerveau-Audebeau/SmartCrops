using System.Collections.Immutable;

namespace SmartCrops.Infrastructure.ExternalApis.SearchIndex;

/// <summary>
/// Single registry of the COUNTED facet field names of the plants collection
/// (SMA-274 CR): the filter builder's emit sites, the search service's
/// disjunctive roster and its derived facet_by, and the collection schema all
/// consume these constants, so a facet rename can't silently desync one
/// surface from the others. The wire-contract tests deliberately keep their
/// LITERAL string expectations — they pin the exact strings the registry must
/// keep producing.
/// </summary>
internal static class PlantFacetFields
{
    public const string PlantTypeId = "plantTypeId";
    public const string CareLevel = "careLevel";
    public const string WateringNeedLevel = "wateringNeedLevel";
    public const string GrowthRate = "growthRate";
    public const string LifeCycle = "lifeCycle";
    public const string IsEdible = "isEdible";
    public const string IsToxicToHumans = "isToxicToHumans";
    public const string IsToxicToPets = "isToxicToPets";
    public const string IsIndoor = "isIndoor";
    public const string IsDroughtTolerant = "isDroughtTolerant";
    public const string IsMedicinal = "isMedicinal";
    public const string IsSaltTolerant = "isSaltTolerant";
    public const string IsThorny = "isThorny";
    public const string IsTropical = "isTropical";
    public const string IsInvasive = "isInvasive";

    /// <summary>
    /// The counted facets in the canonical order — the search service derives
    /// its facet_by AND its disjunctive roster membership from this list.
    /// ImmutableArray: the single source of truth must not be mutable at a
    /// distance (a writable element would be exactly the silent desync this
    /// registry exists to prevent).
    /// </summary>
    public static readonly ImmutableArray<string> CountedFields =
    [
        PlantTypeId,
        CareLevel,
        WateringNeedLevel,
        GrowthRate,
        LifeCycle,
        IsEdible,
        IsToxicToHumans,
        IsToxicToPets,
        IsIndoor,
        IsDroughtTolerant,
        IsMedicinal,
        IsSaltTolerant,
        IsThorny,
        IsTropical,
        IsInvasive,
    ];
}
