using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for the SMA-71 PR2 pest-disease catalogue harvest. The
/// <see cref="SmartCrops.Core.Interfaces.IPerenualPestCatalogService"/> is stubbed
/// at the DI layer (PostgresFixture) so these tests verify the harvest
/// pagination + idempotent upsert + the AssertRedacted persistence guard without
/// touching Perenual over HTTP.
/// </summary>
public class PerenualPestCatalogControllerTests : IntegrationTestBase
{
    public PerenualPestCatalogControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string HarvestUrl = "/api/admin/perenual/pest-catalog/harvest";

    private static PerenualPestPage Page(int lastPage, params (int Id, string Common, string Sci, string Literal)[] items)
        => new(lastPage, items.Select(i => new PerenualPestCatalogEntry(i.Id, i.Common, i.Sci, i.Literal)).ToList());

    [Fact]
    public async Task Harvest_NoAuth_Returns401()
    {
        var response = await Client.PostAsync(HarvestUrl, null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Harvest_AuthenticatedNonAdmin_Returns403()
    {
        AuthAsNonAdmin();
        var response = await Client.PostAsync(HarvestUrl, null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Harvest_PaginatesAllPages_UpsertsEachEntry_AndDoesNotExposeLiterals()
    {
        Fixture.PerenualPestCatalogStub.SetPage(1, Page(2,
            (1, "Fairy ring", "Agrocybe", "{\"id\":1,\"host\":[\"all lawn grasses\"]}"),
            (2, "Aphids", "Aphidoidea", "{\"id\":2}")));
        Fixture.PerenualPestCatalogStub.SetPage(2, Page(2,
            (3, "Powdery mildew", "Erysiphales", "{\"id\":3}")));
        AuthAsAdmin();

        var response = await Client.PostAsync(HarvestUrl, null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<HarvestResp>();
        Assert.Equal(2, body!.PagesFetched);
        Assert.Equal(3, body.ItemsUpserted);
        Assert.Equal(0, body.Failures);
        Assert.Equal(new[] { 1, 2 }, Fixture.PerenualPestCatalogStub.ReceivedPages);

        // The response carries counts ONLY — never the captured literals.
        var raw = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("all lawn grasses", raw);
        Assert.DoesNotContain("literalResponseJson", raw, StringComparison.OrdinalIgnoreCase);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(3, await db.PerenualPestCatalog.CountAsync());
        var entry = await db.PerenualPestCatalog.SingleAsync(c => c.PerenualPestId == 1);
        Assert.Equal("Fairy ring", entry.CommonName);
        Assert.Equal("Agrocybe", entry.ScientificName);
        Assert.Contains("all lawn grasses", entry.LiteralResponseJson!);
    }

    [Fact]
    public async Task Harvest_SecondRun_IsIdempotent_UpdatesNotDuplicates()
    {
        Fixture.PerenualPestCatalogStub.SetPage(1, Page(1,
            (1, "Fairy ring", "Agrocybe", "{\"id\":1}")));
        AuthAsAdmin();

        var first = await Client.PostAsync(HarvestUrl, null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Same stub state — the second harvest must update in place, not duplicate.
        var second = await Client.PostAsync(HarvestUrl, null);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(1, await db.PerenualPestCatalog.CountAsync());
    }

    [Fact]
    public async Task Harvest_Page1FetchFails_Returns502()
    {
        // No page pre-loaded → the stub returns null for page 1.
        AuthAsAdmin();
        var response = await Client.PostAsync(HarvestUrl, null);
        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    [Fact]
    public async Task Harvest_FailFasts_AndPersistsNothing_WhenALiteralStillCarriesAKey()
    {
        // Defence-in-depth: a residual key in a literal must abort the harvest
        // (AssertRedacted throws before SaveChanges) and persist nothing.
        Fixture.PerenualPestCatalogStub.SetPage(1, Page(1,
            (1, "X", "Y", "{\"id\":1,\"u\":\"http://h?key=sk-LEAKED123\"}")));
        AuthAsAdmin();

        // The guard fails loud: TestServer surfaces the unhandled exception to the
        // caller; a pipeline with exception middleware would return 500 instead.
        // Tolerate either — the durable invariant is that NOTHING is persisted
        // (asserting only the throw would be brittle to a middleware change). CR PR #103.
        HttpResponseMessage? response = null;
        try
        {
            response = await Client.PostAsync(HarvestUrl, null);
        }
        catch (InvalidOperationException)
        {
            // Expected: AssertRedacted threw and TestServer rethrew it here.
        }

        Assert.True(response is null || response.StatusCode == HttpStatusCode.InternalServerError);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(0, await db.PerenualPestCatalog.CountAsync());
    }

    [Fact]
    public async Task Harvest_LaterPageFails_CountsFailure_AndPersistsFetchedPages()
    {
        Fixture.PerenualPestCatalogStub.SetPage(1, Page(2,
            (1, "Fairy ring", "Agrocybe", "{\"id\":1}")));
        // Page 2 intentionally not pre-loaded → the stub returns null → counted failure.
        AuthAsAdmin();

        var response = await Client.PostAsync(HarvestUrl, null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<HarvestResp>();
        Assert.Equal(1, body!.PagesFetched);
        Assert.True(body.Failures >= 1);
        Assert.Equal(1, body.ItemsUpserted);

        // The successfully-fetched page-1 rows are still persisted (partial progress).
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(1, await db.PerenualPestCatalog.CountAsync());
    }

    [Fact]
    public async Task Harvest_RepeatedPestIdAcrossPages_DedupesToOneRow_NoUniqueViolation()
    {
        // The same PerenualPestId on two pages (pagination drift). The shared
        // cumulative dict must resolve the second occurrence to the first-added
        // instance — a single row, no unique-index violation at SaveChanges. (CR PR #103 R2.)
        Fixture.PerenualPestCatalogStub.SetPage(1, Page(2,
            (7, "Aphids", "Aphidoidea", "{\"id\":7,\"v\":1}")));
        Fixture.PerenualPestCatalogStub.SetPage(2, Page(2,
            (7, "Aphids (updated)", "Aphidoidea", "{\"id\":7,\"v\":2}")));
        AuthAsAdmin();

        var response = await Client.PostAsync(HarvestUrl, null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(1, await db.PerenualPestCatalog.CountAsync());
        // Last page wins — the second occurrence updates the same row, no duplicate.
        var row = await db.PerenualPestCatalog.SingleAsync(c => c.PerenualPestId == 7);
        Assert.Equal("Aphids (updated)", row.CommonName);
    }

    // SMA-33: admin-gated endpoint — AuthAsAdmin carries the Admin role,
    // AuthAsNonAdmin is a plain authenticated user (for the 403 gate).
    private void AuthAsAdmin()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId, Roles.Admin));
    }

    private void AuthAsNonAdmin()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }

    private record HarvestResp(int PagesFetched, int ItemsUpserted, int Failures);
}
