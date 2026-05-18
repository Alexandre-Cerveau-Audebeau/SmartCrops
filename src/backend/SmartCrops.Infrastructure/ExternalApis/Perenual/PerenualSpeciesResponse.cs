using System.Text.Json;
using System.Text.Json.Serialization;

namespace SmartCrops.Infrastructure.ExternalApis.Perenual;

/// <summary>
/// Partial binding for <c>GET /species/details/{id}</c>. Only the fields
/// SmartCrops writes somewhere are mapped — Perenual returns many more
/// (care_guides URLs, hardiness_location URLs, plant_anatomy, attracts, etc.)
/// which we deliberately ignore. The raw response is still retained verbatim
/// on <c>PlantPerenualData.RawResponseJson</c> for re-derivation.
///
/// <para><b>Note on premium xData fields</b>: Supreme-tier subscribers receive
/// additional <c>x*</c> properties (xWateringQuality, xTemperatureTolence, etc.)
/// inline on the same response. These are mapped here only to detect their
/// presence (<c>HasSupremeData</c>); their values are persisted in the raw
/// JSON without per-field denormalisation in this PR (deferred to a later
/// cross-source enrichment PR to avoid stomping on Trefle precedence already
/// established for temperature, pH, etc.).</para>
/// </summary>
public class PerenualSpeciesResponse
{
    [JsonPropertyName("id")] public int Id { get; set; }

    /// <summary>Perenual emits scientific_name as a string array.</summary>
    [JsonPropertyName("scientific_name")] public List<string>? ScientificName { get; set; }

    [JsonPropertyName("common_name")] public string? CommonName { get; set; }

    [JsonPropertyName("other_name")] public List<string>? OtherName { get; set; }

    [JsonPropertyName("family")] public string? Family { get; set; }

    [JsonPropertyName("type")] public string? Type { get; set; }

    /// <summary>Cultivar name when this entry represents a cultivated variety.</summary>
    [JsonPropertyName("cultivar")] public string? Cultivar { get; set; }

    [JsonPropertyName("origin")] public List<string>? Origin { get; set; }

    /// <summary>
    /// Perenual emits dimensions as an array of objects (one entry per
    /// measurement type, e.g. Height / Spread). Most species ship a single
    /// entry; the resolver picks the first usable one for height conversion.
    /// </summary>
    [JsonPropertyName("dimensions")] public List<PerenualDimensionsDto>? Dimensions { get; set; }

    [JsonPropertyName("watering_general_benchmark")] public PerenualWateringBenchmarkDto? WateringGeneralBenchmark { get; set; }

    [JsonPropertyName("cycle")] public string? Cycle { get; set; }

    [JsonPropertyName("watering")] public string? Watering { get; set; }

    /// <summary>Free-form list of sunlight preferences (e.g. ["full sun", "part shade"]).</summary>
    [JsonPropertyName("sunlight")] public List<string>? Sunlight { get; set; }

    [JsonPropertyName("hardiness")] public PerenualHardinessDto? Hardiness { get; set; }

    /// <summary>
    /// Months recommended for pruning. Per Phase 4 smoke discovery, Perenual
    /// actually ships these as month NAMES (e.g. <c>["March", "April"]</c>),
    /// not numeric months as initially hypothesised. Persisted verbatim into
    /// <c>PlantPerenualData.PruningMonths</c> (comma-joined string).
    /// </summary>
    [JsonPropertyName("pruning_month")] public List<string>? PruningMonth { get; set; }

    /// <summary>
    /// Pruning frequency. Per audit, observed as either an empty array <c>[]</c>
    /// OR an object <c>{amount, interval}</c>. Bound to <see cref="JsonElement"/>
    /// so deser cannot crash on the polymorphic shape; the value is otherwise
    /// unused by the ETL (kept in raw JSON for future processing).
    /// </summary>
    [JsonPropertyName("pruning_count")] public JsonElement PruningCount { get; set; }

    [JsonPropertyName("growth_rate")] public string? GrowthRate { get; set; }

    [JsonPropertyName("maintenance")] public string? Maintenance { get; set; }

    [JsonPropertyName("care_level")] public string? CareLevel { get; set; }

    [JsonPropertyName("indoor")] public bool? Indoor { get; set; }

    [JsonPropertyName("drought_tolerant")] public bool? DroughtTolerant { get; set; }

    [JsonPropertyName("salt_tolerant")] public bool? SaltTolerant { get; set; }

    [JsonPropertyName("thorny")] public bool? Thorny { get; set; }

    [JsonPropertyName("invasive")] public bool? Invasive { get; set; }

    [JsonPropertyName("tropical")] public bool? Tropical { get; set; }

    [JsonPropertyName("medicinal")] public bool? Medicinal { get; set; }

