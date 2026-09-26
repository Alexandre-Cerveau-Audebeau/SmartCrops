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

        // The preset lists every block of the Gardener — its seven widgets, in
        // canonical order, hidden ones included; never the Key figures band,
        // the Expert's alone (SMA-437, pre-flight D4), and since the formulas
        // never Statistics either (SMA-448, lot F1 — R1, V3-01). The Customize
        // gallery reads them from here.
        Assert.Equal(GardenerKeys, body.Blocks.Select(b => b.Key).ToList());
        Assert.DoesNotContain("keyfigures", body.Blocks.Select(b => b.Key));
        Assert.DoesNotContain(DashboardLayout.Blocks.Stats, body.Blocks.Select(b => b.Key));

        // Gardener: gardens large, harvest hidden (frozen design § 8).
        Assert.Equal(DashboardLayout.Sizes.Large, Block(body, DashboardLayout.Blocks.Gardens).Size);
        Assert.False(Block(body, DashboardLayout.Blocks.Gardens).Hidden);
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

        // Expert level, gardens moved first and shrunk, harvest hidden — and the
        // Key figures band, which every Expert layout carries since SMA-437 lot 1
        // (PR B, step B1), moved from the head to the third place: once stored,
        // its place is the user's, never the preset's.
        var saved = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Expert,
            [
                new(DashboardLayout.Blocks.Gardens, DashboardLayout.Sizes.Medium, false, null),
                new(DashboardLayout.Blocks.Weather, DashboardLayout.Sizes.Large, false, null),
                new(DashboardLayout.Blocks.KeyFigures, DashboardLayout.Sizes.Wide, false, null),
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
        Assert.Equal(GardenerKeys, body.Blocks.Select(b => b.Key).ToList());
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
        // arrive at their preset places — here, behind them — with their preset
        // values.
        Assert.Equal(DashboardLayout.Blocks.Gardens, body.Blocks[0].Key);
        Assert.Equal(DashboardLayout.Blocks.Weather, body.Blocks[1].Key);
        Assert.Equal(DashboardLayout.Sizes.Small, body.Blocks[0].Size);
        Assert.Equal(DashboardPresets.For(DashboardLayout.Levels.Novice).Count, body.Blocks.Count);
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

    [Fact]
    public async Task GetPreferences_LayoutWithNullBlockEntry_FallsBackWithoutError()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        // `"blocks":[null]` is valid jsonb. Nullable annotations are not runtime
        // checks, so it deserializes to a list holding a null; before round 1
        // Merge dereferenced it and the read answered 500 (E3).
        await InsertRawLayoutAsync(
            userId,
            DashboardLayout.CurrentSchemaVersion,
            """{"schemaVersion":1,"level":"gardener","blocks":[null]}""");

        var response = await Client.GetAsync(Url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<DashboardPreferencesResponse>();
        Assert.NotNull(body);
        // The document parsed and its level survived, so this is not the
        // "unreadable" path: the blocks are simply all filled from the preset.
        Assert.False(body.IsPreset);
        Assert.Equal(DashboardLayout.Levels.Gardener, body.Level);
        Assert.Equal(GardenerKeys, body.Blocks.Select(b => b.Key).ToList());
    }

    [Fact]
    public async Task GetPreferences_LayoutWithNullAmongRealBlocks_KeepsTheRealOnes()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        await InsertRawLayoutAsync(
            userId,
            DashboardLayout.CurrentSchemaVersion,
            """
            {"schemaVersion":1,"level":"gardener","blocks":[
              null,
              {"key":"tips","size":"small","hidden":false,"options":null},
              null]}
            """);

        var response = await Client.GetAsync(Url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<DashboardPreferencesResponse>();
        Assert.NotNull(body);
        // The one real block keeps its stored size; the seven the document
        // omits arrive at their preset places around it (SMA-437 lot 1, PR B,
        // arbitrage 3 — « à la place du preset », no longer at the end), so
        // Weather and Gardens come back before it, where the Gardener preset
        // puts them, and it keeps its own preset place, the third.
        Assert.Equal(GardenerKeys, body.Blocks.Select(b => b.Key).ToList());
        Assert.Equal(DashboardLayout.Sizes.Small, Block(body, DashboardLayout.Blocks.Tips).Size);
        Assert.Equal(DashboardPresets.For(DashboardLayout.Levels.Gardener).Count, body.Blocks.Count);
    }

    // ── Sizes per formula (SMA-437 lot 1, PR A, step A5 — pre-flight D4) ─────

    /// <summary>
    /// <c>wide</c> is a size this server knows (the fourth, V8), and no block
    /// may take it yet at any formula: a crafted PUT must not be able to show a
    /// widget's Large stretched over the page's width. Strict on write.
    /// </summary>
    [Theory]
    [InlineData(DashboardLayout.Levels.Expert)]
    [InlineData(DashboardLayout.Levels.Gardener)]
    [InlineData(DashboardLayout.Levels.Novice)]
    public async Task PutPreferences_SizeTheFormulaDoesNotPermit_Returns400(string level)
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var request = new SaveDashboardPreferencesRequest(
            level,
            [.. DashboardPresets.For(level).Select(b => new SaveDashboardBlockRequest(
                b.Key,
                b.Key == DashboardLayout.Blocks.Weather ? DashboardLayout.Sizes.Wide : b.Size,
                b.Hidden,
                null))]);

        var response = await Client.PutAsJsonAsync(Url, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertNothingStoredAsync(userId);
    }

    /// <summary>
    /// A stored size the formula does not permit — a row written by hand, or by
    /// a future version — is brought back to the preset's size on read, in
    /// place: the block keeps its position and never disappears. Forgiving on
    /// read.
    /// </summary>
    [Fact]
    public async Task GetPreferences_StoredSizeTheFormulaDoesNotPermit_FallsBackToThePresetSize()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        await InsertRawLayoutAsync(
            userId,
            DashboardLayout.CurrentSchemaVersion,
            """
            {"schemaVersion":1,"level":"gardener","blocks":[
              {"key":"weather","size":"wide","hidden":false,"options":null},
              {"key":"gardens","size":"small","hidden":false,"options":null}]}
            """);

        var response = await Client.GetAsync(Url);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<DashboardPreferencesResponse>();

        Assert.NotNull(body);
        Assert.Equal(DashboardLayout.Blocks.Weather, body.Blocks[0].Key);
        // The Gardener preset's Weather size.
        Assert.Equal(DashboardLayout.Sizes.Medium, body.Blocks[0].Size);
        Assert.Equal(DashboardLayout.Sizes.Small, Block(body, DashboardLayout.Blocks.Gardens).Size);
    }

    // ── The Key figures band (SMA-437 lot 1, PR B, step B1) ──────────────────
    // Pre-flight D4 and D8, and arbitrage 3 (23/09): the band is the Expert's
    // alone, heads its preset in the Full width — its one size — and an Expert
    // who saved a layout before it existed receives it at the head, visible,
    // without the chip turning « · ajustée ». Literals for the band's key and
    // size on purpose: they are the wire contract.

    [Fact]
    public async Task PutPreferences_ExpertWithTheBandInFullWidth_IsStored_AndReadFirst()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var request = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Expert,
            [
                new("keyfigures", "wide", false, null),
                .. EightWidgets.Select(key => new SaveDashboardBlockRequest(key, "large", false, null)),
            ]);

        var put = await Client.PutAsJsonAsync(Url, request);
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);
        Assert.NotNull(body);
        Assert.Equal(("keyfigures", "wide", false), (body.Blocks[0].Key, body.Blocks[0].Size, body.Blocks[0].Hidden));
        Assert.Equal(9, body.Blocks.Count);
    }

    /// <summary>R8: the Gardener has no band — refused on the server, not only absent from its interface.</summary>
    [Fact]
    public async Task PutPreferences_GardenerWithTheBand_Returns400_NamingTheLevel()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var request = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Gardener,
            [
                new("keyfigures", "wide", false, null),
                new(DashboardLayout.Blocks.Weather, DashboardLayout.Sizes.Medium, false, null),
            ]);

        var response = await Client.PutAsJsonAsync(Url, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("block 'keyfigures' is not available at level 'gardener'", await response.Content.ReadAsStringAsync());
        await AssertNothingStoredAsync(userId);
    }

    // ── The widgets of a formula (SMA-448, lot F1 — R1) ──────────────────────

    /// <summary>
    /// R1 and R8 (V3-01: « Les statistiques — Non · Non · Oui »): Statistics is
    /// not the Gardener's, so a Gardener SHOWING it is refused on the server,
    /// not only absent from its gallery.
    /// </summary>
    [Fact]
    public async Task PutPreferences_GardenerShowingStatistics_Returns400_NamingTheLevel()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var request = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Gardener,
            [
                new(DashboardLayout.Blocks.Gardens, DashboardLayout.Sizes.Large, false, null),
                new(DashboardLayout.Blocks.Stats, DashboardLayout.Sizes.Large, false, null),
            ]);

        var response = await Client.PutAsJsonAsync(Url, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("block 'stats' is not available at level 'gardener'", await response.Content.ReadAsStringAsync());
        await AssertNothingStoredAsync(userId);
    }

    /// <summary>
    /// A tab opened before the formulas carries the Gardener preset of its
    /// time — Statistics included, HIDDEN (pre-flight § C.7.3, the window of
    /// the old client). A hidden block the formula does not have shows nothing
    /// and grants nothing: it is dropped, not refused, so that tab keeps
    /// saving — and it is never stored.
    /// </summary>
    [Fact]
    public async Task PutPreferences_GardenerTabCarryingStatisticsHidden_IsAccepted_AndStoresNoStatistics()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var request = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Gardener,
            [
                new(DashboardLayout.Blocks.Weather, DashboardLayout.Sizes.Medium, false, null),
                new(DashboardLayout.Blocks.Gardens, DashboardLayout.Sizes.Large, false, null),
                new(DashboardLayout.Blocks.Stats, DashboardLayout.Sizes.Large, true, null),
            ]);

        var put = await Client.PutAsJsonAsync(Url, request);
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var stored = await db.UserDashboardPreferences.AsNoTracking().SingleAsync(p => p.UserId == userId);
        Assert.DoesNotContain("\"stats\"", stored.LayoutJson);

        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);
        Assert.NotNull(body);
        Assert.DoesNotContain(DashboardLayout.Blocks.Stats, body.Blocks.Select(b => b.Key));
    }

    /// <summary>The band's one size is the Full width: a Large band is refused even at the Expert level.</summary>
    [Fact]
    public async Task PutPreferences_ExpertBandInLarge_Returns400_NamingTheSize()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var request = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Expert,
            [new("keyfigures", "large", false, null)]);

        var response = await Client.PutAsJsonAsync(Url, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("size 'large' is not available for block 'keyfigures' at level 'expert'", await response.Content.ReadAsStringAsync());
        await AssertNothingStoredAsync(userId);
    }

    /// <summary>
    /// A client of eight blocks — a tab opened before the band, the other half of
    /// a rolling deploy (pre-flight risk 4) — is accepted, and the band comes back
    /// from the preset on the next read, at the head.
    /// </summary>
    [Fact]
    public async Task PutPreferences_ExpertClientOfEightBlocks_IsAccepted_AndTheBandComesBackFirst()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var request = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Expert,
            [.. EightWidgets.Select(key => new SaveDashboardBlockRequest(key, "large", false, null))]);

        var put = await Client.PutAsJsonAsync(Url, request);
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);
        Assert.NotNull(body);
        Assert.Equal(("keyfigures", "wide", false), (body.Blocks[0].Key, body.Blocks[0].Size, body.Blocks[0].Hidden));
    }

    /// <summary>
    /// A stored layout of a level without the band — written by hand, since no
    /// write path can produce it — is read WITHOUT it, even with a size the
    /// server could not resolve: <c>Merge</c> drops a block the level does not
    /// permit BEFORE it looks for a fallback size in the preset, which has none
    /// for it (pre-flight C.3, « un piège de lecture à désamorcer »). Forgiving
    /// on read: 200, never 500.
    /// </summary>
    [Fact]
    public async Task GetPreferences_StoredGardenerLayoutWithTheBand_Returns200_WithoutIt()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        await InsertRawLayoutAsync(
            userId,
            DashboardLayout.CurrentSchemaVersion,
            """
            {"schemaVersion":1,"level":"gardener","blocks":[
              {"key":"keyfigures","size":"huge","hidden":false,"options":null},
              {"key":"weather","size":"medium","hidden":false,"options":null},
              {"key":"gardens","size":"large","hidden":false,"options":null}]}
            """);

        var response = await Client.GetAsync(Url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<DashboardPreferencesResponse>();
        Assert.NotNull(body);
        Assert.Equal(GardenerKeys, body.Blocks.Select(b => b.Key).ToList());
    }

    /// <summary>
    /// Arbitrage 3 — THE case: an Expert who saved the eight-widget preset before
    /// this PR. The band arrives at the head, visible, in the Full width — and the
    /// layout read back IS the Expert preset, block for block (key, size,
    /// visibility, in order: what <c>isAdjusted</c> compares), so the chip does
    /// not turn « · ajustée » for a change the user did not make. It used to
    /// arrive at the END: a band at the foot of the page, and the chip adjusted.
    /// </summary>
    [Fact]
    public async Task GetPreferences_ExpertLayoutSavedBeforeTheBand_ReceivesItFirst_AndReadsAsThePreset()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        await InsertRawLayoutAsync(
            userId,
            DashboardLayout.CurrentSchemaVersion,
            StoredExpertLayout(EightWidgets.Select(key => (key, "large", false))));

        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);

        Assert.NotNull(body);
        Assert.False(body.IsPreset);
        Assert.Equal(("keyfigures", "wide", false), (body.Blocks[0].Key, body.Blocks[0].Size, body.Blocks[0].Hidden));
        Assert.Equal(
            DashboardPresets.For(DashboardLayout.Levels.Expert).Select(b => (b.Key, b.Size, b.Hidden)),
            body.Blocks.Select(b => (b.Key, b.Size, b.Hidden)));
    }

    /// <summary>
    /// The same, on a layout the user HAD rearranged — Gardens first and Medium,
    /// Tips Small, Harvest hidden: the band still takes the head, visible;
    /// everything the user arranged stays as they left it, behind it.
    /// </summary>
    [Fact]
    public async Task GetPreferences_RearrangedExpertLayoutSavedBeforeTheBand_ReceivesItFirst_KeepingTheRest()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        (string Key, string Size, bool Hidden)[] stored =
        [
            ("gardens", "medium", false),
            ("weather", "large", false),
            ("tips", "small", false),
            ("month", "large", false),
            ("todo", "large", false),
            ("counters", "large", false),
            ("stats", "large", false),
            ("harvest", "large", true),
        ];
        await InsertRawLayoutAsync(userId, DashboardLayout.CurrentSchemaVersion, StoredExpertLayout(stored));

        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);

        Assert.NotNull(body);
        var expected = new List<(string Key, string Size, bool Hidden)> { ("keyfigures", "wide", false) };
        expected.AddRange(stored);
        Assert.Equal(expected, body.Blocks.Select(b => (b.Key, b.Size, b.Hidden)));
    }

    // ── The band's four figures (SMA-437 lot 1, PR B, step B2) ───────────────
    // Pre-flight D9: `figures`, when present on the band's options, is four
    // DISTINCT strings taken from the 22 of V3-04, or the write is refused —
    // strict on write; on read the document passes as stored and the client
    // falls back to the four defaults.

    [Theory]
    [InlineData("""["free","occupancy","varieties"]""")]
    [InlineData("""["free","occupancy","varieties","todo","tips"]""")]
    [InlineData("""["free","free","varieties","todo"]""")]
    [InlineData("""["free","occupancy","compost","todo"]""")]
    [InlineData("""["free","occupancy",3,"todo"]""")]
    [InlineData("\"free,occupancy,varieties,todo\"")]
    [InlineData("""{"0":"free","1":"occupancy","2":"varieties","3":"todo"}""")]
    [InlineData("null")]
    public async Task PutPreferences_BandFiguresNotFourDistinctKnownOnes_Returns400(string figures)
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync(Url, ExpertRequestWithBandOptions(new() { ["figures"] = JsonValue(figures) }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("figures for block 'keyfigures' must be four distinct known figures", await response.Content.ReadAsStringAsync());
        await AssertNothingStoredAsync(userId);
    }

    [Fact]
    public async Task PutPreferences_BandFiguresFourDistinctKnownOnes_IsStored_AsSent()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var put = await Client.PutAsJsonAsync(
            Url,
            ExpertRequestWithBandOptions(new() { ["figures"] = JsonValue("""["cities","free","tips","surface"]""") }));
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);
        Assert.NotNull(body);
        var options = Block(body, "keyfigures").Options;
        Assert.NotNull(options);
        Assert.Equal(
            ["cities", "free", "tips", "surface"],
            options["figures"].EnumerateArray().Select(figure => figure.GetString()));
    }

    /// <summary>Without `figures`, the band's options are bounded like any other block's, and nothing more.</summary>
    [Fact]
    public async Task PutPreferences_BandOptionsWithoutFigures_IsAccepted()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync(
            Url,
            ExpertRequestWithBandOptions(new() { ["density"] = JsonValue("\"compact\"") }));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    // ── Bounded options (round 1, E1 / G2) ───────────────────────────────────

    [Fact]
    public async Task PutPreferences_TooManyOptionKeys_Returns400()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        // 17 keys: one past MaxOptionKeysPerBlock, each value tiny — so this
        // trips the COUNT ceiling and not the byte ceiling.
        var options = Enumerable.Range(0, 17)
            .ToDictionary(i => $"k{i}", _ => JsonValue("1"));

        var response = await Client.PutAsJsonAsync(Url, RequestWithOptions(options));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // WHICH ceiling rejected it (round 2, E'2): the status code alone cannot
        // tell the count ceiling from the byte ceiling, so this test and the next
        // one would both stay green if the two bounds silently collapsed into one.
        Assert.Contains("too many options", await response.Content.ReadAsStringAsync());
        await AssertNothingStoredAsync(userId);
    }

    [Fact]
    public async Task PutPreferences_OversizedOptions_Returns400()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        // ONE key, well past MaxOptionsBytesPerBlock — the count ceiling cannot
        // catch this one, which is why both bounds exist.
        var options = new Dictionary<string, JsonElement>
        {
            ["blob"] = JsonValue(JsonSerializer.Serialize(new string('x', 4096))),
        };

        var response = await Client.PutAsJsonAsync(Url, RequestWithOptions(options));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("are too large", await response.Content.ReadAsStringAsync());
        await AssertNothingStoredAsync(userId);
    }

    [Fact]
    public async Task PutPreferences_OptionsWithinBothBounds_IsAccepted()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var options = new Dictionary<string, JsonElement>
        {
            ["photos"] = JsonValue("true"),
            ["garden"] = JsonValue("\"all\""),
        };

        var response = await Client.PutAsJsonAsync(Url, RequestWithOptions(options));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(Url);
        Assert.NotNull(body);
        var stored = Block(body, DashboardLayout.Blocks.Weather).Options;
        Assert.NotNull(stored);
        Assert.Equal(2, stored.Count);
    }

    // ── Concurrent first save (round 1, E2 / G1) ─────────────────────────────

    [Fact]
    public async Task PutPreferences_ConcurrentFirstSaves_AllSucceed_AndLeaveOneRow()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);

        // Eight clients, no stored row yet: every one of them reads `row is null`
        // and inserts. The unique index on UserId lets exactly one through; the
        // others must be retried against the winner's row, not surfaced as 500.
        var clients = Enumerable.Range(0, 8).Select(_ => AuthorizedClient(userId)).ToList();
        try
        {
            var responses = await Task.WhenAll(
                clients.Select(client => client.PutAsJsonAsync(Url, ValidRequest())));

            Assert.All(responses, r => Assert.Equal(HttpStatusCode.NoContent, r.StatusCode));
        }
        finally
        {
            foreach (var client in clients) client.Dispose();
        }

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(
            1,
            await db.UserDashboardPreferences.CountAsync(p => p.UserId == userId));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>The Gardener preset's keys, in order — its seven widgets, never the band nor Statistics.</summary>
    private static List<string> GardenerKeys =>
        [.. DashboardPresets.For(DashboardLayout.Levels.Gardener).Select(b => b.Key)];

    /// <summary>
    /// The eight widgets — the blocks of the Expert preset as it stood before the
    /// Key figures band, what an Expert saved until PR B: a literal, not derived
    /// from today's preset, which is the thing under test.
    /// </summary>
    private static readonly string[] EightWidgets =
        ["weather", "gardens", "tips", "month", "todo", "counters", "stats", "harvest"];

    /// <summary>An Expert layout as stored JSON, its blocks sized and hidden as given.</summary>
    private static string StoredExpertLayout(IEnumerable<(string Key, string Size, bool Hidden)> blocks) =>
        "{\"schemaVersion\":1,\"level\":\"expert\",\"blocks\":[" +
        string.Join(",", blocks.Select(b =>
            $"{{\"key\":\"{b.Key}\",\"size\":\"{b.Size}\",\"hidden\":{(b.Hidden ? "true" : "false")},\"options\":null}}")) +
        "]}";

    private static DashboardBlockDto Block(DashboardPreferencesResponse body, string key) =>
        body.Blocks.Single(b => b.Key == key);

    private static SaveDashboardPreferencesRequest ValidRequest(string? level = null) =>
        new(level ?? DashboardLayout.Levels.Gardener,
            [.. DashboardPresets.For(level ?? DashboardLayout.Levels.Gardener)
                .Select(b => new SaveDashboardBlockRequest(b.Key, b.Size, b.Hidden, null))]);

    /// <summary>A valid save whose Weather block carries the given options.</summary>
    private static SaveDashboardPreferencesRequest RequestWithOptions(
        Dictionary<string, JsonElement> options) =>
        new(DashboardLayout.Levels.Gardener,
            [.. DashboardPresets.For(DashboardLayout.Levels.Gardener)
                .Select(b => new SaveDashboardBlockRequest(
                    b.Key,
                    b.Size,
                    b.Hidden,
                    b.Key == DashboardLayout.Blocks.Weather ? options : null))]);

    /// <summary>The Expert preset, its Key figures band carrying the given options.</summary>
    private static SaveDashboardPreferencesRequest ExpertRequestWithBandOptions(
        Dictionary<string, JsonElement> options) =>
        new(DashboardLayout.Levels.Expert,
            [.. DashboardPresets.For(DashboardLayout.Levels.Expert)
                .Select(b => new SaveDashboardBlockRequest(
                    b.Key,
                    b.Size,
                    b.Hidden,
                    b.Key == "keyfigures" ? options : null))]);

    /// <summary>One JSON value, from its literal text.</summary>
    private static JsonElement JsonValue(string json) =>
        JsonSerializer.Deserialize<JsonElement>(json);

    private async Task AssertNothingStoredAsync(string userId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        Assert.False(await db.UserDashboardPreferences.AnyAsync(p => p.UserId == userId));
    }

    private void AuthAs(string userId)
    {
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }

    /// <summary>A SEPARATE client, so several requests can be in flight at once.</summary>
    private HttpClient AuthorizedClient(string userId)
    {
        var client = Fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
        return client;
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
