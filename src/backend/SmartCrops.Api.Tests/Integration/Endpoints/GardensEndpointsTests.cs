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

    // (The SMA-6 "link-table rows don't count" lock was retired with the
    // GardenPlants table itself — SMA-285 makes the invariant structural.)

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
        // SMA-285: the whole {id}/plants/{plantId} template is UNBOUND now that
        // the PATCH-notes/DELETE pair left with the GardenPlants table — POST
        // answers 404 (the SMA-6-era pin asserted 405 while PATCH/DELETE still
        // bound the route; this is the DECLARED flip tied to their removal).
        var (userId, gardenId, plantId) = await SeedAsync();
        AuthAs(userId);

        var response = await Client.PostAsJsonAsync(
            $"/api/gardens/{gardenId}/plants/{plantId}",
            new { Notes = "should never land" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task LegacyPlantEndpoints_PatchAndDelete_Return404()
    {
        // SMA-285 Option A end-state: notes live on placements, membership IS
        // placement — the legacy per-plant route no longer exists at all.
        var (userId, gardenId, plantId) = await SeedAsync();
        AuthAs(userId);

        var patch = await Client.PatchAsJsonAsync(
            $"/api/gardens/{gardenId}/plants/{plantId}",
            new { Notes = "ghost" });
        Assert.Equal(HttpStatusCode.NotFound, patch.StatusCode);

        var delete = await Client.DeleteAsync(
            $"/api/gardens/{gardenId}/plants/{plantId}");
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);
    }

    [Fact]
    public async Task GetGarden_ReturnsCleanDto_NoEntityGraph()
    {
        // SMA-285: GET {id} serves the GardenResponse DTO — config fields in,
        // raw-entity artifacts (userId, gardenPlants graph) out.
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);
        await PutLayoutAsync(gardenId, ValidIndoorConfig());

        var response = await Client.GetAsync($"/api/gardens/{gardenId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(gardenId, json.GetProperty("id").GetGuid());
        Assert.Equal("S", json.GetProperty("orientation").GetString());
        Assert.Equal("indoor", json.GetProperty("gardenType").GetString());
        Assert.Equal("mid", json.GetProperty("latitudeBand").GetString());
        Assert.False(json.TryGetProperty("gardenPlants", out _));
        Assert.False(json.TryGetProperty("userId", out _));
        Assert.False(json.TryGetProperty("placements", out _));
    }

    [Fact]
    public async Task Layout_ConfigRoundtrip_PersistsThenPreservesWhenOmitted()
    {
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);

        // PUT with config -> GET /layout serves it back.
        var putWith = await PutLayoutAsync(gardenId, ValidIndoorConfig());
        Assert.Equal(HttpStatusCode.NoContent, putWith.StatusCode);

        var layout = await Client.GetFromJsonAsync<LayoutDto>(
            $"/api/gardens/{gardenId}/layout");
        Assert.Equal("S", layout!.Config.Orientation);
        Assert.Equal("indoor", layout.Config.GardenType);
        var slot = Assert.Single(layout.Config.LightSchedule!);
        Assert.Equal("08:00", slot.Start);
        Assert.Equal("12:30", slot.End);
        Assert.Equal("N", layout.Config.Hemisphere);
        Assert.Equal("mid", layout.Config.LatitudeBand);

        // PUT WITHOUT config afterwards -> stored config PRESERVED untouched
        // (the pre-5.3-B save dialog never sends it).
        var putWithout = await PutLayoutAsync(gardenId, config: null, width: 3);
        Assert.Equal(HttpStatusCode.NoContent, putWithout.StatusCode);

        var after = await Client.GetFromJsonAsync<LayoutDto>(
            $"/api/gardens/{gardenId}/layout");
        Assert.Equal(3, after!.Width);
        Assert.Equal("S", after.Config.Orientation);
        Assert.Equal("indoor", after.Config.GardenType);
        Assert.NotNull(after.Config.LightSchedule);
        Assert.Equal("N", after.Config.Hemisphere);
        Assert.Equal("mid", after.Config.LatitudeBand);
    }

    [Theory]
    [InlineData("X", "inground", null, null, "orientation")]
    [InlineData(null, "rooftop", null, null, "gardenType")]
    [InlineData(null, "balcony", "08:00", "12:00", "indoor")]
    [InlineData(null, "indoor", "8h00", "12:00", "HH:mm")]
    [InlineData(null, "indoor", "12:00", "12:00", "start < end")]
    public async Task Layout_InvalidConfig_Returns400(
        string? orientation,
        string? gardenType,
        string? slotStart,
        string? slotEnd,
        string expectedFragment)
    {
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);

        var lightSchedule = slotStart == null
            ? null
            : new[] { new { Start = slotStart, End = slotEnd } };
        var response = await PutLayoutAsync(gardenId, new
        {
            Orientation = orientation,
            GardenType = gardenType,
            LightSchedule = lightSchedule,
            Hemisphere = (string?)null,
            LatitudeBand = (string?)null,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains(expectedFragment, body);
    }

    [Fact]
    public async Task Layout_MoreThanSixLightSlots_Returns400()
    {
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);

        var slots = Enumerable.Range(8, 7)
            .Select(h => new { Start = $"{h:00}:00", End = $"{h:00}:30" })
            .ToArray();
        var response = await PutLayoutAsync(gardenId, new
        {
            Orientation = (string?)null,
            GardenType = "indoor",
            LightSchedule = slots,
            Hemisphere = (string?)null,
            LatitudeBand = (string?)null,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("at most 6", await response.Content.ReadAsStringAsync());
    }

    // ── SMA-17: config persisted on the GARDEN resource (PUT /gardens/{id}) ────
    // The config dialog persists through updateGarden, NOT the layout PUT — the
    // same ValidateConfig contract, exercised on the garden endpoint here.

    [Fact]
    public async Task UpdateGarden_ConfigRoundtrip_PersistsThenReturnsIt()
    {
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);

        var put = await UpdateGardenAsync(gardenId, "Renamed", ValidIndoorConfig());
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var updated = await put.Content.ReadFromJsonAsync<GardenResponseDto>();
        Assert.Equal("Renamed", updated!.Name);
        Assert.Equal("S", updated.Orientation);
        Assert.Equal("indoor", updated.GardenType);
        var slot = Assert.Single(updated.LightSchedule!);
        Assert.Equal("08:00", slot.Start);
        Assert.Equal("12:30", slot.End);
        Assert.Equal("N", updated.Hemisphere);
        Assert.Equal("mid", updated.LatitudeBand);

        // GET {id} serves the same persisted config back.
        var got = await Client.GetFromJsonAsync<GardenResponseDto>(
            $"/api/gardens/{gardenId}");
        Assert.Equal("S", got!.Orientation);
        Assert.Equal("indoor", got.GardenType);
        Assert.Single(got.LightSchedule!);
    }

    [Theory]
    [InlineData("X", "inground", null, null, "orientation")]
    [InlineData(null, "rooftop", null, null, "gardenType")]
    [InlineData(null, "balcony", "08:00", "12:00", "indoor")]
    [InlineData(null, "indoor", "8h00", "12:00", "HH:mm")]
    [InlineData(null, "indoor", "12:00", "12:00", "start < end")]
    public async Task UpdateGarden_InvalidConfig_Returns400(
        string? orientation,
        string? gardenType,
        string? slotStart,
        string? slotEnd,
        string expectedFragment)
    {
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);

        var lightSchedule = slotStart == null
            ? null
            : new[] { new { Start = slotStart, End = slotEnd } };
        var response = await UpdateGardenAsync(gardenId, "Test garden", new
        {
            Orientation = orientation,
            GardenType = gardenType,
            LightSchedule = lightSchedule,
            Hemisphere = (string?)null,
            LatitudeBand = (string?)null,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(expectedFragment, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UpdateGarden_MoreThanSixLightSlots_Returns400()
    {
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);

        var slots = Enumerable.Range(8, 7)
            .Select(h => new { Start = $"{h:00}:00", End = $"{h:00}:30" })
            .ToArray();
        var response = await UpdateGardenAsync(gardenId, "Test garden", new
        {
            Orientation = (string?)null,
            GardenType = "indoor",
            LightSchedule = slots,
            Hemisphere = (string?)null,
            LatitudeBand = (string?)null,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("at most 6", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UpdateGarden_OmittedConfig_PreservesExisting()
    {
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);

        // Establish config, then rename WITHOUT a config block.
        Assert.Equal(HttpStatusCode.OK,
            (await UpdateGardenAsync(gardenId, "First", ValidIndoorConfig())).StatusCode);

        var rename = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}",
            new { Name = "Renamed only", Description = (string?)null });
        Assert.Equal(HttpStatusCode.OK, rename.StatusCode);

        var got = await Client.GetFromJsonAsync<GardenResponseDto>(
            $"/api/gardens/{gardenId}");
        Assert.Equal("Renamed only", got!.Name);
        // The config-less update preserved every field — none nulled.
        Assert.Equal("S", got.Orientation);
        Assert.Equal("indoor", got.GardenType);
        Assert.NotNull(got.LightSchedule);
        Assert.Equal("N", got.Hemisphere);
        Assert.Equal("mid", got.LatitudeBand);
    }

    [Fact]
    public async Task UpdateGarden_NullLightScheduleElement_Returns400()
    {
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);

        // A null element in the array must be rejected via the 400 path, not
        // NRE on slot.Start/End (CR b62dbb77).
        var response = await UpdateGardenAsync(gardenId, "G", new
        {
            Orientation = (string?)null,
            GardenType = "indoor",
            LightSchedule = new object?[] { null },
            Hemisphere = (string?)null,
            LatitudeBand = (string?)null,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("HH:mm", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UpdateGarden_SwitchingAwayFromIndoor_ClearsLightSchedule()
    {
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);
        await UpdateGardenAsync(gardenId, "G", ValidIndoorConfig());

        // Re-send with a non-indoor type and no slots: the present-block
        // overwrite must clear the previously-stored lightSchedule (the exact
        // case a nested block handles and per-field flat nulls could not).
        var response = await UpdateGardenAsync(gardenId, "G", new
        {
            Orientation = "S",
            GardenType = "balcony",
            LightSchedule = (object?)null,
            Hemisphere = "N",
            LatitudeBand = "mid",
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var got = await Client.GetFromJsonAsync<GardenResponseDto>(
            $"/api/gardens/{gardenId}");
        Assert.Equal("balcony", got!.GardenType);
        Assert.Null(got.LightSchedule);
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

    private static object ValidIndoorConfig() => new
    {
        Orientation = "S",
        GardenType = "indoor",
        LightSchedule = new[] { new { Start = "08:00", End = "12:30" } },
        Hemisphere = "N",
        LatitudeBand = "mid",
    };

    private Task<HttpResponseMessage> PutLayoutAsync(
        Guid gardenId,
        object? config,
        int width = 2)
    {
        return Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", new
        {
            Width = width,
            Height = 2,
            CellSize = "50cm",
            CellsJson = (string?)null,
            Placements = Array.Empty<object>(),
            Config = config,
        });
    }

    private Task<HttpResponseMessage> UpdateGardenAsync(
        Guid gardenId,
        string name,
        object? config,
        string? description = null)
    {
        return Client.PutAsJsonAsync($"/api/gardens/{gardenId}", new
        {
            Name = name,
            Description = description,
            Config = config,
        });
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

    private record GardenResponseDto(
        Guid Id,
        string Name,
        string? Description,
        int? LayoutWidth,
        int? LayoutHeight,
        string? CellSize,
        string? Orientation,
        string? GardenType,
        List<SlotDto>? LightSchedule,
        string? Hemisphere,
        string? LatitudeBand);

    private record LayoutDto(
        int? Width,
        int? Height,
        string? CellSize,
        string? CellsJson,
        ConfigDto Config);

    private record ConfigDto(
        string? Orientation,
        string? GardenType,
        List<SlotDto>? LightSchedule,
        string? Hemisphere,
        string? LatitudeBand);

    private record SlotDto(string? Start, string? End);
}
