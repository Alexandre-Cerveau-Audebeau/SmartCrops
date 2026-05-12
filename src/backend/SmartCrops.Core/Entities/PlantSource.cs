using SmartCrops.Core.Enums;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

/// <summary>
/// Reference to an external source for traceability. One Plant can have many sources
/// across the various enrichment APIs (GBIF, Trefle, Perenual, etc.).
/// </summary>
public class PlantSource : IHasUpdatedAt
{
    public int Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    public PlantSourceType SourceType { get; set; }

    /// <summary>Identifier within the source system.</summary>
    public required string ExternalId { get; set; }

    /// <summary>Canonical URL on the source (when available).</summary>
    public string? Url { get; set; }

    /// <summary>Free-form notes about the source record.</summary>
    public string? Notes { get; set; }

    /// <summary>Last time we successfully fetched data from this source.</summary>
    public DateTime? LastFetchedAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
