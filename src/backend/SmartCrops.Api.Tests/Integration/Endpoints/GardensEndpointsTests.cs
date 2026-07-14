using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-6 / SMA-155: <c>GET /api/gardens</c> now serves a projected list —
/// distinct PLACED plants per garden (placements are the sole membership truth,
/// Option A) as Library-shaped items localized per <c>?lang=</c>. Also pins the
/// removal of <c>POST /api/gardens/{id}/plants/{plantId}</c>.
/// </summary>
public class GardensEndpointsTests : IntegrationTestBase
{
    public GardensEndpointsTests(PostgresFixture fixture) : base(fixture) { }

    [Fact]
    public async Task GetGardens_CountsDistinctPlacedPlants()
    {
        // 3 placements over 2 distinct plants -> the card data must say 2.
        var (userId, gardenId, plantA) = await SeedAsync();
        var plantB = await SeedPlantAsync("Zea mays");
        await SeedPlacementAsync(gardenId, plantA, row: 0);
        await SeedPlacementAsync(gardenId, plantA, row: 1);
        await SeedPlacementAsync(gardenId, plantB, row: 2);
        AuthAs(userId);

        var response = await Client.GetAsync("/api/gardens");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<List<GardenListItemDto>>();
        Assert.NotNull(body);
        var garden = Assert.Single(body!);
        Assert.Equal(2, garden.Plants.Count);
    }

    [Fact]
    public async Task GetGardens_LinkTableRowsWithoutPlacements_DoNotCount()
    {
        // Option A regression lock: a legacy GardenPlants row (old add-path)
        // with NO placement contributes NOTHING to the card list/counter.
        var (userId, gardenId, plantId) = await SeedAsync();
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            db.GardenPlants.Add(new GardenPlant
            {
                GardenId = gardenId,
                PlantId = plantId,
                AddedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }
        AuthAs(userId);

        var response = await Client.GetAsync("/api/gardens");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<List<GardenListItemDto>>();
        var garden = Assert.Single(body!);
        Assert.Empty(garden.Plants);
    }

    [Fact]
    public async Task GetGardens_LocalizesCommonName_RequestedLanguageThenEnglish()
    {
        var (userId, gardenId, plantId) = await SeedAsync();
        await SeedTranslationsAsync(plantId, ("fr", "lierre"), ("en", "english ivy"));
        await SeedPlacementAsync(gardenId, plantId, row: 0);
        AuthAs(userId);

        var fr = await (await Client.GetAsync("/api/gardens?lang=fr"))
            .Content.ReadFromJsonAsync<List<GardenListItemDto>>();
        Assert.Equal("lierre", Assert.Single(Assert.Single(fr!).Plants).CommonName);

        var en = await (await Client.GetAsync("/api/gardens?lang=en"))
            .Content.ReadFromJsonAsync<List<GardenListItemDto>>();
        Assert.Equal("english ivy", Assert.Single(Assert.Single(en!).Plants).CommonName);
    }

    [Fact]
    public async Task GetGardens_MissingRequestedLanguage_FallsBackToEnglish()
    {
        var (userId, gardenId, plantId) = await SeedAsync();
        await SeedTranslationsAsync(plantId, ("en", "lady fern"));
        await SeedPlacementAsync(gardenId, plantId, row: 0);
        AuthAs(userId);

        var body = await (await Client.GetAsync("/api/gardens?lang=fr"))
            .Content.ReadFromJsonAsync<List<GardenListItemDto>>();
        var plant = Assert.Single(Assert.Single(body!).Plants);
        // EN fallback; the client resolver then owns the ScientificName tier.
        Assert.Equal("lady fern", plant.CommonName);
        Assert.NotNull(plant.ScientificName);
    }

    [Fact]
    public async Task GetGardens_NoAuthHeader_Returns401()
    {
        var response = await Client.GetAsync("/api/gardens");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AddPlantToGarden_Endpoint_IsRemoved()
    {
        // SMA-6 Option A: the add endpoint is gone. The route template is still
        // bound by PATCH/DELETE, so ASP.NET answers 405 Method Not Allowed for
        // POST (not 404 — that would require unbinding the whole template).
        var (userId, gardenId, plantId) = await SeedAsync();
        AuthAs(userId);

        var response = await Client.PostAsJsonAsync(
            $"/api/gardens/{gardenId}/plants/{plantId}",
            new { Notes = "should never land" });

        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.False(await db.GardenPlants.AnyAsync(gp => gp.GardenId == gardenId));
    }

    // ── Helpers (same standalone pattern as GardenLayoutEndpointsTests) ───────

    private void AuthAs(string userId)
    {
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }

    private async Task<(string userId, Guid gardenId, Guid plantId)> SeedAsync()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        await SeedUserAsync(userId);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var garden = new Garden
        {
            Id = Guid.NewGuid(),
            Name = "Test garden",
            UserId = userId,
        };
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = $"Hedera helix {Guid.NewGuid():N}",
            PlantTypeId = 1,
        };
        db.Gardens.Add(garden);
        db.Plants.Add(plant);
        await db.SaveChangesAsync();

        return (userId, garden.Id, plant.Id);
    }

    private async Task<Guid> SeedPlantAsync(string scientificName)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = $"{scientificName} {Guid.NewGuid():N}",
            PlantTypeId = 1,
        };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    private async Task SeedPlacementAsync(Guid gardenId, Guid plantId, int row)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.GardenPlacements.Add(new GardenPlacement
        {
            Id = Guid.NewGuid(),
            GardenId = gardenId,
            PlantId = plantId,
            StartRow = row,
            StartCol = 0,
            SpanRows = 1,
            SpanCols = 1,
            PlacedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private async Task SeedTranslationsAsync(
        Guid plantId,
        params (string Language, string CommonName)[] translations)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        foreach (var (language, commonName) in translations)
        {
            db.PlantTranslations.Add(new PlantTranslation
            {
                PlantId = plantId,
                Language = language,
                CommonName = commonName,
            });
        }
        await db.SaveChangesAsync();
    }

    private async Task SeedUserAsync(string userId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0);",
            userId);
    }

    // Private wire mirrors (the file stands alone — GardenLayoutEndpointsTests pattern).
    private record GardenListItemDto(
        Guid Id,
        string Name,
        string? Description,
        DateTime CreatedAt,
        DateTime UpdatedAt,
        List<PlantItemDto> Plants);

    private record PlantItemDto(Guid Id, string ScientificName, string? CommonName);
}
