using System.Text.Json.Serialization;

namespace SmartCrops.Infrastructure.ExternalApis.Typesense;

/// <summary>
/// The Typesense document shape for the <c>plants</c> collection (SMA-255 T2).
/// One document per Plant row; the document id is the Plant Guid, which makes
/// re-imports with upsert semantics idempotent.
///
/// Null-handling contract ("absence never excludes", SMA-9): a facet filter
/// must be able to INCLUDE plants whose value is unknown, so Postgres NULLs
/// are made representable in the index instead of being dropped:
/// <list type="bullet">
///   <item>enum facets → the literal sentinel <c>"unknown"</c>;</item>
///   <item>boolean facets → a 3-state string facet
///     (<c>"true"</c>/<c>"false"</c>/<c>"unknown"</c>), NOT a Typesense bool —
///     a bool cannot carry the third state;</item>
///   <item>numeric facets → stay numeric (omitted when null, so range filters
///     simply don't match) PLUS a companion <c>&lt;field&gt;Known</c> bool
///     facet, letting the front build
///     <c>(range filter) || (&lt;field&gt;Known:=false)</c>.</item>
/// </list>
///
/// Every property carries an explicit <see cref="JsonPropertyNameAttribute"/>
/// so the index field names never depend on the serializer's naming policy.
/// </summary>
public sealed record PlantSearchDocument
{
    // ── Identity ──────────────────────────────────────────────────────────

    /// <summary>The Plant Guid; Typesense's reserved document id.</summary>
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    // ── Search fields (localized text) ────────────────────────────────────

    [JsonPropertyName("scientificName")]
    public required string ScientificName { get; init; }

    [JsonPropertyName("commonNameEn")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CommonNameEn { get; init; }

    [JsonPropertyName("commonNameFr")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CommonNameFr { get; init; }

    [JsonPropertyName("descriptionEn")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DescriptionEn { get; init; }

    [JsonPropertyName("descriptionFr")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DescriptionFr { get; init; }

    // ── Facets: plant type ────────────────────────────────────────────────

    [JsonPropertyName("plantTypeId")]
    public required int PlantTypeId { get; init; }

    // ── Facets: booleans as 3-state strings ("true"/"false"/"unknown") ────

    [JsonPropertyName("isEdible")]
    public required string IsEdible { get; init; }

    [JsonPropertyName("isToxicToHumans")]
    public required string IsToxicToHumans { get; init; }

    [JsonPropertyName("isToxicToPets")]
    public required string IsToxicToPets { get; init; }

    [JsonPropertyName("isIndoor")]
    public required string IsIndoor { get; init; }

    [JsonPropertyName("isDroughtTolerant")]
    public required string IsDroughtTolerant { get; init; }

    [JsonPropertyName("isMedicinal")]
    public required string IsMedicinal { get; init; }

    [JsonPropertyName("isSaltTolerant")]
    public required string IsSaltTolerant { get; init; }

    [JsonPropertyName("isThorny")]
    public required string IsThorny { get; init; }

    [JsonPropertyName("isTropical")]
    public required string IsTropical { get; init; }

    [JsonPropertyName("isInvasive")]
    public required string IsInvasive { get; init; }

    // ── Facets: enums as strings (enum member name, or "unknown") ─────────

    [JsonPropertyName("careLevel")]
    public required string CareLevel { get; init; }

    [JsonPropertyName("wateringNeedLevel")]
    public required string WateringNeedLevel { get; init; }

    [JsonPropertyName("growthRate")]
    public required string GrowthRate { get; init; }

    [JsonPropertyName("lifeCycle")]
    public required string LifeCycle { get; init; }

    // ── Facets: numerics (omitted when null) + <field>Known companions ────

    [JsonPropertyName("hardinessZoneMin")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? HardinessZoneMin { get; init; }

    [JsonPropertyName("hardinessZoneMinKnown")]
    public required bool HardinessZoneMinKnown { get; init; }

    [JsonPropertyName("hardinessZoneMax")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? HardinessZoneMax { get; init; }

    [JsonPropertyName("hardinessZoneMaxKnown")]
    public required bool HardinessZoneMaxKnown { get; init; }

    [JsonPropertyName("minHeightCm")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? MinHeightCm { get; init; }

    [JsonPropertyName("minHeightCmKnown")]
    public required bool MinHeightCmKnown { get; init; }

    [JsonPropertyName("maxHeightCm")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? MaxHeightCm { get; init; }

    [JsonPropertyName("maxHeightCmKnown")]
    public required bool MaxHeightCmKnown { get; init; }

    [JsonPropertyName("xSunlightHoursMin")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? XSunlightHoursMin { get; init; }

    [JsonPropertyName("xSunlightHoursMinKnown")]
    public required bool XSunlightHoursMinKnown { get; init; }

    [JsonPropertyName("xSunlightHoursMax")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? XSunlightHoursMax { get; init; }

    [JsonPropertyName("xSunlightHoursMaxKnown")]
    public required bool XSunlightHoursMaxKnown { get; init; }

    [JsonPropertyName("xWateringPhMin")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public float? XWateringPhMin { get; init; }

    [JsonPropertyName("xWateringPhMinKnown")]
    public required bool XWateringPhMinKnown { get; init; }

    [JsonPropertyName("xWateringPhMax")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public float? XWateringPhMax { get; init; }

    [JsonPropertyName("xWateringPhMaxKnown")]
    public required bool XWateringPhMaxKnown { get; init; }

    [JsonPropertyName("xWateringBasedTempMinC")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? XWateringBasedTempMinC { get; init; }

    [JsonPropertyName("xWateringBasedTempMinCKnown")]
    public required bool XWateringBasedTempMinCKnown { get; init; }

    [JsonPropertyName("xWateringBasedTempMaxC")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? XWateringBasedTempMaxC { get; init; }

    [JsonPropertyName("xWateringBasedTempMaxCKnown")]
    public required bool XWateringBasedTempMaxCKnown { get; init; }

    [JsonPropertyName("xPlantSpacingValue")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? XPlantSpacingValue { get; init; }

    [JsonPropertyName("xPlantSpacingValueKnown")]
    public required bool XPlantSpacingValueKnown { get; init; }

    [JsonPropertyName("xTemperatureToleranceMinC")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? XTemperatureToleranceMinC { get; init; }

    [JsonPropertyName("xTemperatureToleranceMinCKnown")]
    public required bool XTemperatureToleranceMinCKnown { get; init; }

    [JsonPropertyName("xTemperatureToleranceMaxC")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? XTemperatureToleranceMaxC { get; init; }

    [JsonPropertyName("xTemperatureToleranceMaxCKnown")]
    public required bool XTemperatureToleranceMaxCKnown { get; init; }
}
