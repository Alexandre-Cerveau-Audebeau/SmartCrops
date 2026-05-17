using SmartCrops.Core.Models;

namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Resolves a plant's scientific name to its canonical taxonomy via an external
/// taxonomy authority (currently GBIF). Implementations are responsible for the
/// transport, the dedup algorithm, and the result shape only — persistence and
/// orchestration live in the controller layer per ADR-0003.
/// </summary>
public interface IPlantTaxonomyService
{
    Task<PlantTaxonomyResult> ResolveAsync(string scientificName, CancellationToken ct);
}
