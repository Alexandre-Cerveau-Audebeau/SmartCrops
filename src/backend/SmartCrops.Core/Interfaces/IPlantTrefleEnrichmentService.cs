using SmartCrops.Core.Models;

namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Resolves a plant's scientific name to a Trefle species record and returns
/// the flattened payload the controller needs to dual-write across the curated
/// <c>Plant</c> read model and the Trefle-owned enrichment tables
/// (<c>PlantTrefleData</c>, <c>PlantImage</c>, <c>PlantCommonName</c>,
/// <c>PlantSynonym</c>) per ADR-0003. The service owns transport + match
/// selection + JSON-shape handling only; persistence + transaction control
/// live in the controller.
/// </summary>
public interface IPlantTrefleEnrichmentService
{
    Task<TrefleEnrichmentResult> ResolveAsync(string scientificName, CancellationToken ct);
}
