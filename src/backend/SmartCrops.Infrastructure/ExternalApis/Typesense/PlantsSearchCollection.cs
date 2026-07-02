using global::Typesense;

namespace SmartCrops.Infrastructure.ExternalApis.Typesense;

/// <summary>
/// Schema of the <c>plants</c> Typesense collection (SMA-255 T2), kept in code
/// so the reindex endpoint can bootstrap it when absent.
///
/// Versioning: <see cref="SchemaVersion"/> documents the current shape. A
/// schema change (new/renamed field, type change) must bump the version and
/// requires a manual drop + reindex — Typesense cannot alter most field
/// definitions in place. Blue/green aliasing is deliberately out of scope for
/// this tranche.
///
/// Field roster mirrors <see cref="PlantSearchDocument"/> — search fields are
/// plain strings, facets carry <c>facet: true</c>, and every field that can be
/// absent from a document (null in Postgres) is <c>optional: true</c>. Synonym
/// fields (SMA-7) are intentionally NOT declared yet.
/// </summary>
public static class PlantsSearchCollection
{
    public const string Name = "plants";

    public const int SchemaVersion = 1;

    public static Schema Build() => new(Name, new List<Field>
    {
        // ── Search fields ──────────────────────────────────────────────────
        new("scientificName", FieldType.String, false),
        new("commonNameEn", FieldType.String, false, true),
        new("commonNameFr", FieldType.String, false, true),
        new("descriptionEn", FieldType.String, false, true),
        new("descriptionFr", FieldType.String, false, true),

        // ── Facets: plant type ─────────────────────────────────────────────
        new("plantTypeId", FieldType.Int32, true),

        // ── Facets: booleans as 3-state strings ────────────────────────────
        new("isEdible", FieldType.String, true),
        new("isToxicToHumans", FieldType.String, true),
        new("isToxicToPets", FieldType.String, true),
        new("isIndoor", FieldType.String, true),
        new("isDroughtTolerant", FieldType.String, true),
        new("isMedicinal", FieldType.String, true),
        new("isSaltTolerant", FieldType.String, true),
        new("isThorny", FieldType.String, true),
        new("isTropical", FieldType.String, true),
        new("isInvasive", FieldType.String, true),

        // ── Facets: enums as strings ───────────────────────────────────────
        new("careLevel", FieldType.String, true),
        new("wateringNeedLevel", FieldType.String, true),
        new("growthRate", FieldType.String, true),
        new("lifeCycle", FieldType.String, true),

        // ── Facets: numerics (optional) + <field>Known companions ──────────
        new("hardinessZoneMin", FieldType.Int32, true, true),
        new("hardinessZoneMinKnown", FieldType.Bool, true),
        new("hardinessZoneMax", FieldType.Int32, true, true),
        new("hardinessZoneMaxKnown", FieldType.Bool, true),
        new("minHeightCm", FieldType.Int32, true, true),
        new("minHeightCmKnown", FieldType.Bool, true),
        new("maxHeightCm", FieldType.Int32, true, true),
        new("maxHeightCmKnown", FieldType.Bool, true),
        new("xSunlightHoursMin", FieldType.Int32, true, true),
        new("xSunlightHoursMinKnown", FieldType.Bool, true),
        new("xSunlightHoursMax", FieldType.Int32, true, true),
        new("xSunlightHoursMaxKnown", FieldType.Bool, true),
        new("xWateringPhMin", FieldType.Float, true, true),
        new("xWateringPhMinKnown", FieldType.Bool, true),
        new("xWateringPhMax", FieldType.Float, true, true),
        new("xWateringPhMaxKnown", FieldType.Bool, true),
        new("xWateringBasedTempMinC", FieldType.Int32, true, true),
        new("xWateringBasedTempMinCKnown", FieldType.Bool, true),
        new("xWateringBasedTempMaxC", FieldType.Int32, true, true),
        new("xWateringBasedTempMaxCKnown", FieldType.Bool, true),
        new("xPlantSpacingValue", FieldType.Int32, true, true),
        new("xPlantSpacingValueKnown", FieldType.Bool, true),
        new("xTemperatureToleranceMinC", FieldType.Int32, true, true),
        new("xTemperatureToleranceMinCKnown", FieldType.Bool, true),
        new("xTemperatureToleranceMaxC", FieldType.Int32, true, true),
        new("xTemperatureToleranceMaxCKnown", FieldType.Bool, true),
    });
}
