using SmartCrops.Core.Models;

namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Public read path of the search engine (SMA-255 T3): text search +
/// structured facet filters + facet counts + pagination over the plants
/// collection. Engine-agnostic contract; the Typesense implementation lives in
/// Infrastructure. Returns ids only — the API layer hydrates full list items
/// from Postgres so the PlantCard contract keeps a single source of truth.
/// </summary>
public interface IPlantSearchService
{
    Task<PlantSearchResult> SearchAsync(PlantSearchQuery query, CancellationToken ct = default);
}
