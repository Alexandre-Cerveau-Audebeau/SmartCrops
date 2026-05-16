using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

/// <summary>
/// A scientific synonym for the plant. Used during ETL to fuzzy-match upstream
/// records against an existing canonical Plant.
/// </summary>
public class PlantSynonym : IHasUpdatedAt
{
    public int Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    /// <summary>The synonym (older / alternative scientific name).</summary>
    public required string Synonym { get; set; }

    /// <summary>Taxonomic authority that published the synonym, if known.</summary>
    public string? Authority { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
