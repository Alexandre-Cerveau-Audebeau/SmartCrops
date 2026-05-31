using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for the Trefle admin enrichment endpoints. The
/// <see cref="SmartCrops.Core.Interfaces.IPlantTrefleEnrichmentService"/> is
/// stubbed at the DI layer (see <c>PostgresFixture</c>) so these tests verify
/// the ADR-0003 5-target dual-write contract (PlantTrefleData upsert +
/// PlantImage/CommonName/Synonym delete-then-insert + PlantSource upsert +
/// Plant denormalisation, all in one transaction) without touching Trefle
/// over HTTP.
/// </summary>
public class PlantTrefleControllerTests : IntegrationTestBase
{
    public PlantTrefleControllerTests(PostgresFixture fixture) : base(fixture) { }

    // ── enrich/{plantId} ───────────────────────────────────────────────────

    [Fact]
    public async Task Enrich_NoAuth_Returns401()
    {
        var response = await Client.PostAsync($"/api/admin/trefle/enrich/{Guid.NewGuid()}", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Enrich_AuthenticatedNonAdmin_Returns403()
    {
        AuthAsNonAdmin();

        var response = await Client.PostAsync($"/api/admin/trefle/enrich/{Guid.NewGuid()}", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Enrich_NonExistentPlant_Returns404()
    {
        AuthAsAdmin();

        var response = await Client.PostAsync($"/api/admin/trefle/enrich/{Guid.NewGuid()}", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Enrich_Match_PerformsFullDualWrite()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TrefleStub.Enqueue(SampleMatch(
            trefleId: 12345,
            slug: "solanum-lycopersicum",
            wfoId: "wfo-00001",
            images:
            [
                new TrefleImage("https://x/flower.jpg", PlantImageType.Flower, "CC BY 4.0", "Jane"),
                new TrefleImage("https://x/leaf.jpg", PlantImageType.Leaf, null, null),
            ],
            commonNames:
            [
                new TrefleCommonName("en", "tomato"),
                new TrefleCommonName("fr", "tomate"),
                new TrefleCommonName("en", "love apple"),
            ],
            synonyms:
            [
                new TrefleSynonym("Lycopersicon esculentum", "Mill."),
            ]));
        AuthAsAdmin();

        var response = await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<MatchedDto>();
        Assert.NotNull(body);
        Assert.True(body!.Matched);
        Assert.Equal(12345, body.TrefleId);
        Assert.Equal(2, body.ImagesAdded);
        Assert.Equal(3, body.CommonNamesAdded);
        Assert.Equal(1, body.SynonymsAdded);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        // Plant: TrefleEnriched flag set, denormalized fields populated.
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.True(plant.EnrichmentStatus.HasFlag(EnrichmentStatus.TrefleEnriched));
        Assert.NotNull(plant.LastEnrichmentAt);
        Assert.Equal("wfo-00001", plant.WfoId);
        Assert.Equal(PlantGrowthHabit.Forb, plant.GrowthHabit);
        Assert.Equal(8, plant.LightLevel);
        Assert.True(plant.IsEdible);
        Assert.True(plant.IsVegetable);

        // PlantTrefleData: upserted with raw + slug + denorm.
        var trefleData = await db.PlantTrefleData.SingleAsync(t => t.PlantId == plantId);
        Assert.Equal("solanum-lycopersicum", trefleData.TrefleSlug);
        Assert.Equal("wfo-00001", trefleData.WfoId);
        Assert.Equal("Forb/herb", trefleData.GrowthHabit);
        Assert.NotNull(trefleData.RawResponseJson);

        // PlantImage: 2 rows for Source=Trefle with correct enum + license.
        var images = await db.PlantImages
            .Where(i => i.PlantId == plantId)
            .OrderBy(i => i.ImageType)
            .ToListAsync();
        Assert.Equal(2, images.Count);
        Assert.All(images, i => Assert.Equal(PlantSourceType.Trefle, i.Source));
        var flowerImg = images.Single(i => i.ImageType == PlantImageType.Flower);
        Assert.Equal("CC BY 4.0", flowerImg.LicenseName);
        Assert.Equal("Jane", flowerImg.Credit);

        // PlantCommonName: 3 rows, one primary per language.
        var commonNames = await db.PlantCommonNames
            .Where(c => c.PlantId == plantId)
            .ToListAsync();
        Assert.Equal(3, commonNames.Count);
        var enPrimaries = commonNames.Where(c => c.LanguageCode == "en" && c.IsPrimary).ToList();
        Assert.Single(enPrimaries);
        Assert.Equal("tomato", enPrimaries[0].Name);

        // PlantSynonym: 1 row.
        var synonyms = await db.PlantSynonyms.Where(s => s.PlantId == plantId).ToListAsync();
        Assert.Single(synonyms);
        Assert.Equal("Lycopersicon esculentum", synonyms[0].Synonym);
        Assert.Equal("Mill.", synonyms[0].Authority);

        // PlantSource: Trefle row written with stringified TrefleId.
        var source = await db.PlantSources
            .SingleAsync(s => s.PlantId == plantId && s.SourceType == PlantSourceType.Trefle);
        Assert.Equal("12345", source.ExternalId);
        Assert.Equal("https://trefle.io/api/v1/species/12345", source.Url);
        Assert.NotNull(source.LastFetchedAt);
    }

    [Fact]
    public async Task Enrich_AlreadyEnriched_SkipsWithoutForce()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TrefleStub.Enqueue(SampleMatch(12345));
        AuthAsAdmin();

        await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}", null);

        var callsBefore = Fixture.TrefleStub.ReceivedNames.Count;
        var response = await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SkippedDto>();
        Assert.NotNull(body);
        Assert.True(body!.Skipped);
        Assert.Equal("AlreadyEnriched", body.Reason);
        Assert.Equal(callsBefore, Fixture.TrefleStub.ReceivedNames.Count);
    }

    [Fact]
    public async Task Enrich_Force_ReplacesImagesCommonNamesSynonyms()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TrefleStub.Enqueue(SampleMatch(
            trefleId: 12345,
            images: [new TrefleImage("https://x/old-flower.jpg", PlantImageType.Flower, null, null)],
            commonNames: [new TrefleCommonName("en", "old-tomato")],
            synonyms: [new TrefleSynonym("Old synonym", null)]));
        AuthAsAdmin();

        await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}", null);

        Fixture.TrefleStub.Enqueue(SampleMatch(
            trefleId: 12345,
            images:
            [
                new TrefleImage("https://x/new-leaf.jpg", PlantImageType.Leaf, null, null),
                new TrefleImage("https://x/new-fruit.jpg", PlantImageType.Fruit, null, null),
            ],
            commonNames: [new TrefleCommonName("en", "new-tomato"), new TrefleCommonName("fr", "tomate")],
            synonyms: [new TrefleSynonym("New synonym", "Auth")]));

        var response = await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}?force=true", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var images = await db.PlantImages.Where(i => i.PlantId == plantId).ToListAsync();
        Assert.Equal(2, images.Count);
        Assert.DoesNotContain(images, i => i.Url.Contains("old"));
        Assert.Contains(images, i => i.ImageType == PlantImageType.Leaf);
        Assert.Contains(images, i => i.ImageType == PlantImageType.Fruit);

        var commonNames = await db.PlantCommonNames.Where(c => c.PlantId == plantId).ToListAsync();
        Assert.Equal(2, commonNames.Count);
        Assert.DoesNotContain(commonNames, c => c.Name == "old-tomato");

        var synonyms = await db.PlantSynonyms.Where(s => s.PlantId == plantId).ToListAsync();
        Assert.Single(synonyms);
        Assert.Equal("New synonym", synonyms[0].Synonym);
    }

