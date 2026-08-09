using SmartCrops.Core.Interfaces;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Deterministic <see cref="ISearchIndexingService"/> for integration tests
/// (SMA-255). The integration environment has no Typesense server — with the
/// production service the reindex endpoint would die on a TCP connect and the
/// TestServer would rethrow that into the test. Tests set <see cref="Next"/>
/// to shape the response and read <see cref="Calls"/> to assert invocation.
/// </summary>
public class StubSearchIndexingService : ISearchIndexingService
{
    public int Calls { get; private set; }

    /// <summary>Invocations of the boot-only <see cref="ReindexIfEmptyAsync"/> (SMA-389).
    /// The Testing environment skips the boot indexing step, so this stays 0 in the
    /// shared fixture — the member exists for interface compliance and for any
    /// dedicated factory that drives the conditional path against the stub.</summary>
    public int EnsureCalls { get; private set; }

    public SearchReindexResult Next { get; set; } = new(false, 0, 0, []);

    public SearchIndexEnsureResult NextEnsure { get; set; } = new(false, 0, null);

    /// <summary>
    /// When set, <see cref="ReindexAllAsync"/> throws this instead of
    /// returning <see cref="Next"/> — lets tests drive the controller's
    /// engine-failure mapping (Typesense down → 503).
    /// </summary>
    public Exception? NextException { get; set; }

    public Task<SearchReindexResult> ReindexAllAsync(CancellationToken ct = default)
    {
        Calls++;
        if (NextException is not null)
            throw NextException;
        return Task.FromResult(Next);
    }

    public Task<SearchIndexEnsureResult> ReindexIfEmptyAsync(CancellationToken ct = default)
    {
        EnsureCalls++;
        if (NextException is not null)
            throw NextException;
        return Task.FromResult(NextEnsure);
    }

    public void Reset()
    {
        Calls = 0;
        EnsureCalls = 0;
        Next = new(false, 0, 0, []);
        NextEnsure = new(false, 0, null);
        NextException = null;
    }
}
