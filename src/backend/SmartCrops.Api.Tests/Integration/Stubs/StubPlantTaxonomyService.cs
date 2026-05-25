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
    // Queue of factories instead of bare results so a queued item can also be
    // an exception (EnqueueFailure). The controller's per-plant try/catch
    // promotes that throw to a Failed counter, which is what the
    // FailedPlant regression tests exercise.
    private readonly Queue<Func<PlantTaxonomyResult>> _responses = new();
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
            _responses.Enqueue(() => result);
        }
    }

    /// <summary>Convenience: enqueue an empty-NONE result for the next call.</summary>
    public void EnqueueNoMatch() =>
        Enqueue(new PlantTaxonomyResult(null, null, null, null, "NONE", null, null));

    /// <summary>
    /// Enqueue a failure that throws <paramref name="exception"/> on the
    /// next call. Used by the FailedPlant regression tests to drive the
    /// controller's catch branch (Failed++ without setting the XxxEnriched flag).
    /// </summary>
    public void EnqueueFailure(Exception exception)
    {
        ArgumentNullException.ThrowIfNull(exception);
        lock (_lock)
        {
            _responses.Enqueue(() => throw exception);
        }
    }

    public Task<PlantTaxonomyResult> ResolveAsync(string scientificName, CancellationToken ct)
    {
        Func<PlantTaxonomyResult> factory;
        lock (_lock)
        {
            _received.Add(scientificName);
            // If nothing was queued explicitly, default to a NONE so tests that
            // forgot to enqueue still get a deterministic outcome rather than a hang.
            factory = _responses.Count > 0
                ? _responses.Dequeue()
                : () => new PlantTaxonomyResult(null, null, null, null, "NONE", null, null);
        }
        // Invoke outside the lock; surface a throwing factory as a faulted task
        // so the controller's await sees the exception via its catch branch.
        try
        {
            return Task.FromResult(factory());
        }
        catch (Exception ex)
        {
            return Task.FromException<PlantTaxonomyResult>(ex);
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
