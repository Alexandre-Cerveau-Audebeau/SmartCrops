namespace SmartCrops.Core.Enums;

/// <summary>
/// Taxonomic rank at which a plant's identity is pinned. Most plants resolve to
/// an accepted <see cref="Species"/>; <see cref="Genus"/> marks an intentional
/// genus-level identity — e.g. a horticultural group or trade designation with
/// no resolvable accepted species — pending admin confirmation.
/// </summary>
public enum PlantTaxonRank
{
    Species = 1,
    Genus = 2,
}
