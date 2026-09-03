using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.Controllers.Admin;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-414 — Admin Dashboard v1 (read-only). Authorization (401 / 403 / 200),
/// exact counters after seeding real rows through <c>UserManager</c> and the
/// <c>DbContext</c>, sort + pagination + bounds, the D2 provider flags, and the
/// DTO whitelist lock: the users payload carries exactly the seven agreed keys
/// — never a hash, token, stamp, claim or phone number.
/// </summary>
public class AdminDashboardControllerTests : IntegrationTestBase
{
    public AdminDashboardControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string StatsUrl = "/api/admin/dashboard/stats";
    private const string UsersUrl = "/api/admin/dashboard/users";

    // Satisfies both the DTO's [MinLength(6)] and Identity's default password
    // policy (digit + lower + upper + non-alphanumeric).
    private const string ValidPassword = "Str0ng!Pass";

    // camelCase keys of AdminUserListItemResponse, ordinal order — the contract.
    private static readonly string[] UserWhitelist =
    [
        "createdAt",
        "displayName",
        "email",
        "emailConfirmed",
        "hasGoogleLogin",
        "hasPassword",
        "id",
    ];

    // ── Authorization ────────────────────────────────────────────────────────

    [Theory]
    [InlineData(StatsUrl)]
    [InlineData(UsersUrl)]
    public async Task Get_NoBearer_Returns401(string url)
    {
        var response = await Client.GetAsync(url);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(StatsUrl)]
    [InlineData(UsersUrl)]
    public async Task Get_AuthenticatedNonAdmin_Returns403(string url)
    {
        AuthAsNonAdmin();

        var response = await Client.GetAsync(url);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData(StatsUrl)]
    [InlineData(UsersUrl)]
    public async Task Get_Admin_Returns200(string url)
    {
        AuthAsAdmin();

        var response = await Client.GetAsync(url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // ── Stats ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Stats_EmptyDatabase_ReturnsZerosAndNoLatestGarden()
    {
        AuthAsAdmin();

        var stats = await Client.GetFromJsonAsync<AdminDashboardStatsResponse>(StatsUrl);

        Assert.NotNull(stats);
        Assert.Equal(0, stats!.TotalUsers);
        Assert.Equal(0, stats.NewUsersLast7Days);
        Assert.Equal(0, stats.NewUsersLast30Days);
        Assert.Equal(0, stats.GardensCount);
        Assert.Null(stats.LatestGardenCreatedAt);
        Assert.Equal(0, stats.PlacementsCount);
        Assert.Equal(0, stats.UsersWithAtLeastOneGarden);
    }

    [Fact]
    public async Task Stats_AfterSeeding_ReturnsExactCounters()
    {
        var now = DateTime.UtcNow;
        var fresh = await SeedUserAsync(createdAt: now.AddDays(-1));
        var recent = await SeedUserAsync(createdAt: now.AddDays(-10));
        await SeedUserAsync(createdAt: now.AddDays(-40));   // outside both windows
        await SeedUserAsync(createdAt: null);               // pre-migration: never counted in windows
        var latestGardenAt = now.AddHours(-2);
        var gardenA = await SeedGardenAsync(fresh, latestGardenAt);
        await SeedGardenAsync(fresh, now.AddDays(-3));      // same owner: counts once in "≥ 1 garden"
        var gardenC = await SeedGardenAsync(recent, now.AddDays(-5));
        var plantId = await SeedPlantAsync();
        await SeedPlacementsAsync(gardenA, plantId, 3);
        await SeedPlacementsAsync(gardenC, plantId, 2);
        AuthAsAdmin();

        var stats = await Client.GetFromJsonAsync<AdminDashboardStatsResponse>(StatsUrl);

        Assert.NotNull(stats);
        Assert.Equal(4, stats!.TotalUsers);
        Assert.Equal(1, stats.NewUsersLast7Days);
        Assert.Equal(2, stats.NewUsersLast30Days);
        Assert.Equal(3, stats.GardensCount);
        Assert.Equal(5, stats.PlacementsCount);
        Assert.Equal(2, stats.UsersWithAtLeastOneGarden);
        Assert.NotNull(stats.LatestGardenCreatedAt);
        Assert.InRange(
            stats.LatestGardenCreatedAt!.Value,
            latestGardenAt.AddSeconds(-1),
            latestGardenAt.AddSeconds(1));
    }

    // ── Users: sort, pagination, bounds ──────────────────────────────────────

    [Fact]
    public async Task Users_Default_SortsByCreatedAtDescendingNullsLastThenId()
    {
        var now = DateTime.UtcNow;
        var oldest = await SeedUserAsync(createdAt: now.AddDays(-30));
        var newest = await SeedUserAsync(createdAt: now.AddDays(-1));
        var middle = await SeedUserAsync(createdAt: now.AddDays(-10));
        // Two pre-migration accounts: ordered by Id among themselves, after
        // every stamped account (nulls LAST, not Postgres' DESC default).
        var legacyB = await SeedUserAsync(createdAt: null, id: "zz-legacy-b");
        var legacyA = await SeedUserAsync(createdAt: null, id: "zz-legacy-a");
        AuthAsAdmin();

        var page = await Client.GetFromJsonAsync<PagedResponse<AdminUserListItemResponse>>(UsersUrl);

        Assert.NotNull(page);
        Assert.Equal(1, page!.Page);
        Assert.Equal(AdminDashboardController.DefaultPageSize, page.PageSize);
        Assert.Equal(5, page.Total);
        Assert.Equal(
            new[] { newest, middle, oldest, legacyA, legacyB },
            page.Items.Select(i => i.Id).ToArray());
    }

    [Fact]
    public async Task Users_Page2WithPageSize2_ReturnsTheNextSliceAndTheFullTotal()
    {
        var now = DateTime.UtcNow;
        var ids = new List<string>();
        for (var i = 0; i < 5; i++)
        {
            ids.Add(await SeedUserAsync(createdAt: now.AddDays(-i)));   // ids[0] newest … ids[4] oldest
        }
        AuthAsAdmin();

        var page2 = await Client.GetFromJsonAsync<PagedResponse<AdminUserListItemResponse>>($"{UsersUrl}?page=2&pageSize=2");
        var page3 = await Client.GetFromJsonAsync<PagedResponse<AdminUserListItemResponse>>($"{UsersUrl}?page=3&pageSize=2");
        var page4 = await Client.GetFromJsonAsync<PagedResponse<AdminUserListItemResponse>>($"{UsersUrl}?page=4&pageSize=2");

        Assert.NotNull(page2);
        Assert.Equal(2, page2!.Page);
        Assert.Equal(2, page2.PageSize);
        Assert.Equal(5, page2.Total);
        Assert.Equal(new[] { ids[2], ids[3] }, page2.Items.Select(i => i.Id).ToArray());
        Assert.Equal(new[] { ids[4] }, page3!.Items.Select(i => i.Id).ToArray());
        Assert.Empty(page4!.Items);
        Assert.Equal(5, page4.Total);
    }

    [Theory]
    [InlineData("page=0")]
    [InlineData("page=-1")]
    [InlineData("pageSize=0")]
    [InlineData("pageSize=101")]
    public async Task Users_OutOfBounds_Returns400(string query)
    {
        AuthAsAdmin();

        var response = await Client.GetAsync($"{UsersUrl}?{query}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Users_PageSizeAtTheCeiling_IsAccepted()
    {
        AuthAsAdmin();

        var page = await Client.GetFromJsonAsync<PagedResponse<AdminUserListItemResponse>>(
            $"{UsersUrl}?page=1&pageSize={AdminDashboardController.MaxPageSize}");

        Assert.NotNull(page);
        Assert.Equal(AdminDashboardController.MaxPageSize, page!.PageSize);
    }

    // ── Users: row content (D1 / D2) ─────────────────────────────────────────

    [Fact]
    public async Task Users_Rows_CarryCreationConfirmationAndProviderFlags()
    {
        var now = DateTime.UtcNow;
        var local = await SeedUserAsync(createdAt: now, password: ValidPassword, displayName: "Local Only");
        var google = await SeedUserAsync(createdAt: now.AddMinutes(-1), confirmed: false);
        await AddLoginAsync(google, "Google");
        var both = await SeedUserAsync(createdAt: now.AddMinutes(-2), password: ValidPassword);
        await AddLoginAsync(both, "Google");
        var other = await SeedUserAsync(createdAt: now.AddMinutes(-3));
        await AddLoginAsync(other, "Facebook");
        var legacy = await SeedUserAsync(createdAt: null);
        AuthAsAdmin();

        var page = await Client.GetFromJsonAsync<PagedResponse<AdminUserListItemResponse>>(UsersUrl);
        var rows = page!.Items.ToDictionary(i => i.Id);

        Assert.Equal("Local Only", rows[local].DisplayName);
        Assert.NotNull(rows[local].Email);
        Assert.True(rows[local].EmailConfirmed);
        Assert.True(rows[local].HasPassword);
        Assert.False(rows[local].HasGoogleLogin);
        Assert.NotNull(rows[local].CreatedAt);

        Assert.False(rows[google].EmailConfirmed);
        Assert.False(rows[google].HasPassword);
        Assert.True(rows[google].HasGoogleLogin);

        Assert.True(rows[both].HasPassword);
        Assert.True(rows[both].HasGoogleLogin);

        Assert.False(rows[other].HasPassword);
        Assert.False(rows[other].HasGoogleLogin);   // only the Google provider counts (D2)

        Assert.Null(rows[legacy].CreatedAt);
    }

    [Fact]
    public async Task Users_Json_ExposesOnlyTheWhitelistedKeys()
    {
        await SeedUserAsync(createdAt: DateTime.UtcNow, password: ValidPassword, displayName: "Whitelisted");
        AuthAsAdmin();

        var json = await Client.GetStringAsync(UsersUrl);

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        Assert.Equal(
            new[] { "items", "page", "pageSize", "total" },
            root.EnumerateObject().Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray());
        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal(
            UserWhitelist,
            item.EnumerateObject().Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray());
        // Belt and braces, whatever the key casing: nothing secret-shaped anywhere.
        foreach (var forbidden in new[] { "passwordHash", "securityStamp", "concurrencyStamp", "phoneNumber", "normalizedEmail", "userName", "lockout", "twoFactor", "accessFailed" })
        {
            Assert.DoesNotContain(forbidden, json, StringComparison.OrdinalIgnoreCase);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void AuthAsAdmin() => SetBearer(Roles.Admin);

    private void AuthAsNonAdmin() => SetBearer();

    private void SetBearer(params string[] roles) =>
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken($"u-{Guid.NewGuid():N}", roles));

    private async Task<string> SeedUserAsync(
        DateTime? createdAt,
        string? id = null,
        string? password = null,
        bool confirmed = true,
        string? displayName = null)
    {
        using var scope = CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var email = $"admin-dash-{Guid.NewGuid():N}@example.com";
        var user = new ApplicationUser
        {
            Id = id ?? Guid.NewGuid().ToString(),
            UserName = email,
            Email = email,
            EmailConfirmed = confirmed,
            DisplayName = displayName,
            CreatedAt = createdAt,
        };
        var result = password is null
            ? await users.CreateAsync(user)
            : await users.CreateAsync(user, password);
        Assert.True(result.Succeeded, string.Join("; ", result.Errors.Select(e => e.Description)));
        return user.Id;
    }

    private async Task AddLoginAsync(string userId, string provider)
    {
        using var scope = CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByIdAsync(userId);
        Assert.NotNull(user);
        var result = await users.AddLoginAsync(
            user!, new UserLoginInfo(provider, $"key-{Guid.NewGuid():N}", provider));
        Assert.True(result.Succeeded, string.Join("; ", result.Errors.Select(e => e.Description)));
    }

    private async Task<Guid> SeedGardenAsync(string userId, DateTime createdAt)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = new Garden
        {
            Id = Guid.NewGuid(),
            Name = "Admin dashboard garden",
            UserId = userId,
            CreatedAt = createdAt,
        };
        db.Gardens.Add(garden);
        await db.SaveChangesAsync();
        return garden.Id;
    }

    private async Task<Guid> SeedPlantAsync()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = $"Hedera helix {Guid.NewGuid():N}",
            PlantTypeId = 1,
        };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    private async Task SeedPlacementsAsync(Guid gardenId, Guid plantId, int count)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        for (var row = 0; row < count; row++)
        {
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
        }
        await db.SaveChangesAsync();
    }
}
