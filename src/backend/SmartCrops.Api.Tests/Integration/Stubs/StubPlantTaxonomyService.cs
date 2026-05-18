using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Test-only <see cref="IPlantTaxonomyService"/> that returns pre-loaded
/// <see cref="PlantTaxonomyResult"/> values in FIFO order. Tests enqueue
/// canned responses via <see cref="Responses"/> and inspect the calls made
/// via <see cref="ReceivedNames"/>. <see cref="Reset"/> wipes both lists so
/// the shared singleton can be reused per test (called from
/// <c>IntegrationTestBase.InitializeAsync</c> alongside Respawn).
///
/// Registered as a Singleton in <see cref="PostgresFixture"/> so the
/// in-memory queue survives the per-request <c>IPlantTaxonomyService</c>
/// scope resolution.
/// </summary>
public sealed class StubPlantTaxonomyService : IPlantTaxonomyService
{
    private readonly object _lock = new();
    private readonly Queue<PlantTaxonomyResult> _responses = new();
    private readonly List<string> _received = [];

    public IReadOnlyList<string> ReceivedNames
    {
        get
        {
            lock (_lock)
            {
                return _received.ToArray();
            }
        }
    }

    /// <summary>Enqueue one response to be returned by the next call.</summary>
    public void Enqueue(PlantTaxonomyResult result)
    {
        lock (_lock)
        {
            _responses.Enqueue(result);
        }
    }

    /// <summary>Convenience: enqueue an empty-NONE result for the next call.</summary>
    public void EnqueueNoMatch() =>
        Enqueue(new PlantTaxonomyResult(null, null, null, null, "NONE", null, null));

    public Task<PlantTaxonomyResult> ResolveAsync(string scientificName, CancellationToken ct)
    {
        lock (_lock)
        {
            _received.Add(scientificName);
            // If nothing was queued explicitly, default to a NONE so tests that
            // forgot to enqueue still get a deterministic outcome rather than a hang.
            var next = _responses.Count > 0
                ? _responses.Dequeue()
                : new PlantTaxonomyResult(null, null, null, null, "NONE", null, null);
            return Task.FromResult(next);
        }
    }

    public void Reset()
    {
        lock (_lock)
        {
            _responses.Clear();
            _received.Clear();
        }
    }
}
