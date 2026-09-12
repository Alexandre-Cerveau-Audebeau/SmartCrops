using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-336 PR 3a/5 — <c>PUT</c> / <c>DELETE /api/gardens/{id}/location</c>
/// and the location the garden endpoints now serve. What it pins: the six
/// columns written together with a fresh UTC stamp; the hemisphere and band
/// pre-filled ONLY where the garden had none (a hand-set « S » survives);
/// form validation before any write; ownership as 404, never 403;
/// <c>UpdatedAt</c> moving with the write; the clear that keeps the derived
/// exposure; and the effective location on <c>GET</c> — the garden's own,
/// else the profile's, with the source that says which.
/// </summary>
public class GardenLocationEndpointsTests : IntegrationTestBase
{
    public GardenLocationEndpointsTests(PostgresFixture fixture) : base(fixture) { }

    private static readonly object Lyon = new
    {
        name = "Lyon",
        region = "Auvergne-Rhône-Alpes",
        country = "France",
        latitude = 45.76,
        longitude = 4.84,
    };

    // ── PUT ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task PutLocation_StoresEveryColumn_StampsResolvedAt_AndPreFillsExposureWhenNull()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);
        var before = DateTime.UtcNow.AddSeconds(-1);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", Lyon);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var garden = await LoadGardenAsync(gardenId);
        Assert.Equal("Lyon", garden.LocationName);
        Assert.Equal("Auvergne-Rhône-Alpes", garden.LocationRegion);
        Assert.Equal("France", garden.LocationCountry);
        Assert.Equal(45.76, garden.Latitude);
        Assert.Equal(4.84, garden.Longitude);
        Assert.NotNull(garden.LocationResolvedAt);
        Assert.InRange(garden.LocationResolvedAt!.Value, before, DateTime.UtcNow.AddSeconds(1));
        Assert.Equal(DateTimeKind.Utc, garden.LocationResolvedAt.Value.Kind);
        // 45.76° north: the pre-fill the config dialog promised.
        Assert.Equal("N", garden.Hemisphere);
        Assert.Equal("mid", garden.LatitudeBand);
    }

    [Fact]
    public async Task PutLocation_KeepsHandSetHemisphereAndBand()
    {
        // A value the user set by hand is NEVER overwritten — a southern
        // hemisphere on a Lyon garden is wrong, and still theirs.
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: "S", band: "high");
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", Lyon);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var garden = await LoadGardenAsync(gardenId);
        Assert.Equal("S", garden.Hemisphere);
        Assert.Equal("high", garden.LatitudeBand);
        Assert.Equal("Lyon", garden.LocationName);
    }

    [Fact]
    public async Task PutLocation_PreFillsOnlyTheMissingHalf()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: "S", band: null);
        AuthAs(userId);

        await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", Lyon);

        var garden = await LoadGardenAsync(gardenId);
        Assert.Equal("S", garden.Hemisphere);
        Assert.Equal("mid", garden.LatitudeBand);
    }

    [Fact]
    public async Task PutLocation_TrimsText_AndStoresBlankOptionalsAsNull()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", new
        {
            name = "  Lyon  ",
            region = "   ",
            country = (string?)null,
            latitude = 45.76,
            longitude = 4.84,
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var garden = await LoadGardenAsync(gardenId);
        Assert.Equal("Lyon", garden.LocationName);
        Assert.Null(garden.LocationRegion);
        Assert.Null(garden.LocationCountry);
    }

    [Fact]
    public async Task PutLocation_ReplacesAPreviousLocationWhole()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);
        await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", Lyon);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", new
        {
            name = "Annecy",
            region = (string?)null,
            country = (string?)null,
            latitude = 45.9,
            longitude = 6.12,
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var garden = await LoadGardenAsync(gardenId);
        Assert.Equal("Annecy", garden.LocationName);
        // The previous region does not survive a whole replacement.
        Assert.Null(garden.LocationRegion);
        Assert.Equal(45.9, garden.Latitude);
    }

    [Theory]
    [InlineData(91.0, 4.84)]
    [InlineData(-90.01, 4.84)]
    [InlineData(45.76, 180.5)]
    [InlineData(45.76, -181.0)]
    public async Task PutLocation_OutOfRange_Returns400_AndStoresNothing(double latitude, double longitude)
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", new
        {
            name = "Nowhere",
            region = (string?)null,
            country = (string?)null,
            latitude,
            longitude,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var garden = await LoadGardenAsync(gardenId);
        Assert.Null(garden.LocationName);
        Assert.Null(garden.Latitude);
        Assert.Null(garden.Hemisphere);
    }

    [Fact]
    public async Task PutLocation_MissingName_Returns400()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", new
        {
            name = "",
            latitude = 45.76,
            longitude = 4.84,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PutLocation_NameTooLong_Returns400()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", new
        {
            name = new string('x', 121),
            latitude = 45.76,
            longitude = 4.84,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PutLocation_OtherUsersGarden_Returns404_NotForbidden()
    {
        var owner = await SeedUserAsync();
        var intruder = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(owner, hemisphere: null, band: null);
        AuthAs(intruder);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", Lyon);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null((await LoadGardenAsync(gardenId)).LocationName);
    }

    [Fact]
    public async Task PutLocation_UnknownGarden_Returns404()
    {
        AuthAs(await SeedUserAsync());

        var response = await Client.PutAsJsonAsync($"/api/gardens/{Guid.NewGuid()}/location", Lyon);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PutLocation_NoBearer_Returns401()
    {
        var response = await Client.PutAsJsonAsync($"/api/gardens/{Guid.NewGuid()}/location", Lyon);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PutLocation_BumpsUpdatedAt()
    {
        // Assumed, and pinned: a garden that learnt where it is reads as
        // « modified just now » — the location IS a change to the garden.
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null, updatedAt: DateTime.UtcNow.AddDays(-2));
        var before = (await LoadGardenAsync(gardenId)).UpdatedAt;
        AuthAs(userId);

        await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", Lyon);

        Assert.True((await LoadGardenAsync(gardenId)).UpdatedAt > before);
    }

    // ── DELETE ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task DeleteLocation_ClearsSixColumns_AndKeepsDerivedExposure()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);
        await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", Lyon);

        var response = await Client.DeleteAsync($"/api/gardens/{gardenId}/location");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var garden = await LoadGardenAsync(gardenId);
        Assert.Null(garden.LocationName);
        Assert.Null(garden.LocationRegion);
        Assert.Null(garden.LocationCountry);
        Assert.Null(garden.Latitude);
        Assert.Null(garden.Longitude);
        Assert.Null(garden.LocationResolvedAt);
        // Nothing can tell a pre-filled value from one the user confirmed.
        Assert.Equal("N", garden.Hemisphere);
        Assert.Equal("mid", garden.LatitudeBand);
    }

    [Fact]
    public async Task DeleteLocation_OnAGardenWithoutOne_IsNoContent()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);

        var response = await Client.DeleteAsync($"/api/gardens/{gardenId}/location");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task DeleteLocation_OtherUsersGarden_Returns404()
    {
        var owner = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(owner, hemisphere: null, band: null);
        AuthAs(owner);
        await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", Lyon);
        AuthAs(await SeedUserAsync());

        var response = await Client.DeleteAsync($"/api/gardens/{gardenId}/location");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Lyon", (await LoadGardenAsync(gardenId)).LocationName);
    }

    [Fact]
    public async Task DeleteLocation_NoBearer_Returns401()
    {
        var response = await Client.DeleteAsync($"/api/gardens/{Guid.NewGuid()}/location");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ── The effective location on GET / POST ─────────────────────────────────

    [Fact]
    public async Task GetGarden_NoLocationAnywhere_IsNullWithNullSource()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);

        var garden = await GetGardenAsync(gardenId);

        Assert.Equal(JsonValueKind.Null, garden.GetProperty("location").ValueKind);
        Assert.Equal(JsonValueKind.Null, garden.GetProperty("locationSource").ValueKind);
    }

    [Fact]
    public async Task GetGarden_OwnLocation_IsSourceGarden()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);
        await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", Lyon);

        var garden = await GetGardenAsync(gardenId);

        var location = garden.GetProperty("location");
        Assert.Equal("Lyon", location.GetProperty("name").GetString());
        Assert.Equal("Auvergne-Rhône-Alpes", location.GetProperty("region").GetString());
        Assert.Equal("France", location.GetProperty("country").GetString());
        Assert.Equal(45.76, location.GetProperty("latitude").GetDouble());
        Assert.Equal(4.84, location.GetProperty("longitude").GetDouble());
        Assert.NotEqual(JsonValueKind.Null, location.GetProperty("resolvedAt").ValueKind);
        Assert.Equal("garden", garden.GetProperty("locationSource").GetString());
    }

    [Fact]
    public async Task GetGarden_InheritsProfileDefault_AsSourceProfile()
    {
        var userId = await SeedUserAsync();
        await SetProfileLocationAsync(userId, "Annecy", 45.9, 6.12);
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);

        var garden = await GetGardenAsync(gardenId);

        Assert.Equal("Annecy", garden.GetProperty("location").GetProperty("name").GetString());
        Assert.Equal(45.9, garden.GetProperty("location").GetProperty("latitude").GetDouble());
        Assert.Equal("profile", garden.GetProperty("locationSource").GetString());
    }

    [Fact]
    public async Task GetGarden_OwnLocationWinsOverProfileDefault()
    {
        var userId = await SeedUserAsync();
        await SetProfileLocationAsync(userId, "Annecy", 45.9, 6.12);
        var gardenId = await SeedGardenAsync(userId, hemisphere: null, band: null);
        AuthAs(userId);
        await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/location", Lyon);

        var garden = await GetGardenAsync(gardenId);

        Assert.Equal("Lyon", garden.GetProperty("location").GetProperty("name").GetString());
        Assert.Equal("garden", garden.GetProperty("locationSource").GetString());

        // Clearing the override falls back to the default, not to nothing.
        await Client.DeleteAsync($"/api/gardens/{gardenId}/location");
        var after = await GetGardenAsync(gardenId);
        Assert.Equal("Annecy", after.GetProperty("location").GetProperty("name").GetString());
        Assert.Equal("profile", after.GetProperty("locationSource").GetString());
    }

    [Fact]
    public async Task CreateGarden_InheritsProfileDefault_InItsResponse()
    {
        // The reason for the model (ADR-0006): a garden created after the
        // default was set is located the moment it exists.
        var userId = await SeedUserAsync();
        await SetProfileLocationAsync(userId, "Annecy", 45.9, 6.12);
        AuthAs(userId);

        var response = await Client.PostAsJsonAsync("/api/gardens", new { name = "Nouveau", description = (string?)null });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Annecy", doc.RootElement.GetProperty("location").GetProperty("name").GetString());
        Assert.Equal("profile", doc.RootElement.GetProperty("locationSource").GetString());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void AuthAs(string userId)
    {
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }

    private async Task<JsonElement> GetGardenAsync(Guid gardenId)
    {
        var response = await Client.GetAsync($"/api/gardens/{gardenId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private async Task<Garden> LoadGardenAsync(Guid gardenId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        return await db.Gardens.AsNoTracking().SingleAsync(g => g.Id == gardenId);
    }

    private async Task SetProfileLocationAsync(string userId, string name, double latitude, double longitude)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"UPDATE ""AspNetUsers"" SET ""LocationName"" = {1}, ""Latitude"" = {2}, ""Longitude"" = {3},
                ""LocationResolvedAt"" = {4} WHERE ""Id"" = {0};",
            userId, name, latitude, longitude, DateTime.UtcNow);
    }

    private async Task<string> SeedUserAsync()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0);",
            userId);
        return userId;
    }

    private async Task<Guid> SeedGardenAsync(
        string userId,
        string? hemisphere,
        string? band,
        DateTime? updatedAt = null)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = new Garden
        {
            Id = Guid.NewGuid(),
            Name = "Terrasse",
            UserId = userId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = updatedAt ?? DateTime.UtcNow,
            Hemisphere = hemisphere,
            LatitudeBand = band,
        };
        db.Gardens.Add(garden);
        await db.SaveChangesAsync();
        return garden.Id;
    }
}
