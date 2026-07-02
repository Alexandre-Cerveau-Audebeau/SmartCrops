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

    public SearchReindexResult Next { get; set; } = new(false, 0, 0, []);

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

    public void Reset()
    {
        Calls = 0;
        Next = new(false, 0, 0, []);
        NextException = null;
    }
}