    [JsonPropertyName("poisonous_to_humans")] public bool? PoisonousToHumans { get; set; }

    [JsonPropertyName("poisonous_to_pets")] public bool? PoisonousToPets { get; set; }

    [JsonPropertyName("cuisine")] public bool? Cuisine { get; set; }

    [JsonPropertyName("edible_fruit")] public bool? EdibleFruit { get; set; }

    [JsonPropertyName("edible_leaf")] public bool? EdibleLeaf { get; set; }

    [JsonPropertyName("flowering_season")] public string? FloweringSeason { get; set; }

    [JsonPropertyName("harvest_season")] public string? HarvestSeason { get; set; }

    [JsonPropertyName("description")] public string? Description { get; set; }

    [JsonPropertyName("propagation")] public List<string>? Propagation { get; set; }

    [JsonPropertyName("pest_susceptibility")] public List<string>? PestSusceptibility { get; set; }

    [JsonPropertyName("default_image")] public PerenualImageDto? DefaultImage { get; set; }

    [JsonPropertyName("other_images")] public List<PerenualImageDto>? OtherImages { get; set; }

    // ── xData premium (Supreme tier) — presence-only mapping ───────────────
    // Values are retained in RawResponseJson; not denormalised onto Plant in
    // this PR to avoid stomping on Trefle-set scalars (temp, pH, etc.).

    [JsonPropertyName("xWateringQuality")] public JsonElement XWateringQuality { get; set; }

    [JsonPropertyName("xWateringPeriod")] public JsonElement XWateringPeriod { get; set; }

    [JsonPropertyName("xWateringAvgVolumeRequirement")] public JsonElement XWateringAvgVolumeRequirement { get; set; }

    [JsonPropertyName("xWateringDepthRequirement")] public JsonElement XWateringDepthRequirement { get; set; }

    [JsonPropertyName("xWateringBasedTemperature")] public JsonElement XWateringBasedTemperature { get; set; }

    [JsonPropertyName("xWateringPhLevel")] public JsonElement XWateringPhLevel { get; set; }

    [JsonPropertyName("xSunlightDuration")] public JsonElement XSunlightDuration { get; set; }

    /// <summary>
    /// Note: Perenual ships this field with a typo (<c>xTemperatureTolence</c>
    /// instead of <c>Tolerance</c>). Preserved verbatim to match the wire shape.
    /// </summary>
    [JsonPropertyName("xTemperatureTolence")] public JsonElement XTemperatureTolence { get; set; }

    [JsonPropertyName("xPlantSpacingRequirement")] public JsonElement XPlantSpacingRequirement { get; set; }
}

public class PerenualDimensionsDto
{
    [JsonPropertyName("type")] public string? Type { get; set; }

    /// <summary>
    /// Unit string. Observed values: "feet", "inches", and empty string <c>""</c>
    /// (NOT null). The resolver guards <c>IsNullOrEmpty</c> before conversion.
    /// </summary>
    [JsonPropertyName("unit")] public string? Unit { get; set; }

    [JsonPropertyName("min_value")] public decimal? MinValue { get; set; }

    [JsonPropertyName("max_value")] public decimal? MaxValue { get; set; }
}

public class PerenualWateringBenchmarkDto
{
    /// <summary>
    /// Free-form value as shipped — Perenual wraps the value in escaped
    /// quotes (e.g. <c>"\"7-10\""</c>) for ranges. Preserved verbatim; the
    /// resolver trims the wrapping quotes before persistence.
    /// </summary>
    [JsonPropertyName("value")] public string? Value { get; set; }

    [JsonPropertyName("unit")] public string? Unit { get; set; }
}

public class PerenualHardinessDto
{
    /// <summary>USDA hardiness lower bound. Perenual emits as string (e.g. "3a", "10").</summary>
    [JsonPropertyName("min")] public string? Min { get; set; }

    /// <summary>USDA hardiness upper bound. Perenual emits as string (e.g. "9b", "13").</summary>
    [JsonPropertyName("max")] public string? Max { get; set; }
}

public class PerenualImageDto
{
    [JsonPropertyName("license")] public int? LicenseId { get; set; }

    [JsonPropertyName("license_name")] public string? LicenseName { get; set; }

    [JsonPropertyName("license_url")] public string? LicenseUrl { get; set; }

    [JsonPropertyName("original_url")] public string? OriginalUrl { get; set; }

    [JsonPropertyName("regular_url")] public string? RegularUrl { get; set; }

    [JsonPropertyName("medium_url")] public string? MediumUrl { get; set; }

    [JsonPropertyName("small_url")] public string? SmallUrl { get; set; }

    [JsonPropertyName("thumbnail")] public string? Thumbnail { get; set; }
}
