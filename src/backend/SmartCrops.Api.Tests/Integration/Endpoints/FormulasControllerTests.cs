using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-448, lot F1, step S2 — <c>GET /api/formulas</c>: the capabilities of the
/// three formulas, SERVED (pre-flight § C.2 a, decided on 26/09), and the
/// caller's own state. The API is the one source of what a formula permits:
/// the tables that refuse a write are the tables this endpoint serves.
///
/// <para>The reference file (<c>dashboardLayout.reference.json</c>) becomes
/// the contract of the served catalogue: each formula's widgets and preset are
/// the reference preset, its sizes the reference rows, its limits, weather mode
/// and compact bar the reference <c>formulas</c> entry. Read here as raw JSON —
/// the wire, not a DTO — so the test says what a client receives.</para>
/// </summary>
public class FormulasControllerTests : IntegrationTestBase
{
    public FormulasControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string Url = "/api/formulas";

    private static readonly JsonElement Reference = LoadReference();

    [Fact]
    public async Task GetFormulas_NoBearer_Returns401()
    {
        var response = await Client.GetAsync(Url);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetFormulas_ServesTheCatalog_TheReferenceFileIsItsContract()
    {
        var userId = await SeedUserAsync();
        AuthAs(userId);

        using var body = await GetJsonAsync();
        var formulas = body.RootElement.GetProperty("formulas").EnumerateArray().ToList();

        // The three formulas, in the reference's order.
        Assert.Equal(Strings(Reference.GetProperty("levels")), formulas.Select(f => f.GetProperty("key").GetString()!));

        foreach (var formula in formulas)
        {
            var key = formula.GetProperty("key").GetString()!;
            var preset = Reference.GetProperty("presets").GetProperty(key).EnumerateArray().ToList();
            var expected = Reference.GetProperty("formulas").GetProperty(key);

            // Its widgets ARE its preset's blocks, in the preset's order…
            Assert.Equal(
                preset.Select(block => block.GetProperty("key").GetString()!),
                Strings(formula.GetProperty("widgets")));

            // …its preset is the reference preset, block by block…
            Assert.Equal(
                preset.Select(block => (
                    block.GetProperty("key").GetString(),
                    block.GetProperty("size").GetString(),
                    block.GetProperty("hidden").GetBoolean())),
                formula.GetProperty("preset").EnumerateArray().Select(block => (
                    block.GetProperty("key").GetString(),
                    block.GetProperty("size").GetString(),
                    block.GetProperty("hidden").GetBoolean())));

            // …each of its widgets takes the sizes of the reference row, in order,
            // and it serves no row for a widget it does not have…
            var sizes = formula.GetProperty("sizes");
            Assert.Equal(
                Strings(formula.GetProperty("widgets")).Order(StringComparer.Ordinal),
                sizes.EnumerateObject().Select(row => row.Name).Order(StringComparer.Ordinal));
            foreach (var row in sizes.EnumerateObject())
            {
                Assert.Equal(
                    Strings(Reference.GetProperty("sizesFor").GetProperty(key).GetProperty(row.Name)),
                    Strings(row.Value));
            }

            // …and its limits, weather mode and compact bar are the reference's.
            Assert.Equal(expected.GetProperty("gardenLimit").ToString(), formula.GetProperty("gardenLimit").ToString());
            Assert.Equal(
                expected.GetProperty("maxGardenSize").GetProperty("width").GetInt32(),
                formula.GetProperty("maxGardenSize").GetProperty("width").GetInt32());
            Assert.Equal(
                expected.GetProperty("maxGardenSize").GetProperty("height").GetInt32(),
                formula.GetProperty("maxGardenSize").GetProperty("height").GetInt32());
            Assert.Equal(expected.GetProperty("weather").GetString(), formula.GetProperty("weather").GetString());
            Assert.Equal(expected.GetProperty("compactBar").GetBoolean(), formula.GetProperty("compactBar").GetBoolean());
        }
    }

    /// <summary>
    /// The limits decided by Alexandre (22/09 16:39 and 18:02; 26/09 for the
    /// Expert's 100 × 100): Novice 3 gardens up to 20 × 20 cells, Gardener 10 up
    /// to 50 × 50, Expert unlimited up to 100 × 100. Literals on purpose.
    /// </summary>
    [Fact]
    public async Task GetFormulas_ServesTheDecidedLimits()
    {
        var userId = await SeedUserAsync();
        AuthAs(userId);

        using var body = await GetJsonAsync();
        var byKey = body.RootElement.GetProperty("formulas").EnumerateArray()
            .ToDictionary(f => f.GetProperty("key").GetString()!, f => f);

        Assert.Equal(3, byKey["novice"].GetProperty("gardenLimit").GetInt32());
        Assert.Equal(10, byKey["gardener"].GetProperty("gardenLimit").GetInt32());
        Assert.Equal(JsonValueKind.Null, byKey["expert"].GetProperty("gardenLimit").ValueKind);
        Assert.Equal((20, 20), Size(byKey["novice"].GetProperty("maxGardenSize")));
        Assert.Equal((50, 50), Size(byKey["gardener"].GetProperty("maxGardenSize")));
        Assert.Equal((100, 100), Size(byKey["expert"].GetProperty("maxGardenSize")));

        // R1 (V3-01): the Gardener has no Statistics; Récolte stays with the
        // Gardener and the Expert (Alexandre, 26/09, question 3).
        Assert.DoesNotContain("stats", Strings(byKey["gardener"].GetProperty("widgets")));
        Assert.Contains("harvest", Strings(byKey["gardener"].GetProperty("widgets")));
        Assert.Contains("stats", Strings(byKey["expert"].GetProperty("widgets")));
    }

    [Fact]
    public async Task GetFormulas_ANewAccount_HasChosenNothing_AndEveryFormulaFits()
    {
        var userId = await SeedUserAsync();
        AuthAs(userId);

        using var body = await GetJsonAsync();
        var account = body.RootElement.GetProperty("account");

        Assert.Equal("gardener", account.GetProperty("formula").GetString());
        Assert.False(account.GetProperty("chosen").GetBoolean());
        Assert.Equal(JsonValueKind.Null, account.GetProperty("chosenAt").ValueKind);
        Assert.Equal(0, account.GetProperty("gardenCount").GetInt32());
        Assert.Equal(JsonValueKind.Null, account.GetProperty("largestGardenSize").ValueKind);

        var availability = Availability(account);
        Assert.Equal(["novice", "gardener", "expert"], availability.Keys);
        Assert.All(availability.Values, entry => Assert.True(entry.GetProperty("available").GetBoolean()));
        Assert.All(availability.Values, entry => Assert.Empty(entry.GetProperty("reasons").EnumerateArray()));
        Assert.True(availability["gardener"].GetProperty("current").GetBoolean());
        Assert.False(availability["novice"].GetProperty("current").GetBoolean());
    }

    [Fact]
    public async Task GetFormulas_CountsTheGardens_TheLargestSize_AndSaysWhyAFormulaIsTooSmall()
    {
        var userId = await SeedUserAsync();
        var wide = Guid.NewGuid();
        var tall = Guid.NewGuid();
        await SeedGardenAsync(userId, Guid.NewGuid(), 10, 8);
        await SeedGardenAsync(userId, wide, 30, 12);
        await SeedGardenAsync(userId, tall, 12, 25);
        await SeedGardenAsync(userId, Guid.NewGuid(), null, null);
        await SeedGardenAsync(userId, Guid.NewGuid(), 5, 5);
        AuthAs(userId);

        using var body = await GetJsonAsync();
        var account = body.RootElement.GetProperty("account");

        Assert.Equal(5, account.GetProperty("gardenCount").GetInt32());
        // The widest width and the tallest height — two gardens here.
        Assert.Equal((30, 25), Size(account.GetProperty("largestGardenSize")));

        var availability = Availability(account);

        var novice = availability["novice"];
        Assert.False(novice.GetProperty("available").GetBoolean());
        var reasons = novice.GetProperty("reasons").EnumerateArray().ToList();
        var count = Assert.Single(reasons, r => r.GetProperty("kind").GetString() == "gardens");
        Assert.Equal(5, count.GetProperty("have").GetInt32());
        Assert.Equal(3, count.GetProperty("limit").GetInt32());
        var tooLarge = reasons.Where(r => r.GetProperty("kind").GetString() == "size").ToList();
        Assert.Equal(
            new[] { wide, tall }.Order(),
            tooLarge.Select(r => r.GetProperty("gardenId").GetGuid()).Order());
        var wideReason = tooLarge.Single(r => r.GetProperty("gardenId").GetGuid() == wide);
        Assert.Equal((30, 12), (wideReason.GetProperty("width").GetInt32(), wideReason.GetProperty("height").GetInt32()));
        Assert.Equal((20, 20), (wideReason.GetProperty("maxWidth").GetInt32(), wideReason.GetProperty("maxHeight").GetInt32()));

        Assert.True(availability["gardener"].GetProperty("available").GetBoolean());
        Assert.Empty(availability["gardener"].GetProperty("reasons").EnumerateArray());
        Assert.True(availability["expert"].GetProperty("available").GetBoolean());
    }

    /// <summary>
    /// « Votre formule — conservée » (Alexandre, 22/09 18:02, question 2): an
    /// account already beyond its own formula keeps it — available, marked
    /// current, its reasons listed for the screen to say.
    /// </summary>
    [Fact]
    public async Task GetFormulas_AnAccountBeyondItsOwnFormula_KeepsIt_Available_WithItsReasons()
    {
        var userId = await SeedUserAsync(formula: "novice");
        for (var i = 0; i < 4; i++) await SeedGardenAsync(userId, Guid.NewGuid(), 10, 10);
        AuthAs(userId);

        using var body = await GetJsonAsync();
        var novice = Availability(body.RootElement.GetProperty("account"))["novice"];

        Assert.True(novice.GetProperty("current").GetBoolean());
        Assert.True(novice.GetProperty("available").GetBoolean());
        var reason = Assert.Single(novice.GetProperty("reasons").EnumerateArray());
        Assert.Equal("gardens", reason.GetProperty("kind").GetString());
        Assert.Equal(4, reason.GetProperty("have").GetInt32());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static JsonElement LoadReference()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Dashboard", "dashboardLayout.reference.json");
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return document.RootElement.Clone();
    }

    private static string[] Strings(JsonElement array) =>
        [.. array.EnumerateArray().Select(item => item.GetString()!)];

    private static (int Width, int Height) Size(JsonElement size) =>
        (size.GetProperty("width").GetInt32(), size.GetProperty("height").GetInt32());

    private static Dictionary<string, JsonElement> Availability(JsonElement account) =>
        account.GetProperty("availability").EnumerateArray()
            .ToDictionary(entry => entry.GetProperty("formula").GetString()!, entry => entry);

    private async Task<JsonDocument> GetJsonAsync()
    {
        var response = await Client.GetAsync(Url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync());
    }

    private void AuthAs(string userId) =>
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));

    private async Task<string> SeedUserAsync(string formula = "gardener")
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

    private async Task SeedGardenAsync(string userId, Guid id, int? width, int? height)
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
            CellSize = width is null ? null : "50cm",
        });
        await db.SaveChangesAsync();
    }
}
