namespace SmartCrops.Core.Entities;

/// <summary>
/// Perenual API specific data for a plant (1-1 relationship). Stores both extracted
/// fields and the raw API response so we can re-derive canonical fields without
/// re-calling Perenual.
/// </summary>
public class PlantPerenualData
{
    public Guid Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    /// <summary>Perenual numeric ID — the upstream primary key.</summary>
    public int PerenualId { get; set; }

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

    /// <summary>Plant anatomy structured data, stored as JSON.</summary>
    public string? PlantAnatomyJson { get; set; }

    /// <summary>Full Perenual API response, retained for re-derivation and audit.</summary>
    public string? RawResponseJson { get; set; }

    /// <summary>Perenual API version this record was sourced from.</summary>
    public string? ApiVersion { get; set; }

    /// <summary>True when xData (premium endpoint) was successfully fetched.</summary>
    public bool HasSupremeData { get; set; }

    /// <summary>Timestamp of the last successful sync from Perenual.</summary>
    public DateTime LastSyncAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
