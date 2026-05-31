using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

/// <summary>
/// Perenual API specific data for a plant (1-1 relationship). Stores both extracted
/// fields and the raw API response so we can re-derive canonical fields without
/// re-calling Perenual.
/// </summary>
public class PlantPerenualData : IHasUpdatedAt
{
    public Guid Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    /// <summary>Perenual numeric ID — the upstream primary key (canonical, as
    /// returned by <c>response.id</c>).</summary>
    public int PerenualId { get; set; }

    /// <summary>
    /// Id originally passed to <c>/species/details/{id}</c> on the call that
    /// produced this row. Differs from <see cref="PerenualId"/> when Perenual
    /// canonicalises server-side (cf. issue #67). Set on every enrichment;
    /// preserved by the controller's idempotent denormalisation so the audit
    /// trail records the *first* id we knew about for this plant. Rows
    /// enriched before this column existed stay <c>null</c>.
    /// </summary>
    public int? RequestedPerenualId { get; set; }

    /// <summary>Cultivar name (e.g. "Sungold").</summary>
    public string? Cultivar { get; set; }

    /// <summary>Perenual type label (e.g. "Herb", "Tree", "Deciduous shrub").</summary>
    public string? PerenualType { get; set; }

    /// <summary>Comma-separated origin countries.</summary>
    public string? OriginCountries { get; set; }

    /// <summary>Comma-separated propagation methods.</summary>
    public string? PropagationMethods { get; set; }

    /// <summary>Watering benchmark numeric value (free-form to accommodate ranges).</summary>
    public string? WateringBenchmark { get; set; }

    /// <summary>Unit of measure for the watering benchmark.</summary>
    public string? WateringBenchmarkUnit { get; set; }

    /// <summary>Sunlight preferences (comma-separated keys).</summary>
    public string? SunlightPreferences { get; set; }

    /// <summary>Comma-separated months recommended for pruning.</summary>
    public string? PruningMonths { get; set; }

    /// <summary>Maintenance level reported by Perenual.</summary>
    public string? Maintenance { get; set; }

    /// <summary>Flowering season label.</summary>
    public string? FloweringSeason { get; set; }

    /// <summary>Harvest season label.</summary>
    public string? HarvestSeason { get; set; }

    public bool? HasEdibleFruit { get; set; }
    public bool? HasEdibleLeaves { get; set; }
    public bool? IsCulinary { get; set; }

    /// <summary>
    /// Plant anatomy structured data, stored as a JSON array of
    /// <c>{part, color[]}</c> objects (SMA-71 queryable column). Populated by
    /// the resolver from the upstream <c>plant_anatomy</c> array; <c>null</c>
    /// when Perenual ships an empty array. (The column predates SMA-71 but the
    /// resolver wrote <c>null</c> until this PR started populating it.)
    /// </summary>
    public string? PlantAnatomyJson { get; set; }

    /// <summary>
    /// What this plant attracts (e.g. <c>["Butterflies"]</c>), stored as a JSON
    /// string array (SMA-71 queryable column). <c>null</c> when Perenual ships
    /// an empty array.
    /// </summary>
    public string? AttractsJson { get; set; }

    /// <summary>
    /// Preferred soil types (e.g. <c>["Loamy Humus"]</c>), stored as a JSON
    /// string array (SMA-71 queryable column). <c>null</c> when Perenual ships
    /// an empty array.
    /// </summary>
    public string? SoilJson { get; set; }

    /// <summary>
    /// Alternative/vernacular names Perenual ships under <c>other_name</c>,
    /// stored as a JSON string array (SMA-71 queryable column). Kept LOCAL to
    /// PlantPerenualData rather than merged into <c>PlantCommonName</c> (which is
    /// Trefle-owned via delete-then-insert with no Source column, and would also
    /// need a language guess) — a multi-source merge is a separate ticket.
    /// <c>null</c> when Perenual ships an empty array.
    /// </summary>
    public string? OtherNamesJson { get; set; }

    /// <summary>Full Perenual API response, retained for re-derivation and audit.</summary>
    public string? RawResponseJson { get; set; }

    /// <summary>
    /// Verbatim <c>/species/details</c> HTTP response body, API key redacted.
    /// Unlike <see cref="RawResponseJson"/> — a re-serialisation of the mapped
    /// <c>PerenualSpeciesResponse</c> DTO that silently drops every field we do
    /// not bind — this is the LITERAL upstream body, the loss-proof capture
    /// (SMA-71) taken ahead of the Perenual subscription cancel. Internal/audit
    /// only; deliberately never surfaced in the public API DTO.
    /// </summary>
    public string? LiteralResponseJson { get; set; }

