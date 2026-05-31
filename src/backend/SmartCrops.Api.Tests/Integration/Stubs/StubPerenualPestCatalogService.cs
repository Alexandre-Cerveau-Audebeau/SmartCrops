using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Test-only <see cref="IPerenualPestCatalogService"/> that returns pre-loaded
/// <see cref="PerenualPestPage"/> values keyed by requested page number. Pages
/// not pre-loaded surface as <c>null</c> (the harvest endpoint maps a page-1
/// null to 502 and a later-page null to a counted failure), so tests can drive
/// both happy-path and upstream-failure branches deterministically.
///
/// <para>Registered as a Singleton in <c>PostgresFixture</c> so the in-memory
/// state survives the per-request scope; <c>Reset()</c> runs after each test's
/// Respawn (see <c>IntegrationTestBase</c>).</para>
/// </summary>
public sealed class StubPerenualPestCatalogService : IPerenualPestCatalogService
{
    private readonly object _lock = new();
    private readonly Dictionary<int, PerenualPestPage> _pages = [];
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
    public void SetPage(int page, PerenualPestPage response)
    {
        lock (_lock)
        {
            _pages[page] = response;
        }
    }

    public Task<PerenualPestPage?> GetPageAsync(int page, CancellationToken ct)
    {
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
