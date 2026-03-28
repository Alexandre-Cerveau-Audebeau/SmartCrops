namespace SmartCrops.Core.Entities;

public class Plant
{
    public Guid Id { get; set; }

    /// <summary>
    /// Latin scientific name — language-neutral, never translated (e.g. "Solanum lycopersicum").
    /// </summary>
    public required string ScientificName { get; set; }

    public int PlantTypeId { get; set; }
    public PlantType PlantType { get; set; } = null!;

    /// <summary>
    /// Enum-like key resolved by the UI (e.g. "full_sun", "partial_shade", "full_shade").
    /// Storing a key instead of an enum keeps the DB schema stable when values are added.
    /// </summary>
    public string? SunExposure { get; set; }

    /// <summary>
    /// Enum-like key resolved by the UI (e.g. "low", "moderate", "regular", "high").
    /// </summary>
    public string? WaterNeeds { get; set; }

    /// <summary>
    /// Human-readable period key (e.g. "march-may"). Kept as a string so it can express
    /// ranges, hemisphere variants, or climate-zone qualifiers without schema changes.
    /// </summary>
    public string? SowingPeriod { get; set; }

    /// <summary>
    /// Human-readable period key (e.g. "july-october").
    /// </summary>
    public string? HarvestPeriod { get; set; }

    public string? ImageUrl { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<PlantTranslation> Translations { get; set; } = [];
    public ICollection<PlantSuggestion> Suggestions { get; set; } = [];
    public ICollection<GardenPlant> GardenPlants { get; set; } = new List<GardenPlant>();
}
