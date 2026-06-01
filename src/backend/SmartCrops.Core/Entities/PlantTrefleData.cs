using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

/// <summary>
/// Trefle.io specific data for a plant (1-1 relationship). Stores both extracted fields
/// and the raw API response so we can re-derive canonical fields without re-calling Trefle.
/// </summary>
public class PlantTrefleData : IHasUpdatedAt
{
    public Guid Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    /// <summary>Trefle slug (URL identifier).</summary>
    public string? TrefleSlug { get; set; }

    /// <summary>World Flora Online identifier.</summary>
    public string? WfoId { get; set; }

    /// <summary>Growth habit (e.g. "Forb/herb", "Tree").</summary>
    public string? GrowthHabit { get; set; }

    /// <summary>Comma-separated flower colors.</summary>
    public string? FlowerColors { get; set; }

    /// <summary>Comma-separated foliage colors.</summary>
    public string? FoliageColors { get; set; }

    /// <summary>Native regions, stored as JSON array.</summary>
    public string? NativeRegionsJson { get; set; }

    /// <summary>Introduced regions, stored as JSON array.</summary>
    public string? IntroducedRegionsJson { get; set; }

    /// <summary>Soil nutriment requirement on a 1-10 scale.</summary>
    public int? SoilNutrimentsLevel { get; set; }

    /// <summary>Soil salinity tolerance on a 1-10 scale.</summary>
    public int? SoilSalinityLevel { get; set; }

    /// <summary>Atmospheric humidity preference on a 1-10 scale.</summary>
    public int? AtmosphericHumidityLevel { get; set; }

    /// <summary>SMA-71: average height in centimetres (Trefle <c>specifications.average_height.cm</c>).</summary>
    public int? AverageHeightCm { get; set; }

    /// <summary>SMA-71: growth-rate label (Trefle <c>specifications.growth_rate</c>, e.g. "Moderate").</summary>
    public string? GrowthRate { get; set; }

    /// <summary>Full Trefle API response, retained for re-derivation and audit.</summary>
    public string? RawResponseJson { get; set; }

    /// <summary>Trefle API version this record was sourced from.</summary>
    public string? ApiVersion { get; set; }

    /// <summary>Timestamp of the last successful sync from Trefle.</summary>
    public DateTime LastSyncAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