    [Fact]
    public async Task Enrich_Force_UpsertsTrefleDataAndSourceWithoutDuplicating()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TrefleStub.Enqueue(SampleMatch(12345));
        AuthAsAdmin();

        await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}", null);

        DateTime firstFetchedAt;
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            firstFetchedAt = (await db.PlantSources
                .SingleAsync(s => s.PlantId == plantId && s.SourceType == PlantSourceType.Trefle))
                .LastFetchedAt!.Value;
        }

        // Small delay so LastFetchedAt is observably newer on re-enrichment.
        await Task.Delay(15);

        Fixture.TrefleStub.Enqueue(SampleMatch(99999)); // different id this time
        var response = await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}?force=true", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope2 = CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var sources = await db2.PlantSources
            .Where(s => s.PlantId == plantId && s.SourceType == PlantSourceType.Trefle)
            .ToListAsync();
        Assert.Single(sources);
        Assert.Equal("99999", sources[0].ExternalId);
        Assert.Equal("https://trefle.io/api/v1/species/99999", sources[0].Url);
        Assert.True(sources[0].LastFetchedAt > firstFetchedAt);

        var trefleDataCount = await db2.PlantTrefleData.CountAsync(t => t.PlantId == plantId);
        Assert.Equal(1, trefleDataCount);
    }

    [Fact]
    public async Task Enrich_NoMatch_DoesNotWriteAnything()
    {
        var plantId = await SeedPlantAsync("Plantus inventicus");
        Fixture.TrefleStub.EnqueueNoMatch();
        AuthAsAdmin();

        var response = await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<NoMatchDto>();
        Assert.NotNull(body);
        Assert.False(body!.Matched);
        Assert.Equal("NONE", body.MatchType);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.False(plant.EnrichmentStatus.HasFlag(EnrichmentStatus.TrefleEnriched));

        Assert.Equal(0, await db.PlantTrefleData.CountAsync(t => t.PlantId == plantId));
        Assert.Equal(0, await db.PlantImages.CountAsync(i => i.PlantId == plantId));
        Assert.Equal(0, await db.PlantCommonNames.CountAsync(c => c.PlantId == plantId));
        Assert.Equal(0, await db.PlantSynonyms.CountAsync(s => s.PlantId == plantId));
        Assert.Equal(0, await db.PlantSources.CountAsync(
            s => s.PlantId == plantId && s.SourceType == PlantSourceType.Trefle));
    }

    [Fact]
    public async Task Enrich_NullScalars_DoNotOverwriteExistingPlantValues()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum", configure: p =>
        {
            p.LightLevel = 5;
            p.IsEdible = true;
            p.SoilPhMin = 6.0m;
            p.SoilPhMax = 7.0m;
            p.MinTempC = 0;
            p.MaxTempC = 30;
        });
        // Trefle returns null for every scalar — the existing Plant values must survive.
        Fixture.TrefleStub.Enqueue(SampleMatch(
            trefleId: 12345,
            lightLevel: null,
            isEdible: null,
            soilPhMin: null,
            soilPhMax: null,
            minTempC: null,
            maxTempC: null,
            growthHabit: null,
            isVegetable: null));
        AuthAsAdmin();

        await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}", null);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Equal(5, plant.LightLevel);
        Assert.True(plant.IsEdible);
        Assert.Equal(6.0m, plant.SoilPhMin);
        Assert.Equal(7.0m, plant.SoilPhMax);
        Assert.Equal(0, plant.MinTempC);
        Assert.Equal(30, plant.MaxTempC);
    }

    [Fact]
    public async Task Enrich_WfoIdPreservedWhenGbifAlreadySetIt()
    {
        // GBIF wrote a WfoId first; Trefle reports a different one. The
        // controller treats GBIF's value as winning to keep the cross-ref stable.
        var plantId = await SeedPlantAsync("Solanum lycopersicum", configure: p =>
        {
            p.WfoId = "wfo-gbif-canonical";
        });
        Fixture.TrefleStub.Enqueue(SampleMatch(trefleId: 12345, wfoId: "wfo-trefle-different"));
        AuthAsAdmin();

        await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}", null);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Equal("wfo-gbif-canonical", plant.WfoId);
    }

    [Fact]
    public async Task Enrich_LightLevelZero_DoesNotViolateCheckConstraint()
    {
        // CK_Plants_LightLevel_Range requires 1..10. Trefle's 0 must be
        // silently dropped, not propagated.
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TrefleStub.Enqueue(SampleMatch(trefleId: 12345, lightLevel: 0));
        AuthAsAdmin();

        var response = await Client.PostAsync($"/api/admin/trefle/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Null(plant.LightLevel);
    }

    // ── enrich-all ────────────────────────────────────────────────────────

    [Fact]
    public async Task EnrichAll_SkipsAlreadyEnriched_ByDefault()
    {
        var enrichedId = await SeedPlantAsync("Solanum lycopersicum", alreadyTrefleEnriched: true);
        var pendingId = await SeedPlantAsync("Daucus carota");

        Fixture.TrefleStub.Enqueue(SampleMatch(trefleId: 7777));
        AuthAsAdmin();

        var response = await Client.PostAsync("/api/admin/trefle/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body);
        Assert.Equal(1, body!.Total);
        Assert.Equal(1, body.Matched);
        Assert.Equal(0, body.Skipped);
        Assert.Equal(0, body.NotMatched);
        Assert.Equal(0, body.Failed);

        var seen = Fixture.TrefleStub.ReceivedNames;
        Assert.Single(seen);
        Assert.Equal("Daucus carota", seen[0]);

        _ = enrichedId;
        _ = pendingId;
    }

    [Fact]
    public async Task EnrichAll_MixedOutcomes_CountedCorrectly()
    {
        await SeedPlantAsync("Solanum lycopersicum");
        await SeedPlantAsync("Plantus inventicus");
        await SeedPlantAsync("Daucus carota");

        Fixture.TrefleStub.Enqueue(SampleMatch(1));
        Fixture.TrefleStub.EnqueueNoMatch();
        Fixture.TrefleStub.Enqueue(SampleMatch(2));
        AuthAsAdmin();

        var response = await Client.PostAsync("/api/admin/trefle/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body);
        Assert.Equal(3, body!.Total);
        Assert.Equal(2, body.Matched);
        Assert.Equal(1, body.NotMatched);
        Assert.Equal(0, body.Skipped);
        Assert.Equal(0, body.Failed);
    }

    [Fact]
    public async Task EnrichAll_WithLimit_RespectsCursorAndReportsNextAfterId()
    {
        // Smoke for the PR 2a-2 r2 cursor contract on this controller (full
        // coverage lives on PlantTaxonomyController -- the three endpoints
        // are symmetric).
        await SeedPlantAsync("Solanum lycopersicum");
        await SeedPlantAsync("Daucus carota");
        await SeedPlantAsync("Plantus inventicus");

        Fixture.TrefleStub.Enqueue(SampleMatch(1));
        Fixture.TrefleStub.Enqueue(SampleMatch(2));
        AuthAsAdmin();

        var response = await Client.PostAsync("/api/admin/trefle/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.Total);
        Assert.Equal(2, body.Matched);
        Assert.Equal(1, body.NotEnrichedRemaining);
        Assert.NotNull(body.NextAfterId);

        // Second chunk picks up via the cursor and processes the tail.
        Fixture.TrefleStub.Enqueue(SampleMatch(3));
        var chunk2 = await Client.PostAsync(
            $"/api/admin/trefle/enrich-all?limit=2&afterId={body.NextAfterId}", null);
        Assert.Equal(HttpStatusCode.OK, chunk2.StatusCode);
        var body2 = await chunk2.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body2);
        Assert.Equal(1, body2!.Total);
        Assert.Equal(0, body2.NotEnrichedRemaining);
    }

    [Fact]
    public async Task EnrichAll_UnmatchableFrontBlock_StillReachesTail()
    {
        // Replica of the PlantTaxonomyControllerTests regression (CR r2 B-4):
        // pins the seek-cursor contract on the Trefle controller against
        // symmetry drift. A front block of unmatchable plants must NOT stall
        // the cursor; chunk 2 with the advanced afterId must reach the tail.
        await SeedPlantAsync("Trefle-front one");
        await SeedPlantAsync("Trefle-front two");
        await SeedPlantAsync("Trefle-front three");
        await SeedPlantAsync("Trefle-front four");

        // FIFO stub. EnrichAll iterates in OrderBy(Id), so the first two see
        // NoMatch and the last two see Match.
        Fixture.TrefleStub.EnqueueNoMatch();
        Fixture.TrefleStub.EnqueueNoMatch();
        Fixture.TrefleStub.Enqueue(SampleMatch(trefleId: 9001));
        Fixture.TrefleStub.Enqueue(SampleMatch(trefleId: 9002));
        AuthAsAdmin();

        var chunk1 = await Client.PostAsync("/api/admin/trefle/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, chunk1.StatusCode);
        var body1 = await chunk1.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body1);
        Assert.Equal(2, body1!.Total);
        Assert.Equal(0, body1.Matched);
        Assert.Equal(2, body1.NotMatched);
        Assert.NotNull(body1.NextAfterId);
        // Critical: remaining did NOT decrease (4 -> 4) -- the symptom the
        // old stalled guard tripped on. The cursor proceeds anyway.
        Assert.Equal(4, body1.NotEnrichedRemaining);

        var chunk2 = await Client.PostAsync(
            $"/api/admin/trefle/enrich-all?limit=2&afterId={body1.NextAfterId}", null);
        Assert.Equal(HttpStatusCode.OK, chunk2.StatusCode);
        var body2 = await chunk2.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body2);
        Assert.Equal(2, body2!.Total);
        Assert.Equal(2, body2.Matched);
        Assert.Equal(2, body2.NotEnrichedRemaining);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var tailFlagged = await db.Plants
            .Where(p => p.ScientificName.StartsWith("Trefle-front "))
            .OrderBy(p => p.Id)
            .Skip(2)
            .CountAsync(p => (p.EnrichmentStatus & EnrichmentStatus.TrefleEnriched) != 0);
        Assert.Equal(2, tailFlagged);
    }

    [Fact]
    public async Task EnrichAll_FailedPlant_RemainsUnflagged_RetriedOnFreshRun()
    {
        // Replica of the PlantTaxonomyControllerTests regression (CR r2 B-4):
        // pins the failure model on the Trefle controller. The cursor
        // advances PAST a failed plant within a single run; the fresh re-run
        // (no state file) picks it up at the head of the remaining set.
        await SeedPlantAsync("Trefle-failed alpha");
        await SeedPlantAsync("Trefle-failed beta");

        Guid pSmallerId;
        Guid pLargerId;
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var ordered = await db.Plants
                .Where(p => p.ScientificName.StartsWith("Trefle-failed "))
                .OrderBy(p => p.Id)
                .Select(p => p.Id)
                .ToListAsync();
            pSmallerId = ordered[0];
            pLargerId = ordered[1];
        }

        Fixture.TrefleStub.EnqueueFailure(new InvalidOperationException("transient upstream blip"));
        Fixture.TrefleStub.Enqueue(SampleMatch(trefleId: 9100));
        AuthAsAdmin();

        var chunk1 = await Client.PostAsync("/api/admin/trefle/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, chunk1.StatusCode);
        var body1 = await chunk1.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body1);
        Assert.Equal(2, body1!.Total);
        Assert.Equal(1, body1.Matched);
        Assert.Equal(1, body1.Failed);
        Assert.Equal(pLargerId, body1.NextAfterId);
        Assert.Equal(1, body1.NotEnrichedRemaining);

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var pSmaller = await db.Plants.SingleAsync(p => p.Id == pSmallerId);
            var pLarger = await db.Plants.SingleAsync(p => p.Id == pLargerId);
            Assert.False(pSmaller.EnrichmentStatus.HasFlag(EnrichmentStatus.TrefleEnriched));
            Assert.True(pLarger.EnrichmentStatus.HasFlag(EnrichmentStatus.TrefleEnriched));
        }

        // Fresh run: no afterId, the failed plant is still in !TrefleEnriched.
        Fixture.TrefleStub.Enqueue(SampleMatch(trefleId: 9101));

        var freshRun = await Client.PostAsync("/api/admin/trefle/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, freshRun.StatusCode);
        var body2 = await freshRun.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body2);
        Assert.Equal(1, body2!.Total);
        Assert.Equal(1, body2.Matched);
        Assert.Equal(0, body2.Failed);
        Assert.Equal(0, body2.NotEnrichedRemaining);

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var pSmaller = await db.Plants.SingleAsync(p => p.Id == pSmallerId);
            Assert.True(pSmaller.EnrichmentStatus.HasFlag(EnrichmentStatus.TrefleEnriched));
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private async Task<Guid> SeedPlantAsync(
        string scientificName,
        bool alreadyTrefleEnriched = false,
        Action<Plant>? configure = null)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = scientificName,
            PlantTypeId = 1,
            EnrichmentStatus = alreadyTrefleEnriched
                ? EnrichmentStatus.Manual | EnrichmentStatus.TrefleEnriched
                : EnrichmentStatus.Manual,
        };
        configure?.Invoke(plant);
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    // SMA-33: admin-gated controller — AuthAsAdmin carries the Admin role,
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

    private static TrefleEnrichmentResult SampleMatch(
        int trefleId,
        string? slug = null,
        string? wfoId = null,
        string? growthHabit = "Forb/herb",
        bool? isEdible = true,
        bool? isVegetable = true,
        int? lightLevel = 8,
        decimal? soilPhMin = 5.5m,
        decimal? soilPhMax = 7.5m,
        int? minTempC = -5,
        int? maxTempC = 35,
        int? soilNutriments = 7,
        IReadOnlyList<TrefleImage>? images = null,
        IReadOnlyList<TrefleCommonName>? commonNames = null,
        IReadOnlyList<TrefleSynonym>? synonyms = null) => new(
            TrefleId: trefleId,
            // PlantTrefleData has a filtered-unique index on TrefleSlug, so two
            // plants in the same test cannot share one. Default to a per-id slug.
            TrefleSlug: slug ?? $"slug-{trefleId}",
            WfoId: wfoId,
            CanonicalName: "Test species",
            RawResponseJson: "{\"stub\":true}",
            GrowthHabit: growthHabit,
            IsEdible: isEdible,
            IsVegetable: isVegetable,
            LightLevel: lightLevel,
            SoilPhMin: soilPhMin,
            SoilPhMax: soilPhMax,
            MinTempC: minTempC,
            MaxTempC: maxTempC,
            SoilNutriments: soilNutriments,
            FlowerColorsJson: "[\"red\"]",
            FoliageColorsJson: null,
            NativeRegionsJson: null,
            IntroducedRegionsJson: null,
            Images: images ?? Array.Empty<TrefleImage>(),
            CommonNames: commonNames ?? Array.Empty<TrefleCommonName>(),
            Synonyms: synonyms ?? Array.Empty<TrefleSynonym>(),
            MatchType: "EXACT");

    private record MatchedDto(
        bool Matched,
        int TrefleId,
        string? TrefleSlug,
        int ImagesAdded,
        int CommonNamesAdded,
        int SynonymsAdded);

    private record NoMatchDto(bool Matched, string MatchType);

    private record SkippedDto(bool Skipped, string Reason);

    private record EnrichAllDto(
        int Total,
        int Matched,
        int NotMatched,
        int Skipped,
        int Failed,
        int NotEnrichedRemaining,
        Guid? NextAfterId);
}
