using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Dashboard;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-448, lot F1, step S3 — <c>PUT /api/formulas/current</c>, the switch of
/// formula. Three promises, each proven here:
/// <list type="bullet">
/// <item><b>V4 — nothing is lost, in either direction</b>: the layout of the
/// formula left goes to the archive, the layout of the formula entered comes
/// back from it — or its preset, for a formula never visited.</item>
/// <item><b>R8 — a formula too small for the account's gardens is refused on
/// the server</b>, in 409 <c>application/problem+json</c> with a stable
/// <c>code</c> and its reasons (pre-flight § C.4).</item>
/// <item><b>The image before stays able to read</b>: whatever the switches,
/// the current layout row stays ONE per account, carrying the account's
/// formula as its level (pre-flight § C.3 c).</item>
/// </list>
/// </summary>
public class FormulaSwitchTests : IntegrationTestBase
{
    public FormulaSwitchTests(PostgresFixture fixture) : base(fixture) { }

    private const string SwitchUrl = "/api/formulas/current";
    private const string PreferencesUrl = "/api/dashboard/preferences";

    [Fact]
    public async Task PutCurrent_NoBearer_Returns401()
    {
        var response = await Client.PutAsJsonAsync(SwitchUrl, new { formula = "expert" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PutCurrent_UnknownFormula_Returns400_AndChangesNothing()
    {
        var userId = await SeedUserAsync("gardener");
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync(SwitchUrl, new { formula = "archdruid" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(("gardener", (DateTime?)null), await AccountAsync(userId));
    }

    /// <summary>
    /// V4, the case of the pre-flight (§ D, lot F1, proof 1): an Expert who chose
    /// four key figures and rearranged the page passes to the Gardener formula,
    /// arranges that one too, and comes back — the four figures, their order and
    /// the Expert's arrangement come back, and going back again brings the
    /// Gardener's back. On develop a switch rewrote the layout with the preset of
    /// the level (`setLevel`, `presetFor`): the figures were gone.
    /// </summary>
    [Fact]
    public async Task PutCurrent_AnExpertWithFourChosenFigures_GoesGardenerAndBack_AndGetsEverythingBack()
    {
        var userId = await SeedUserAsync("expert");
        AuthAs(userId);

        string[] figures = ["cities", "free", "tips", "surface"];
        var expertLayout = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Expert,
            [
                new("gardens", "medium", false, null),
                new("keyfigures", "wide", false, new() { ["figures"] = JsonSerializer.SerializeToElement(figures) }),
                new("weather", "large", false, null),
                new("tips", "small", false, null),
                new("month", "large", false, null),
                new("todo", "large", true, null),
                new("counters", "large", false, null),
                new("stats", "medium", false, null),
                new("harvest", "large", true, null),
            ]);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(PreferencesUrl, expertLayout)).StatusCode);

        // To the Gardener formula, never visited: its preset.
        Assert.Equal(HttpStatusCode.NoContent, (await SwitchAsync("gardener")).StatusCode);
        var gardener = await GetPreferencesAsync();
        Assert.Equal("gardener", gardener.Level);
        Assert.Equal(
            DashboardPresets.For("gardener").Select(b => (b.Key, b.Size, b.Hidden)),
            gardener.Blocks.Select(b => (b.Key, b.Size, b.Hidden)));

        // The Gardener arranges its page too.
        var gardenerLayout = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Gardener,
            [
                new("tips", "small", false, null),
                new("weather", "medium", false, null),
                new("gardens", "large", false, null),
                new("month", "medium", false, null),
                new("todo", "medium", false, null),
                new("counters", "medium", true, null),
                new("harvest", "large", true, null),
            ]);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(PreferencesUrl, gardenerLayout)).StatusCode);

        // Back to the Expert: everything it had.
        Assert.Equal(HttpStatusCode.NoContent, (await SwitchAsync("expert")).StatusCode);
        var expert = await GetPreferencesAsync();
        Assert.Equal("expert", expert.Level);
        Assert.Equal(
            expertLayout.Blocks.Select(b => (b.Key, b.Size, b.Hidden)),
            expert.Blocks.Select(b => (b.Key, b.Size, b.Hidden)));
        var band = expert.Blocks.Single(b => b.Key == "keyfigures");
        Assert.Equal(figures, band.Options!["figures"].EnumerateArray().Select(f => f.GetString()));

