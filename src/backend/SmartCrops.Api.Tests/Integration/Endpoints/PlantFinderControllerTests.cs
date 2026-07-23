using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;
using Typesense;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for the SMA-255 T3 public finder. The
/// <see cref="SmartCrops.Core.Interfaces.IPlantSearchService"/> is stubbed at
/// the DI layer (PostgresFixture) — no Typesense server in the integration
/// environment; the filter_by grammar is unit-tested in
/// <c>PlantSearchFilterBuilderTests</c> and the engine round-trip is validated
/// against the live docker stack. Hydration runs against the REAL Postgres
/// container: ids from the stub → rows seeded here → PlantListItemResponse.
/// All requests are anonymous — the finder is public like the Library list.
/// </summary>
public class PlantFinderControllerTests : IntegrationTestBase
{
    public PlantFinderControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string FinderUrl = "/api/plants/finder";

    private async Task<List<Plant>> SeedPlantsAsync(params string[] scientificNames)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        // PlantTypes survive Respawn (seeded reference data) — use the first.
        var typeId = await db.PlantTypes.Select(t => t.Id).OrderBy(id => id).FirstAsync();
        var plants = scientificNames
            .Select(name => new Plant { Id = Guid.NewGuid(), ScientificName = name, PlantTypeId = typeId })
            .ToList();
        db.Plants.AddRange(plants);
        await db.SaveChangesAsync();
        return plants;
    }

    [Fact]
    public async Task Find_HydratesItems_InEngineOrder()
    {
        var seeded = await SeedPlantsAsync("Aster alpinus", "Betula pendula", "Crocus sativus");
        var (a, b, c) = (seeded[0], seeded[1], seeded[2]);
        // Engine relevance order C, A, B — deliberately not the SQL order.
        Fixture.PlantSearchStub.Next = new PlantSearchResult(
            [c.Id, a.Id, b.Id], 3, 1, 24,
            [new FacetFieldCounts("careLevel", [new FacetValueCount("Easy", 2), new FacetValueCount("unknown", 1)])]);

        var response = await Client.GetAsync($"{FinderUrl}?perPage=24");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<FinderResp>();
        Assert.NotNull(body);
        Assert.Equal(3, body!.Found);
        Assert.Equal(
            new[] { "Crocus sativus", "Aster alpinus", "Betula pendula" },
            body.Items.Select(i => i.ScientificName).ToArray());
        var facet = Assert.Single(body.FacetCounts);
        Assert.Equal("careLevel", facet.Field);
        Assert.Equal(2, facet.Counts.Single(v => v.Value == "Easy").Count);
        Assert.Equal(1, facet.Counts.Single(v => v.Value == "unknown").Count);
    }

    [Fact]
    public async Task Find_MissingId_SkippedWithoutFailingTheRequest()
    {
        var seeded = await SeedPlantsAsync("Aster alpinus");
        // One hit points at a plant that no longer exists in Postgres (index
        // drift since the last reindex) — the page must still serve.
        Fixture.PlantSearchStub.Next = new PlantSearchResult(
            [Guid.NewGuid(), seeded[0].Id], 2, 1, 24, []);

        var response = await Client.GetAsync(FinderUrl);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<FinderResp>();
        var item = Assert.Single(body!.Items);
        Assert.Equal("Aster alpinus", item.ScientificName);
        Assert.Equal(2, body.Found);
    }

    [Theory]
    [InlineData("page=0")]
    [InlineData("perPage=0")]
    [InlineData("perPage=101")]
    [InlineData("lang=de")]
    [InlineData("careLevels=SuperEasy")]
    [InlineData("hardinessZoneMin=9&hardinessZoneMax=4")]
    [InlineData("plantTypeIds=0")]
    public async Task Find_InvalidQuery_Returns400_WithoutCallingTheEngine(string queryString)
    {
        var response = await Client.GetAsync($"{FinderUrl}?{queryString}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(Fixture.PlantSearchStub.Received);
    }

    [Fact]
    public async Task Find_OversizedTextQuery_Returns400_WithoutCallingTheEngine()
    {
        // Amplification guard: the 200-char cap 400s before any engine call.
        var oversized = new string('a', 250);

        var response = await Client.GetAsync($"{FinderUrl}?q={oversized}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(Fixture.PlantSearchStub.Received);
    }

    [Fact]
    public async Task Find_TextQueryAtTheCap_Passes_EngineIsReached()
    {
        // Boundary of the amplification guard at the HTTP layer: exactly 200
        // chars is allowed and the query reaches the engine.
        var atCap = new string('a', 200);

        var response = await Client.GetAsync($"{FinderUrl}?q={atCap}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var received = Assert.Single(Fixture.PlantSearchStub.Received);
        Assert.Equal(atCap, received.Q);
    }

    [Fact]
    public async Task Find_EngineUnavailable_Returns503()
    {
        Fixture.PlantSearchStub.NextException =
            new TypesenseApiServiceUnavailableException("engine down");

        var response = await Client.GetAsync(FinderUrl);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task Find_LegacyLanguageKey_IsIgnored_FallsBackToEnglish()
    {
        // The finder binds the display language as `lang` (legacy list-endpoint
        // convention). A stray `language=` key must be ignored — default en —
        // not honored and not a 400.
        Fixture.PlantSearchStub.Next = new PlantSearchResult([], 0, 1, 24, []);

        var response = await Client.GetAsync($"{FinderUrl}?language=fr");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var received = Assert.Single(Fixture.PlantSearchStub.Received);
        Assert.Equal("en", received.Language);
    }

    [Fact]
    public async Task Find_DuplicateEngineIds_HydrateOnce_NoCrash()
    {
        var seeded = await SeedPlantsAsync("Aster alpinus");
        // A duplicated hit id (defensive: the engine shouldn't do this, but the
        // repository contract must not crash on it) hydrates a single item.
        Fixture.PlantSearchStub.Next = new PlantSearchResult(
            [seeded[0].Id, seeded[0].Id], 2, 1, 24, []);

        var response = await Client.GetAsync(FinderUrl);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<FinderResp>();
        var item = Assert.Single(body!.Items);
        Assert.Equal("Aster alpinus", item.ScientificName);
    }

    [Fact]
    public async Task Find_BindsFullQueryContract_ToTheServiceCall()
    {
        Fixture.PlantSearchStub.Next = new PlantSearchResult([], 0, 2, 10, []);

        var response = await Client.GetAsync(
            $"{FinderUrl}?q=lavender&lang=fr&page=2&perPage=10"
            + "&careLevels=Easy&careLevels=Medium&plantTypeIds=1&plantTypeIds=3"
            + "&isEdible=true&hardinessZoneMin=4&hardinessZoneMax=9&xWateringPhMin=5.5");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var received = Assert.Single(Fixture.PlantSearchStub.Received);
        Assert.Equal("lavender", received.Q);
        Assert.Equal("fr", received.Language);
        Assert.Equal(2, received.Page);
        Assert.Equal(10, received.PerPage);
        Assert.NotNull(received.CareLevels);
        Assert.Equal(["Easy", "Medium"], received.CareLevels);
        Assert.NotNull(received.PlantTypeIds);
        Assert.Equal([1, 3], received.PlantTypeIds);
        Assert.True(received.IsEdible);
        Assert.Equal(4, received.HardinessZoneMin);
        Assert.Equal(9, received.HardinessZoneMax);
        Assert.Equal(5.5m, received.XWateringPhMin);
    }

    private sealed record FinderResp(
        List<ItemResp> Items,
        int Found,
        int Page,
        int PerPage,
        List<FacetFieldResp> FacetCounts);

    private sealed record ItemResp(Guid Id, string ScientificName);

    private sealed record FacetFieldResp(string Field, List<FacetValueResp> Counts);

    private sealed record FacetValueResp(string Value, int Count);
}
