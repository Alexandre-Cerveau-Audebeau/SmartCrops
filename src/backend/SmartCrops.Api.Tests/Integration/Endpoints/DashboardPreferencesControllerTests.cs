using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Dashboard;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-336 (PR 1/5) — the dashboard preferences endpoints. Covers the five cases
/// the shell depends on: anonymous is refused, a user who never saved reads the
/// level preset, a save round-trips, an invalid document is refused, and a
/// document stored under a schema version this server does not know degrades to
/// the preset instead of failing.
/// </summary>
public class DashboardPreferencesControllerTests : IntegrationTestBase
{
    public DashboardPreferencesControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string Url = "/api/dashboard/preferences";

    // camelCase keys of DashboardPreferencesResponse, ordinal order — the contract
    // the frontend binds to.
    private static readonly string[] ResponseWhitelist =
    [
        "blocks",
        "isPreset",
        "level",
        "schemaVersion",
        "updatedAt",
    ];

    private static readonly string[] BlockWhitelist =
    [
        "hidden",
        "key",
        "options",
        "size",
    ];

    // ── Authorization ────────────────────────────────────────────────────────

    [Fact]
    public async Task GetPreferences_NoBearer_Returns401()
    {
        var response = await Client.GetAsync(Url);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PutPreferences_NoBearer_Returns401()
    {
        var response = await Client.PutAsJsonAsync(Url, ValidRequest());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ── Preset fallback ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetPreferences_NoStoredLayout_ReturnsGardenerPreset()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var response = await Client.GetAsync(Url);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<DashboardPreferencesResponse>();

        Assert.NotNull(body);
        Assert.True(body.IsPreset);
        Assert.Equal(DashboardLayout.Levels.Gardener, body.Level);
        Assert.Equal(DashboardLayout.CurrentSchemaVersion, body.SchemaVersion);
        Assert.Null(body.UpdatedAt);

        // The preset lists all eight blocks, in canonical order, hidden ones
        // included — the Customize gallery reads them from here.
        Assert.Equal(DashboardLayout.Blocks.All, body.Blocks.Select(b => b.Key).ToList());

        // Gardener: gardens large, stats and harvest hidden (frozen design § 8).
        Assert.Equal(DashboardLayout.Sizes.Large, Block(body, DashboardLayout.Blocks.Gardens).Size);
        Assert.False(Block(body, DashboardLayout.Blocks.Gardens).Hidden);
        Assert.True(Block(body, DashboardLayout.Blocks.Stats).Hidden);
        Assert.True(Block(body, DashboardLayout.Blocks.Harvest).Hidden);
    }

    [Fact]
    public async Task GetPreferences_ResponseCarriesExactlyTheWhitelistedKeys()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var json = await Client.GetStringAsync(Url);
        using var document = JsonDocument.Parse(json);

        var keys = document.RootElement.EnumerateObject().Select(p => p.Name).OrderBy(k => k, StringComparer.Ordinal);
        Assert.Equal(ResponseWhitelist, keys);

        var blockKeys = document.RootElement.GetProperty("blocks")[0]
            .EnumerateObject().Select(p => p.Name).OrderBy(k => k, StringComparer.Ordinal);
        Assert.Equal(BlockWhitelist, blockKeys);
    }

    // ── Round-trip ───────────────────────────────────────────────────────────

