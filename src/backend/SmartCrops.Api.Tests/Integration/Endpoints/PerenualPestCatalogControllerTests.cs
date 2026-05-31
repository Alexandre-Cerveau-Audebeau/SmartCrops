using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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
    public async Task Harvest_PaginatesAllPages_UpsertsEachEntry_AndDoesNotExposeLiterals()
    {
        Fixture.PerenualPestCatalogStub.SetPage(1, Page(2,
            (1, "Fairy ring", "Agrocybe", "{\"id\":1,\"host\":[\"all lawn grasses\"]}"),
            (2, "Aphids", "Aphidoidea", "{\"id\":2}")));
        Fixture.PerenualPestCatalogStub.SetPage(2, Page(2,
            (3, "Powdery mildew", "Erysiphales", "{\"id\":3}")));
        AuthAsAnyUser();

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
        AuthAsAnyUser();

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
        AuthAsAnyUser();
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
        AuthAsAnyUser();

        // The guard throws; TestServer surfaces the unhandled exception to the
        // caller (in production this is a 500). Either way the harvest aborts
        // before any write reaches the database — fail loud, never persist.
        await Assert.ThrowsAsync<InvalidOperationException>(() => Client.PostAsync(HarvestUrl, null));

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(0, await db.PerenualPestCatalog.CountAsync());
    }

    private void AuthAsAnyUser()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }

    private record HarvestResp(int PagesFetched, int ItemsUpserted, int Failures);
}
