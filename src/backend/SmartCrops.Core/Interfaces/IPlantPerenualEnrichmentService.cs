using SmartCrops.Core.Models;

namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Resolves a plant to a Perenual species record and returns the flattened
/// payload the controller needs to dual-write across the curated <c>Plant</c>
/// read model and the Perenual-owned enrichment tables (<c>PlantPerenualData</c>,
/// <c>PlantImage</c>, <c>PlantPest</c>, <c>PlantLongDescription</c>,
/// <c>PlantSource</c>) per ADR-0003. The service owns transport + match
/// selection + JSON-shape handling only; persistence + transaction control
/// live in the controller.
///
/// <para>Two resolution paths: <see cref="ResolveAsync"/> searches Perenual's
/// <c>/species-list</c> by scientific name (resolver picks the best match
/// stripping cultivar markers) and then fetches the full <c>/species/details/{id}</c>
/// record. <see cref="ResolveByIdAsync"/> skips the search when the admin
/// passes the Perenual id directly (e.g. after manual mapping).</para>
/// </summary>
public interface IPlantPerenualEnrichmentService
{
    Task<PerenualEnrichmentResult> ResolveAsync(string scientificName, CancellationToken ct);

    Task<PerenualEnrichmentResult> ResolveByIdAsync(int perenualId, CancellationToken ct);
}
