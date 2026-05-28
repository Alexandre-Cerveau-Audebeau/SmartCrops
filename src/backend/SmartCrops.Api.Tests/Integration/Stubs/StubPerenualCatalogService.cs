using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Test-only <see cref="IPerenualCatalogService"/> that returns pre-loaded
/// <see cref="PerenualCatalogPage"/> values keyed by requested page number.
/// Pages that have not been pre-loaded surface as <c>null</c> (which the
/// catalog endpoint maps to 502) so tests can drive both the happy-path and
/// upstream-failure branches deterministically.
///
/// <para>Registered as a Singleton in <c>PostgresFixture</c> so the in-memory
/// state survives the per-request scope resolution. <c>Reset()</c> is called
/// after each test's Respawn.</para>
/// </summary>
public sealed class StubPerenualCatalogService : IPerenualCatalogService
{
    private readonly object _lock = new();
    private readonly Dictionary<int, PerenualCatalogPage> _pages = [];
    private readonly List<int> _receivedPages = [];

    public IReadOnlyList<int> ReceivedPages
    {
        get
        {
            lock (_lock)
            {
                return _receivedPages.ToArray();
            }
        }
    }

    /// <summary>Pre-load a page response keyed by page number.</summary>
    public void SetPage(int page, PerenualCatalogPage response)
    {
        lock (_lock)
        {
            _pages[page] = response;
        }
    }

    public Task<PerenualCatalogPage?> GetPageAsync(int page, CancellationToken ct)
    {
        // Honor cancellation before any work — keeps stub fidelity with the
        // production service so endpoint tests can exercise the cancel path.
        // CR PR #92 R1 N2.
        ct.ThrowIfCancellationRequested();
        lock (_lock)
        {
            _receivedPages.Add(page);
            return Task.FromResult(_pages.TryGetValue(page, out var response) ? response : null);
        }
    }

    public void Reset()
    {
        lock (_lock)
        {
            _pages.Clear();
            _receivedPages.Clear();
        }
    }
}
