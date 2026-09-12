using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-336 PR 3a/5 — <c>PUT</c> / <c>DELETE /api/auth/profile/location</c>,
/// the account's DEFAULT location. Besides the write and the clear, this file
/// pins decision Q2 in both directions: the location never touches
/// <c>City</c>, a profile update never touches the location, and the profile
/// response does not carry it — two resources, zero coupling.
///
/// <para>Users are registered through the API (not seeded by SQL): these
/// endpoints write through <c>UserManager.UpdateAsync</c>, whose validators
/// require the unique email a registration provides.</para>
/// </summary>
public class ProfileLocationEndpointsTests : IntegrationTestBase
{
    public ProfileLocationEndpointsTests(PostgresFixture fixture) : base(fixture) { }

    private const string Url = "/api/auth/profile/location";
    private const string ValidPassword = "Test-Pass1!";

    private static readonly object Lyon = new
    {
        name = "Lyon",
        region = "Auvergne-Rhône-Alpes",
        country = "France",
        latitude = 45.76,
        longitude = 4.84,
    };

    [Fact]
    public async Task PutProfileLocation_StoresOnTheAccount_AndLeavesCityUntouched()
    {
        var userId = await RegisterAsync();
        AuthAs(userId);
        await Client.PutAsJsonAsync("/api/auth/profile", new { city = "Marseille" });
        var before = DateTime.UtcNow.AddSeconds(-1);

        var response = await Client.PutAsJsonAsync(Url, Lyon);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var user = await LoadUserAsync(userId);
        Assert.Equal("Lyon", user.LocationName);
        Assert.Equal("Auvergne-Rhône-Alpes", user.LocationRegion);
        Assert.Equal("France", user.LocationCountry);
        Assert.Equal(45.76, user.Latitude);
        Assert.Equal(4.84, user.Longitude);
        Assert.NotNull(user.LocationResolvedAt);
        Assert.InRange(user.LocationResolvedAt!.Value, before, DateTime.UtcNow.AddSeconds(1));
        // Q2: the free-text city is another resource.
        Assert.Equal("Marseille", user.City);
    }

    [Fact]
    public async Task UpdateProfile_ChangingCity_LeavesTheLocationIntact()
    {
        var userId = await RegisterAsync();
        AuthAs(userId);
        await Client.PutAsJsonAsync(Url, Lyon);

        var response = await Client.PutAsJsonAsync("/api/auth/profile", new { city = "Paris" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var user = await LoadUserAsync(userId);
        Assert.Equal("Paris", user.City);
        Assert.Equal("Lyon", user.LocationName);
        Assert.Equal(45.76, user.Latitude);
    }

    [Fact]
    public async Task GetProfile_DoesNotCarryTheLocation()
    {
        // The profile response is untouched (Q2): the dashboard reads the
        // location through the garden and weather endpoints.
        var userId = await RegisterAsync();
        AuthAs(userId);
        await Client.PutAsJsonAsync(Url, Lyon);

        var response = await Client.GetAsync("/api/auth/profile");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var keys = doc.RootElement.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToList();
        Assert.Equal(["city", "displayName", "email", "firstName", "hasPassword", "lastName"], keys);
    }

    [Theory]
    [InlineData(90.5, 4.84)]
    [InlineData(45.76, -180.5)]
    public async Task PutProfileLocation_OutOfRange_Returns400_AndStoresNothing(double latitude, double longitude)
    {
        var userId = await RegisterAsync();
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync(Url, new
        {
            name = "Nowhere",
            latitude,
            longitude,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null((await LoadUserAsync(userId)).LocationName);
    }

    [Fact]
    public async Task PutProfileLocation_MissingName_Returns400()
    {
        var userId = await RegisterAsync();
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync(Url, new { latitude = 45.76, longitude = 4.84 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task DeleteProfileLocation_ClearsSixColumns()
    {
        var userId = await RegisterAsync();
        AuthAs(userId);
        await Client.PutAsJsonAsync(Url, Lyon);

        var response = await Client.DeleteAsync(Url);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var user = await LoadUserAsync(userId);
        Assert.Null(user.LocationName);
        Assert.Null(user.LocationRegion);
        Assert.Null(user.LocationCountry);
        Assert.Null(user.Latitude);
        Assert.Null(user.Longitude);
        Assert.Null(user.LocationResolvedAt);
    }

    [Fact]
    public async Task PutProfileLocation_NoBearer_Returns401()
    {
        var response = await Client.PutAsJsonAsync(Url, Lyon);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteProfileLocation_NoBearer_Returns401()
    {
        var response = await Client.DeleteAsync(Url);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void AuthAs(string userId) =>
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));

    private async Task<string> RegisterAsync()
    {
        var email = $"location-{Guid.NewGuid():N}@example.com";
        var response = await Client.PostAsJsonAsync("/api/auth/register", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        using var scope = CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email);
        Assert.NotNull(user);
        return user!.Id;
    }

    private async Task<ApplicationUser> LoadUserAsync(string userId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        return await db.Users.AsNoTracking().SingleAsync(u => u.Id == userId);
    }
}