        // And to the Gardener again: its own arrangement, not its preset.
        Assert.Equal(HttpStatusCode.NoContent, (await SwitchAsync("gardener")).StatusCode);
        var gardenerAgain = await GetPreferencesAsync();
        Assert.Equal(
            gardenerLayout.Blocks.Select(b => (b.Key, b.Size, b.Hidden)),
            gardenerAgain.Blocks.Select(b => (b.Key, b.Size, b.Hidden)));
    }

    /// <summary>
    /// SMA-448, lot F5-b — PR #300, fix round 1, P1 (Alexandre, 29/09): an
    /// account that ARRIVES at the Expert formula with no Expert layout in the
    /// archive — a Gardener who arranged its page, entering the Expert for the
    /// first time — reads the Expert preset, the Gardens widget in the Full
    /// width; since SMA-437, lot V3-08, step S5 (A-15), the preset without a
    /// hole — the Weather after the Gardens, in the Full width too; since
    /// PR #301, fix round 1, R1 (Alexandre, 29/09 — the alternative B), Tips
    /// in Large beside To-do and Harvest in Medium, then This month, Counts and
    /// Statistics in the Full width. The Gardener's arrangement waits in the
    /// archive, untouched (V4).
    /// </summary>
    [Fact]
    public async Task PutCurrent_AGardenerEnteringTheExpertFormulaForTheFirstTime_ReadsGardensInTheFullWidth()
    {
        var userId = await SeedUserAsync("gardener");
        AuthAs(userId);
        var gardenerLayout = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Gardener,
            [.. DashboardPresets.For("gardener").Select(b => new SaveDashboardBlockRequest(b.Key, b.Key == "tips" ? "small" : b.Size, b.Hidden, null))]);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(PreferencesUrl, gardenerLayout)).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await SwitchAsync("expert")).StatusCode);
        var expert = await GetPreferencesAsync();

        Assert.Equal("expert", expert.Level);
        Assert.Equal(
            [("keyfigures", "wide"), ("gardens", "wide"), ("weather", "wide"), ("tips", "large"), ("todo", "medium"),
             ("harvest", "medium"), ("month", "wide"), ("counters", "wide"), ("stats", "wide")],
            expert.Blocks.Select(b => (b.Key, b.Size)));

        // The Gardener's own arrangement comes back from the archive, as it was.
        Assert.Equal(HttpStatusCode.NoContent, (await SwitchAsync("gardener")).StatusCode);
        var gardener = await GetPreferencesAsync();
        Assert.Equal(
            gardenerLayout.Blocks.Select(b => (b.Key, b.Size, b.Hidden)),
            gardener.Blocks.Select(b => (b.Key, b.Size, b.Hidden)));
    }

    /// <summary>
    /// R8 and V4 together: a formula too small for the account's gardens is
    /// refused — 409, <c>application/problem+json</c>, the code and the
    /// reasons the choice screen will say — and nothing moves: not the
    /// formula, not the choice, not the layout, not the archive.
    /// </summary>
    [Fact]
    public async Task PutCurrent_AFormulaTooSmall_Returns409_ProblemJson_WithItsReasons_AndMovesNothing()
    {
        var userId = await SeedUserAsync("gardener");
        var wide = Guid.NewGuid();
        await SeedGardenAsync(userId, wide, 30, 12);
        for (var i = 0; i < 4; i++) await SeedGardenAsync(userId, Guid.NewGuid(), 10, 10);
        AuthAs(userId);
        var layout = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Gardener,
            [.. DashboardPresets.For("gardener").Select(b => new SaveDashboardBlockRequest(b.Key, b.Key == "tips" ? "small" : b.Size, b.Hidden, null))]);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(PreferencesUrl, layout)).StatusCode);
        var rowBefore = await CurrentRowAsync(userId);

        var response = await SwitchAsync("novice");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = problem.RootElement;
        Assert.Equal(409, root.GetProperty("status").GetInt32());
        Assert.Equal("formula.tooSmall", root.GetProperty("code").GetString());
        Assert.Equal("novice", root.GetProperty("formula").GetString());
        var reasons = root.GetProperty("reasons").EnumerateArray().ToList();
        var count = Assert.Single(reasons, r => r.GetProperty("kind").GetString() == "gardens");
        Assert.Equal((5, 3), (count.GetProperty("have").GetInt32(), count.GetProperty("limit").GetInt32()));
        var size = Assert.Single(reasons, r => r.GetProperty("kind").GetString() == "size");
        Assert.Equal(wide, size.GetProperty("gardenId").GetGuid());
        Assert.Equal((30, 12, 20, 20), (
            size.GetProperty("width").GetInt32(),
            size.GetProperty("height").GetInt32(),
            size.GetProperty("maxWidth").GetInt32(),
            size.GetProperty("maxHeight").GetInt32()));

        Assert.Equal(("gardener", (DateTime?)null), await AccountAsync(userId));
        Assert.Equal(rowBefore, await CurrentRowAsync(userId));
        Assert.Empty(await ArchiveAsync(userId));
    }

    /// <summary>
    /// SMA-448 — « Changer de formule ne supprime jamais un jardin, ni un plan,
    /// ni une plante placée » (the Terms, article 03; the final text of the
    /// Terms and the policy, § 5.2, T3). The refusal moves nothing
    /// (<see cref="PutCurrent_AFormulaTooSmall_Returns409_ProblemJson_WithItsReasons_AndMovesNothing"/>,
    /// which does not count the gardens); the switch that GOES THROUGH was
    /// proven for the layouts alone. An Expert with two gardens of 15 × 15 —
    /// what the Novice holds —, each with a plan and placed plants, one
    /// opened, both ranked (by their own routes): Expert → Gardener → Novice
    /// → Expert, each switch 204, and after each the gardens read back from
    /// the database are those of the start — the rows, the geometry, the cell
    /// size, the plan, the placements, the opening, the place, the last
    /// modification.
    /// </summary>
    [Fact]
    public async Task PutCurrent_ASwitchDownAndBack_LeavesEveryGardenPlanAndPlacement_AsItWas()
    {
        var userId = await SeedUserAsync("expert");
        var plant = await SeedPlantAsync();
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        await SeedGardenAsync(userId, first, 15, 15);
        await SeedGardenAsync(userId, second, 15, 15);
        await SeedPlacementAsync(first, plant, 0, 0, "by the door");
        await SeedPlacementAsync(first, plant, 4, 6, null);
        await SeedPlacementAsync(second, plant, 14, 14, "the far corner");
        AuthAs(userId);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PostAsync($"/api/gardens/{first}/open", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync("/api/gardens/order", new { ids = new[] { second, first } })).StatusCode);
        var expertLayout = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Expert,
            [.. DashboardPresets.For("expert").Select(b => new SaveDashboardBlockRequest(b.Key, b.Size, b.Hidden, null))]);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(PreferencesUrl, expertLayout)).StatusCode);

        var start = await GardensAsync(userId);
        Assert.Equal(new[] { first, second }.Order(), start.Select(g => g.Id).Order());
        Assert.Equal(3, start.Sum(g => g.PlacementCount));
        Assert.All(start, g => Assert.Equal(((int?)15, (int?)15, "50cm"), (g.LayoutWidth, g.LayoutHeight, g.CellSize)));
        Assert.NotNull(start.Single(g => g.Id == first).LastOpenedAt);
        Assert.Equal(((int?)1, (int?)0), (start.Single(g => g.Id == first).SortOrder, start.Single(g => g.Id == second).SortOrder));

        foreach (var formula in new[] { "gardener", "novice", "expert" })
        {
            Assert.Equal(HttpStatusCode.NoContent, (await SwitchAsync(formula)).StatusCode);
            Assert.Equal(formula, (await AccountAsync(userId)).Formula);
            Assert.Equal(start, await GardensAsync(userId));
        }
    }

    /// <summary>
    /// « Votre formule — conservée » (Alexandre, 22/09 18:02): the formula an
    /// account is on stays its own even beyond its limits — choosing it again
    /// (« Garder Jardinier ») is accepted, stamps the deliberate choice, and
    /// moves no layout. At the Gardener, beyond both its limits — eleven
    /// gardens of 60 × 60 for ten of 50 × 50 —, a formula with a layout to keep
    /// (the Novice writes none since SMA-448, lot F2).
    /// </summary>
    [Fact]
    public async Task PutCurrent_ItsOwnFormula_EvenBeyondItsLimits_IsKept_StampsTheChoice_AndMovesNoLayout()
    {
        var userId = await SeedUserAsync("gardener");
        for (var i = 0; i < 11; i++) await SeedGardenAsync(userId, Guid.NewGuid(), 60, 60);
        AuthAs(userId);
        var layout = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Gardener,
            [.. DashboardPresets.For("gardener").Select(b => new SaveDashboardBlockRequest(b.Key, b.Size, b.Hidden, null))]);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(PreferencesUrl, layout)).StatusCode);
        var rowBefore = await CurrentRowAsync(userId);
        var before = DateTime.UtcNow.AddSeconds(-1);

        var response = await SwitchAsync("gardener");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var (formula, chosenAt) = await AccountAsync(userId);
        Assert.Equal("gardener", formula);
        Assert.NotNull(chosenAt);
        Assert.True(chosenAt >= before, $"FormulaChosenAt {chosenAt:O} should be now");
        Assert.Equal(rowBefore, await CurrentRowAsync(userId));
        Assert.Empty(await ArchiveAsync(userId));
    }

    /// <summary>
    /// The rollback of the image (pre-flight § C.3 c): the image before the
    /// formulas reads ONE layout row per account, by <c>SingleOrDefaultAsync</c>,
    /// and takes its level from the document. After any switches the current
    /// row is still one, its document names the account's formula, and the
    /// archive never holds the formula the account is on.
    /// </summary>
    [Fact]
    public async Task PutCurrent_AfterSwitches_TheImageBefore_StillReadsOneRow_CarryingTheAccountsFormula()
    {
        var userId = await SeedUserAsync("gardener");
        AuthAs(userId);
        var gardenerLayout = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Gardener,
            [.. DashboardPresets.For("gardener").Select(b => new SaveDashboardBlockRequest(b.Key, b.Size, b.Hidden, null))]);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(PreferencesUrl, gardenerLayout)).StatusCode);

        foreach (var formula in new[] { "expert", "novice", "gardener", "expert" })
        {
            Assert.Equal(HttpStatusCode.NoContent, (await SwitchAsync(formula)).StatusCode);

            using var scope = CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            // develop's read, DashboardController.GetPreferences l. 585-587, verbatim.
            var row = await db.UserDashboardPreferences.AsNoTracking().SingleOrDefaultAsync(p => p.UserId == userId);
            Assert.NotNull(row);
            Assert.Equal(DashboardLayout.CurrentSchemaVersion, row.SchemaVersion);
            using var document = JsonDocument.Parse(row.LayoutJson!);
            Assert.Equal(formula, document.RootElement.GetProperty("level").GetString());
            Assert.Equal(JsonValueKind.Array, document.RootElement.GetProperty("blocks").ValueKind);

            var archived = await db.SavedDashboardLayouts.AsNoTracking().Where(l => l.UserId == userId).Select(l => l.Formula).ToListAsync();
            Assert.DoesNotContain(formula, archived);
            Assert.Equal(archived.Count, archived.Distinct().Count());
        }
    }

    /// <summary>
    /// A burst of switches of one account, in flight at once: the account row
    /// is locked for each, so they apply one after the other — every one
    /// answers, none is lost to a race, and the invariants hold at the end.
    /// </summary>
    [Fact]
    public async Task PutCurrent_ConcurrentSwitches_AllAnswer_AndLeaveOneCurrentRow_AndAnArchiveWithoutTheCurrentFormula()
    {
        var userId = await SeedUserAsync("gardener");
        AuthAs(userId);
        var gardenerLayout = new SaveDashboardPreferencesRequest(
            DashboardLayout.Levels.Gardener,
            [.. DashboardPresets.For("gardener").Select(b => new SaveDashboardBlockRequest(b.Key, b.Size, b.Hidden, null))]);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(PreferencesUrl, gardenerLayout)).StatusCode);

        var clients = Enumerable.Range(0, 8).Select(_ => AuthorizedClient(userId)).ToList();
        try
        {
            var responses = await Task.WhenAll(clients.Select((client, i) =>
                client.PutAsJsonAsync(SwitchUrl, new { formula = i % 2 == 0 ? "expert" : "novice" })));
            Assert.All(responses, r => Assert.Equal(HttpStatusCode.NoContent, r.StatusCode));
        }
        finally
        {
            foreach (var client in clients) client.Dispose();
        }

        var (formula, _) = await AccountAsync(userId);
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(1, await db.UserDashboardPreferences.CountAsync(p => p.UserId == userId));
        var archived = await db.SavedDashboardLayouts.AsNoTracking().Where(l => l.UserId == userId).Select(l => l.Formula).ToListAsync();
        Assert.DoesNotContain(formula, archived);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Task<HttpResponseMessage> SwitchAsync(string formula) =>
        Client.PutAsJsonAsync(SwitchUrl, new { formula });

    private async Task<DashboardPreferencesResponse> GetPreferencesAsync()
    {
        var body = await Client.GetFromJsonAsync<DashboardPreferencesResponse>(PreferencesUrl);
        Assert.NotNull(body);
        return body;
    }

    private void AuthAs(string userId) =>
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));

    /// <summary>A SEPARATE client, so several requests can be in flight at once.</summary>
    private HttpClient AuthorizedClient(string userId)
    {
        var client = Fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
        return client;
    }

    private async Task<string> SeedUserAsync(string formula)
    {
        var userId = Guid.NewGuid().ToString();
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"", ""Formula"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0, {1});",
            userId, formula);
        return userId;
    }

    private async Task SeedGardenAsync(string userId, Guid id, int width, int height)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Gardens.Add(new Garden
        {
            Id = id,
            Name = "Garden " + id.ToString("N")[..6],
            UserId = userId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            LayoutWidth = width,
            LayoutHeight = height,
            CellSize = "50cm",
        });
        await db.SaveChangesAsync();
    }

    private async Task<Guid> SeedPlantAsync()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant { Id = Guid.NewGuid(), ScientificName = $"Plant {Guid.NewGuid():N}", PlantTypeId = 1 };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    private async Task SeedPlacementAsync(Guid gardenId, Guid plantId, int row, int col, string? notes)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.GardenPlacements.Add(new GardenPlacement
        {
            Id = Guid.NewGuid(),
            GardenId = gardenId,
            PlantId = plantId,
            StartRow = row,
            StartCol = col,
            SpanRows = 1,
            SpanCols = 1,
            Notes = notes,
            PlacedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    /// <summary>A garden as stored, its placements included — a value, so two reads compare whole.</summary>
    private sealed record GardenRow(
        Guid Id,
        string Name,
        int? LayoutWidth,
        int? LayoutHeight,
        string? CellSize,
        string? CellsJson,
        DateTime UpdatedAt,
        DateTime? LastOpenedAt,
        int? SortOrder,
        int PlacementCount,
        string Placements);

    /// <summary>The account's gardens read from the database, by id, each with its placements by id.</summary>
    private async Task<List<GardenRow>> GardensAsync(string userId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var gardens = await db.Gardens.AsNoTracking().Include(g => g.Placements)
            .Where(g => g.UserId == userId).OrderBy(g => g.Id).ToListAsync();
        return gardens.Select(g => new GardenRow(
            g.Id,
            g.Name,
            g.LayoutWidth,
            g.LayoutHeight,
            g.CellSize,
            g.CellsJson,
            g.UpdatedAt,
            g.LastOpenedAt,
            g.SortOrder,
            g.Placements.Count,
            string.Join(" | ", g.Placements.OrderBy(p => p.Id).Select(p =>
                $"{p.Id} {p.PlantId} {p.StartRow},{p.StartCol} {p.SpanRows}x{p.SpanCols} {p.Notes} {p.PlacedAt:O}")))).ToList();
    }

    private async Task<(string Formula, DateTime? ChosenAt)> AccountAsync(string userId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var account = await db.Users.AsNoTracking().Where(u => u.Id == userId)
            .Select(u => new { u.Formula, u.FormulaChosenAt }).SingleAsync();
        return (account.Formula, account.FormulaChosenAt);
    }

    /// <summary>The current row as stored — its document and version — to prove it did not move.</summary>
    private async Task<(string? LayoutJson, int SchemaVersion, DateTime UpdatedAt)> CurrentRowAsync(string userId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var row = await db.UserDashboardPreferences.AsNoTracking().SingleAsync(p => p.UserId == userId);
        return (row.LayoutJson, row.SchemaVersion, row.UpdatedAt);
    }

    private async Task<List<SavedDashboardLayout>> ArchiveAsync(string userId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        return await db.SavedDashboardLayouts.AsNoTracking().Where(l => l.UserId == userId).ToListAsync();
    }
}