    /// <summary>
    /// Verbatim <c>/species-care-guide-list</c> response body for this species,
    /// API key redacted. The detailed pruning/sunlight/watering care sections it
    /// carries are Perenual-exclusive and were never fetched before SMA-71.
    /// Internal/audit only; deliberately never surfaced in the public API DTO.
    /// </summary>
    public string? CareGuideResponseJson { get; set; }

    /// <summary>Perenual API version this record was sourced from.</summary>
    public string? ApiVersion { get; set; }

    /// <summary>True when xData (premium endpoint) was successfully fetched.</summary>
    public bool HasSupremeData { get; set; }

    // ── Perenual Supreme xData (premium tier) ───────────────────────────────
    // Denormalised onto PlantPerenualData (NOT Plant) so they don't collide
    // with the Trefle-owned Plant scalars (MinTempC/MaxTempC, SoilPhMin/Max).
    // All nullable; populated by the Phase 2b resolver. See Sprint 1.5 PR B.

    /// <summary>
    /// Perenual Supreme xData — ideal temperature range during watering, in degrees Celsius.
    /// From xWateringBasedTemperature.min field. Null if Perenual returns absent or polymorphic array.
    /// </summary>
    public int? XWateringBasedTempMinC { get; set; }

    /// <summary>
    /// Perenual Supreme xData — upper bound of ideal temperature range during watering, in degrees Celsius.
    /// From xWateringBasedTemperature.max field.
    /// </summary>
    public int? XWateringBasedTempMaxC { get; set; }

    /// <summary>
    /// Perenual Supreme xData — preferred water pH minimum (0-14). Decimal precision (4,2)
    /// to handle floating point edge cases like 6.79999... observed in payload.
    /// </summary>
    public decimal? XWateringPhMin { get; set; }

    /// <summary>
    /// Perenual Supreme xData — preferred water pH maximum (0-14).
    /// </summary>
    public decimal? XWateringPhMax { get; set; }

    /// <summary>
    /// Perenual Supreme xData — recommended daily sunlight hours minimum.
    /// From xSunlightDuration.min (parsed from string).
    /// </summary>
    public int? XSunlightHoursMin { get; set; }

    /// <summary>
    /// Perenual Supreme xData — recommended daily sunlight hours maximum.
    /// Null when Perenual ships max="" empty string (half-open range, observed on 4/6 audit plants).
    /// </summary>
    public int? XSunlightHoursMax { get; set; }

    /// <summary>
    /// Perenual Supreme xData — survival temperature tolerance minimum, in degrees Celsius.
    /// From xTemperatureTolence.min_value (note: Perenual typo "Tolence" preserved as JsonPropertyName upstream).
    /// Null when Perenual ships [] empty array (polymorphism array vs object, observed on tomato).
    /// </summary>
    public int? XTemperatureToleranceMinC { get; set; }

    /// <summary>
    /// Perenual Supreme xData — survival temperature tolerance maximum, in degrees Celsius.
    /// </summary>
    public int? XTemperatureToleranceMaxC { get; set; }

    /// <summary>
    /// Perenual Supreme xData — recommended planting spacing value.
    /// From xPlantSpacingRequirement.value. Null when Perenual ships [] empty array.
    /// </summary>
    public int? XPlantSpacingValue { get; set; }

    /// <summary>
    /// Perenual Supreme xData — unit of plant spacing requirement (e.g. "inches", "cm").
    /// Companion to XPlantSpacingValue.
    /// </summary>
    public string? XPlantSpacingUnit { get; set; }

    /// <summary>
    /// Perenual Supreme xData — preferred water quality types as JSON array.
    /// E.g. ["Rainwater","Distilled Water","Reverse Osmosis Water","Spring Water"].
    /// Stored as jsonb. Empty array [] persisted as null (no value to display).
    /// </summary>
    public string? XWateringQualityJson { get; set; }

    /// <summary>
    /// Perenual Supreme xData — preferred time-of-day for watering as JSON array.
    /// E.g. ["Morning","Evening"]. Often empty in Perenual payloads (5/6 audit plants).
    /// Stored as jsonb. Empty array [] persisted as null.
    /// </summary>
    public string? XWateringPeriodJson { get; set; }

    /// <summary>Timestamp of the last successful sync from Perenual.</summary>
    public DateTime LastSyncAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