    [Fact]
    public async Task PutThenGetPreferences_ReturnsWhatWasSaved()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        // Expert level, gardens moved first and shrunk, harvest hidden.
        var saved = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Expert,
            [
                new(DashboardLayout.Blocks.Gardens, DashboardLayout.Sizes.Medium, false, null),
                new(DashboardLayout.Blocks.Weather, DashboardLayout.Sizes.Large, false, null),
                new(DashboardLayout.Blocks.Tips, DashboardLayout.Sizes.Small, false, null),
                new(DashboardLayout.Blocks.Month, DashboardLayout.Sizes.Small, false, null),
                new(DashboardLayout.Blocks.Todo, DashboardLayout.Sizes.Medium, false, null),
                new(DashboardLayout.Blocks.Counters, DashboardLayout.Sizes.Medium, false, null),
                new(DashboardLayout.Blocks.Stats, DashboardLayout.Sizes.Large, false, null),
                new(DashboardLayout.Blocks.Harvest, DashboardLayout.Sizes.Large, true, null),
            ]);

        var put = await Client.PutAsJsonAsync(Url, saved);
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);

        Assert.NotNull(body);
        Assert.False(body.IsPreset);
        Assert.Equal(DashboardLayout.Levels.Expert, body.Level);
        Assert.NotNull(body.UpdatedAt);
        Assert.Equal(
            saved.Blocks.Select(b => b.Key).ToList(),
            body.Blocks.Select(b => b.Key).ToList());
        Assert.Equal(DashboardLayout.Sizes.Medium, Block(body, DashboardLayout.Blocks.Gardens).Size);
        Assert.Equal(DashboardLayout.Sizes.Large, Block(body, DashboardLayout.Blocks.Weather).Size);
        Assert.True(Block(body, DashboardLayout.Blocks.Harvest).Hidden);
    }

    [Fact]
    public async Task PutPreferences_Twice_ReplacesRatherThanDuplicates()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        await Client.PutAsJsonAsync(Url, ValidRequest(DashboardLayout.Levels.Novice));
        await Client.PutAsJsonAsync(Url, ValidRequest(DashboardLayout.Levels.Expert));

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var rows = await db.UserDashboardPreferences.Where(p => p.UserId == userId).ToListAsync();

        Assert.Single(rows);

        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);
        Assert.Equal(DashboardLayout.Levels.Expert, body!.Level);
    }

    [Fact]
    public async Task GetPreferences_NeverLeaksAnotherUsersLayout()
    {
        var mine = Guid.NewGuid().ToString();
        var theirs = Guid.NewGuid().ToString();
        await SeedUserAsync(mine);
        await SeedUserAsync(theirs);

        AuthAs(theirs);
        await Client.PutAsJsonAsync(Url, ValidRequest(DashboardLayout.Levels.Novice));

        AuthAs(mine);
        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);

        Assert.True(body!.IsPreset);
        Assert.Equal(DashboardLayout.Levels.Gardener, body.Level);
    }

    // ── Rejected documents ───────────────────────────────────────────────────

    [Theory]
    [InlineData("wizard", DashboardLayout.Blocks.Weather, DashboardLayout.Sizes.Medium, false)]
    [InlineData(DashboardLayout.Levels.Novice, "compost", DashboardLayout.Sizes.Medium, false)]
    [InlineData(DashboardLayout.Levels.Novice, DashboardLayout.Blocks.Weather, "huge", false)]
    [InlineData(DashboardLayout.Levels.Novice, DashboardLayout.Blocks.Gardens, DashboardLayout.Sizes.Medium, true)]
    public async Task PutPreferences_InvalidDocument_Returns400(
        string level, string key, string size, bool hidden)
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var request = new SaveDashboardPreferencesRequest(level, [new(key, size, hidden, null)]);

        var response = await Client.PutAsJsonAsync(Url, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PutPreferences_DuplicateBlock_Returns400()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var request = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Novice,
            [
                new(DashboardLayout.Blocks.Weather, DashboardLayout.Sizes.Medium, false, null),
                new(DashboardLayout.Blocks.Weather, DashboardLayout.Sizes.Small, false, null),
            ]);

        var response = await Client.PutAsJsonAsync(Url, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PutPreferences_EmptyBlocks_Returns400()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var request = new SaveDashboardPreferencesRequest(DashboardLayout.Levels.Novice, []);

        var response = await Client.PutAsJsonAsync(Url, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PutPreferences_RejectedDocument_WritesNothing()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        await Client.PutAsJsonAsync(
            Url,
            new SaveDashboardPreferencesRequest("wizard", [new(DashboardLayout.Blocks.Weather, DashboardLayout.Sizes.Medium, false, null)]));

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        Assert.False(await db.UserDashboardPreferences.AnyAsync(p => p.UserId == userId));
    }

    // ── Forward compatibility ────────────────────────────────────────────────

    [Fact]
    public async Task GetPreferences_UnknownSchemaVersion_FallsBackToPresetWithoutError()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        // A layout written by a future version of the app: valid jsonb, a shape
        // this server has never seen, and a version it does not know.
        await InsertRawLayoutAsync(
            userId,
            DashboardLayout.CurrentSchemaVersion + 41,
            """{"schemaVersion":42,"level":"archdruid","panels":[{"id":"moon-phase"}]}""");

        var response = await Client.GetAsync(Url);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<DashboardPreferencesResponse>();

        Assert.NotNull(body);
        Assert.True(body.IsPreset);
        Assert.Equal(DashboardLayout.Levels.Gardener, body.Level);
        Assert.Equal(DashboardLayout.CurrentSchemaVersion, body.SchemaVersion);
        Assert.Equal(DashboardLayout.Blocks.All, body.Blocks.Select(b => b.Key).ToList());
    }

    [Fact]
    public async Task GetPreferences_LayoutMissingABlock_FillsItFromThePreset()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        // A layout saved before a block existed: only two blocks, current version.
        await InsertRawLayoutAsync(
            userId,
            DashboardLayout.CurrentSchemaVersion,
            """
            {"schemaVersion":1,"level":"novice","blocks":[
              {"key":"gardens","size":"small","hidden":false,"options":null},
              {"key":"weather","size":"small","hidden":false,"options":null}]}
            """);

        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);

        Assert.NotNull(body);
        Assert.False(body.IsPreset);
        Assert.Equal(DashboardLayout.Levels.Novice, body.Level);

        // The two stored blocks keep their stored order and size; the six others
        // arrive behind them with their preset values.
        Assert.Equal(DashboardLayout.Blocks.Gardens, body.Blocks[0].Key);
        Assert.Equal(DashboardLayout.Blocks.Weather, body.Blocks[1].Key);
        Assert.Equal(DashboardLayout.Sizes.Small, body.Blocks[0].Size);
        Assert.Equal(DashboardLayout.Blocks.All.Count, body.Blocks.Count);
        Assert.True(Block(body, DashboardLayout.Blocks.Stats).Hidden);
    }

    [Fact]
    public async Task GetPreferences_LayoutHidingGardens_IsIgnoredOnRead()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        // The write path refuses this; a row that predates the rule must not be
        // able to hide the gardens block either.
        await InsertRawLayoutAsync(
            userId,
            DashboardLayout.CurrentSchemaVersion,
            """
            {"schemaVersion":1,"level":"gardener","blocks":[
              {"key":"gardens","size":"large","hidden":true,"options":null}]}
            """);

        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);

        Assert.False(Block(body!, DashboardLayout.Blocks.Gardens).Hidden);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static DashboardBlockDto Block(DashboardPreferencesResponse body, string key) =>
        body.Blocks.Single(b => b.Key == key);

    private static SaveDashboardPreferencesRequest ValidRequest(string? level = null) =>
        new(level ?? DashboardLayout.Levels.Gardener,
            [.. DashboardPresets.For(level ?? DashboardLayout.Levels.Gardener)
                .Select(b => new SaveDashboardBlockRequest(b.Key, b.Size, b.Hidden, null))]);

    private void AuthAs(string userId)
    {
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
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

    /// <summary>
    /// Writes a layout straight to the table, bypassing the API's validation —
    /// the only way to stage a document this server would never have written.
    /// </summary>
    private async Task InsertRawLayoutAsync(string userId, int schemaVersion, string layoutJson)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""UserDashboardPreferences""
                (""Id"", ""UserId"", ""LayoutJson"", ""SchemaVersion"", ""UpdatedAt"")
              VALUES ({0}, {1}, CAST({2} AS jsonb), {3}, CURRENT_TIMESTAMP);",
            Guid.NewGuid(), userId, layoutJson, schemaVersion);
    }
}
