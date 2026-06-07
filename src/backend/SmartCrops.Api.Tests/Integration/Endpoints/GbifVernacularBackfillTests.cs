using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for the SMA-124 backfill
/// (<c>POST /api/admin/translations/gbif-vernacular-backfill</c>): re-fetches GBIF
/// vernacular names for plants that have a <c>GbifTaxonKey</c> but no <c>fr</c>
/// <c>PlantTranslations</c> row, picks the best FR name, and INSERTs it name-only.
/// The live GBIF transport is stubbed via <see cref="PostgresFixture.GbifHttpStub"/>.
/// </summary>
public class GbifVernacularBackfillTests : IntegrationTestBase
{
    public GbifVernacularBackfillTests(PostgresFixture fixture) : base(fixture) { }

    // delayMs=0 so the tests don't pay the courteous pacing delay.
    private const string Url = "/api/admin/translations/gbif-vernacular-backfill";
    private const int OrnamentalTypeId = 4; // seeded by PlantTypeConfiguration, survives Respawn

    private void AuthAsAdmin()
    {
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken($"u-{Guid.NewGuid():N}", Roles.Admin));
    }

    private static string Page(params string[] entries)
        => $"{{\"offset\":0,\"limit\":100,\"endOfRecords\":true,\"results\":[{string.Join(",", entries)}]}}";

    private static string Entry(string name, string lang, bool? preferred = null)
        => preferred is null
            ? $"{{\"vernacularName\":\"{name}\",\"language\":\"{lang}\"}}"
            : $"{{\"vernacularName\":\"{name}\",\"language\":\"{lang}\",\"preferred\":{preferred.ToString()!.ToLowerInvariant()}}}";

    private async Task<Guid> SeedPlantAsync(string scientificName, int? gbifTaxonKey, bool withFrTranslation = false)
    {
        var id = Guid.NewGuid();
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(new Plant
        {
            Id = id,
            ScientificName = scientificName,
            PlantTypeId = OrnamentalTypeId,
            GbifTaxonKey = gbifTaxonKey,
        });
        if (withFrTranslation)
        {
            db.PlantTranslations.Add(new PlantTranslation { PlantId = id, Language = "fr", CommonName = "Nom curé" });
        }
        await db.SaveChangesAsync();
        return id;
    }

    private record BackfillResp(
        bool DryRun, int Targets, int Processed, int FrInserted, int NoFrVernacular,
        int Failed, Guid? NextAfterId, IReadOnlyList<SamplePair> Sample);

    private record SamplePair(string ScientificName, string FrenchName);

    [Fact]
    public async Task NoAuth_Returns401()
    {
        var res = await Client.PostAsync($"{Url}?dryRun=true", null);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task DryRun_SelectsFrName_ReportsSample_WithoutPersisting()
    {
        var id = await SeedPlantAsync("Mentha piperita", 8707933);
        Fixture.GbifHttpStub.SetVernacular(8707933, Page(
            Entry("Menthe poivree", "fra"),
            Entry("menthe poivrée", "fra"),
            Entry("Peppermint", "eng")));
        AuthAsAdmin();

        var res = await Client.PostAsync($"{Url}?dryRun=true&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<BackfillResp>();

        Assert.True(body!.DryRun);
        Assert.Equal(1, body.Targets);
        Assert.Equal(1, body.Processed);
        Assert.Equal(1, body.FrInserted);
        Assert.Equal(0, body.NoFrVernacular);
        Assert.Equal(0, body.Failed);
        var pair = Assert.Single(body.Sample);
        Assert.Equal("Mentha piperita", pair.ScientificName);
        Assert.Equal("menthe poivrée", pair.FrenchName);

        // Nothing persisted.
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.False(await db.PlantTranslations.AnyAsync(t => t.PlantId == id));
    }

    [Fact]
    public async Task Apply_InsertsFrRow_NameOnly_NoDescription()
    {
        var id = await SeedPlantAsync("Mentha piperita", 8707933);
        Fixture.GbifHttpStub.SetVernacular(8707933, Page(
            Entry("menthe poivrée", "fra", preferred: true),
            Entry("Peppermint", "eng")));
        AuthAsAdmin();

        var res = await Client.PostAsync($"{Url}?dryRun=false&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var fr = await db.PlantTranslations.SingleAsync(t => t.PlantId == id && t.Language == "fr");
        Assert.Equal("menthe poivrée", fr.CommonName);
        Assert.Null(fr.Description);
        // Never an EN row.
        Assert.False(await db.PlantTranslations.AnyAsync(t => t.PlantId == id && t.Language == "en"));
    }

    [Fact]
    public async Task ExistingFrRow_IsNeitherTargetedNorOverwritten()
    {
        var id = await SeedPlantAsync("Lavandula angustifolia", 2927096, withFrTranslation: true);
        // Even if GBIF would return something, the plant is excluded from targets.
        Fixture.GbifHttpStub.SetVernacular(2927096, Page(Entry("lavande vraie", "fra")));
        AuthAsAdmin();

        var res = await Client.PostAsync($"{Url}?dryRun=false&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<BackfillResp>();
        Assert.Equal(0, body!.Targets); // already has fr → not a target

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var fr = await db.PlantTranslations.SingleAsync(t => t.PlantId == id && t.Language == "fr");
        Assert.Equal("Nom curé", fr.CommonName); // untouched
        Assert.DoesNotContain(2927096, Fixture.GbifHttpStub.Received); // never even fetched
    }

    [Fact]
    public async Task NoFrenchVernacular_InsertsNothing_CountsNoFr()
    {
        var id = await SeedPlantAsync("Azara serrata", 6043471);
        Fixture.GbifHttpStub.SetVernacular(6043471, Page(Entry("Vinillo", "spa"), Entry("Azara", "eng")));
        AuthAsAdmin();

        var res = await Client.PostAsync($"{Url}?dryRun=false&delayMs=0", null);
        var body = await res.Content.ReadFromJsonAsync<BackfillResp>();
        Assert.Equal(1, body!.Processed);
        Assert.Equal(0, body.FrInserted);
        Assert.Equal(1, body.NoFrVernacular);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.False(await db.PlantTranslations.AnyAsync(t => t.PlantId == id));
    }

    [Fact]
    public async Task HttpErrorReturnsEmpty_CountsNoFrVernacular_AndRunContinues()
    {
        var bad = await SeedPlantAsync("Broken taxon", 111);
        var good = await SeedPlantAsync("Mentha piperita", 8707933);
        Fixture.GbifHttpStub.SetVernacular(111, "{}", HttpStatusCode.InternalServerError);
        Fixture.GbifHttpStub.SetVernacular(8707933, Page(Entry("menthe poivrée", "fra")));
        AuthAsAdmin();

        var res = await Client.PostAsync($"{Url}?dryRun=false&delayMs=0", null);
        var body = await res.Content.ReadFromJsonAsync<BackfillResp>();

        // A 5xx is swallowed by the client (empty list) → selector null → NoFrVernacular,
        // NOT Failed: the GBIF client never throws on transport status. The good plant
        // still gets its FR name, proving the run continued past the bad taxon.
        Assert.Equal(2, body!.Targets);
        Assert.Equal(2, body.Processed);
        Assert.Equal(1, body.FrInserted);
        Assert.Equal(1, body.NoFrVernacular); // the 5xx taxon → no usable name
        Assert.Equal(0, body.Failed);         // swallowed transport error is NOT a failure

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.False(await db.PlantTranslations.AnyAsync(t => t.PlantId == bad));
        Assert.True(await db.PlantTranslations.AnyAsync(t => t.PlantId == good && t.Language == "fr"));
    }

    [Fact]
    public async Task PlantsWithoutGbifKey_AreNotTargeted()
    {
        await SeedPlantAsync("No key plant", null);
        AuthAsAdmin();

        var res = await Client.PostAsync($"{Url}?dryRun=true&delayMs=0", null);
        var body = await res.Content.ReadFromJsonAsync<BackfillResp>();
        Assert.Equal(0, body!.Targets);
    }

    [Fact]
    public async Task Apply_IsIdempotent()
    {
        await SeedPlantAsync("Mentha piperita", 8707933);
        Fixture.GbifHttpStub.SetVernacular(8707933, Page(Entry("menthe poivrée", "fra")));
        AuthAsAdmin();

        await Client.PostAsync($"{Url}?dryRun=false&delayMs=0", null);
        var res2 = await Client.PostAsync($"{Url}?dryRun=false&delayMs=0", null);
        var body = await res2.Content.ReadFromJsonAsync<BackfillResp>();

        Assert.Equal(0, body!.Targets); // already inserted → no longer a target
        Assert.Equal(0, body.FrInserted);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(1, await db.PlantTranslations.CountAsync(t => t.Language == "fr"));
    }
}
