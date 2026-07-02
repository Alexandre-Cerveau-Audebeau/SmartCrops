using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Deterministic <see cref="IPlantSearchService"/> for integration tests
/// (SMA-255 T3) — no Typesense server exists in the integration environment.
/// Tests set <see cref="Next"/> to shape the engine result (ids to hydrate,
/// found, facet counts), or <see cref="NextException"/> to drive the
/// controller's engine-failure mapping (503). <see cref="Received"/> captures
/// the queries the controller forwarded.
/// </summary>
public class StubPlantSearchService : IPlantSearchService
{
    public List<PlantSearchQuery> Received { get; } = [];

    public PlantSearchResult Next { get; set; } = new([], 0, 1, 24, []);

    public Exception? NextException { get; set; }

    public Task<PlantSearchResult> SearchAsync(PlantSearchQuery query, CancellationToken ct = default)
    {
        Received.Add(query);
        if (NextException is not null)
            throw NextException;
        return Task.FromResult(Next);
    }

    public void Reset()
    {
        Received.Clear();
        Next = new([], 0, 1, 24, []);
        NextException = null;
    }
}
