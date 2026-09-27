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
/// SMA-448, lot F3, step L1 — the limits of a formula, APPLIED by the server
/// (V3: a limit shown is a limit applied, the same day). The creation of a
/// garden beyond the formula's number, and the resizing of a garden beyond
/// the formula's size, are refused in 403 <c>application/problem+json</c>
/// with a stable <c>code</c> and the numbers the screen says (pre-flight
/// § C.4, decided by Alexandre on 26/09).
///
/// <para><b>The limits apply going forward only</b> (Alexandre, 22/09 18:02):
/// an account already beyond a limit keeps everything — it can neither add
/// beyond nor grow beyond, and nothing is ever removed. A garden larger than
/// its formula allows is saved at its size, shrunk, but never grown.</para>
/// </summary>
public class FormulaLimitsTests : IntegrationTestBase
{
    public FormulaLimitsTests(PostgresFixture fixture) : base(fixture) { }

    private const string GardensUrl = "/api/gardens";

    // ── The number of gardens (POST /api/gardens) ────────────────────────────

    /// <summary>The proof by failure of the lot: 201 today, 403 with its reasons.</summary>
    [Fact]
    public async Task CreateGarden_Novice_FourthGarden_Returns403_GardenLimit_WithTheNumbers()
    {
        var userId = await SeedUserAsync(formula: "novice");
        for (var i = 0; i < 3; i++) await SeedGardenAsync(userId, Guid.NewGuid(), 10, 10);
        AuthAs(userId);

        var response = await Client.PostAsJsonAsync(GardensUrl, new { name = "Quatrième" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = problem.RootElement;
        Assert.Equal("formula.gardenLimit", root.GetProperty("code").GetString());
        Assert.Equal("novice", root.GetProperty("formula").GetString());
        Assert.Equal(3, root.GetProperty("limit").GetInt32());
        Assert.Equal(3, root.GetProperty("current").GetInt32());
        Assert.Equal(403, root.GetProperty("status").GetInt32());

        Assert.Equal(3, await CountGardensAsync(userId));
    }

    [Fact]
    public async Task CreateGarden_Novice_ThirdGarden_Returns201()
    {
        var userId = await SeedUserAsync(formula: "novice");
        for (var i = 0; i < 2; i++) await SeedGardenAsync(userId, Guid.NewGuid(), 10, 10);
        AuthAs(userId);

        var response = await Client.PostAsJsonAsync(GardensUrl, new { name = "Troisième" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(3, await CountGardensAsync(userId));
    }

    [Fact]
    public async Task CreateGarden_Gardener_EleventhGarden_Returns403_TenthReturns201()
    {
        var userId = await SeedUserAsync(formula: "gardener");
        for (var i = 0; i < 9; i++) await SeedGardenAsync(userId, Guid.NewGuid(), null, null);
        AuthAs(userId);

        Assert.Equal(HttpStatusCode.Created, (await Client.PostAsJsonAsync(GardensUrl, new { name = "Dixième" })).StatusCode);

        var refused = await Client.PostAsJsonAsync(GardensUrl, new { name = "Onzième" });

        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        using var problem = JsonDocument.Parse(await refused.Content.ReadAsStringAsync());
        Assert.Equal("gardener", problem.RootElement.GetProperty("formula").GetString());
        Assert.Equal(10, problem.RootElement.GetProperty("limit").GetInt32());
        Assert.Equal(10, problem.RootElement.GetProperty("current").GetInt32());
        Assert.Equal(10, await CountGardensAsync(userId));
    }

    [Fact]
    public async Task CreateGarden_Expert_HasNoLimitOnTheNumber()
    {
        var userId = await SeedUserAsync(formula: "expert");
        for (var i = 0; i < 12; i++) await SeedGardenAsync(userId, Guid.NewGuid(), null, null);
        AuthAs(userId);

        var response = await Client.PostAsJsonAsync(GardensUrl, new { name = "Treizième" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(13, await CountGardensAsync(userId));
    }

    /// <summary>
    /// The rule of the existing accounts: a Novice with five gardens keeps its
    /// five — the refusal says « 5 for 3 », and removes nothing.
    /// </summary>
    [Fact]
    public async Task CreateGarden_AnAccountAlreadyBeyondItsLimit_KeepsEverything_AndCannotAddOne()
    {
        var userId = await SeedUserAsync(formula: "novice");
        for (var i = 0; i < 5; i++) await SeedGardenAsync(userId, Guid.NewGuid(), 30, 30);
        AuthAs(userId);

        var response = await Client.PostAsJsonAsync(GardensUrl, new { name = "Sixième" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(3, problem.RootElement.GetProperty("limit").GetInt32());
        Assert.Equal(5, problem.RootElement.GetProperty("current").GetInt32());
        Assert.Equal(5, await CountGardensAsync(userId));

        var list = await Client.GetAsync(GardensUrl);
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var gardens = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.Equal(5, gardens.RootElement.GetArrayLength());
    }

    // ── The size of a garden (PUT /api/gardens/{id}/layout) ──────────────────

    /// <summary>The proof by failure: a Novice garden grown from 20 × 20 to 21 × 20 — 204 today, 403.</summary>
    [Fact]
    public async Task SaveLayout_Novice_21x20_Returns403_GardenSize_WithTheNumbers_AndChangesNothing()
    {
        var userId = await SeedUserAsync(formula: "novice");
        var gardenId = Guid.NewGuid();
        await SeedGardenAsync(userId, gardenId, 20, 20);
        var plantId = await SeedPlantAsync();
        await SeedPlacementAsync(gardenId, plantId);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync($"{GardensUrl}/{gardenId}/layout", Layout(21, 20));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = problem.RootElement;
        Assert.Equal("formula.gardenSize", root.GetProperty("code").GetString());
        Assert.Equal("novice", root.GetProperty("formula").GetString());
        Assert.Equal((20, 20), Size(root.GetProperty("limit")));
        Assert.Equal((20, 20), Size(root.GetProperty("current")));
        Assert.Equal((21, 20), Size(root.GetProperty("requested")));

        // Nothing moved: the geometry, the cell size, the placements.
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = await db.Gardens.Include(g => g.Placements).SingleAsync(g => g.Id == gardenId);
        Assert.Equal((20, 20), (garden.LayoutWidth, garden.LayoutHeight));
        Assert.Equal("50cm", garden.CellSize);
        Assert.Single(garden.Placements);
    }

    [Fact]
    public async Task SaveLayout_Novice_20x20_Returns204()
    {
        var userId = await SeedUserAsync(formula: "novice");
        var gardenId = Guid.NewGuid();
        await SeedGardenAsync(userId, gardenId, 10, 8);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync($"{GardensUrl}/{gardenId}/layout", Layout(20, 20));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    /// <summary>A first plan is a size too: a Novice garden without one cannot open at 25 × 10.</summary>
    [Fact]
    public async Task SaveLayout_Novice_AGardenWithoutAPlan_25x10_Returns403_CurrentNull()
    {
        var userId = await SeedUserAsync(formula: "novice");
        var gardenId = Guid.NewGuid();
        await SeedGardenAsync(userId, gardenId, null, null);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync($"{GardensUrl}/{gardenId}/layout", Layout(25, 10));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Null, problem.RootElement.GetProperty("current").ValueKind);
        Assert.Equal((25, 10), Size(problem.RootElement.GetProperty("requested")));
    }

    /// <summary>
    /// « En avant seulement » (Alexandre, 22/09 18:02): a Gardener garden
    /// already at 60 × 60 is saved at 60 × 60, refused at 61, shrunk to
    /// 40 × 40 — and, once shrunk, grows back only to the formula's 50.
    /// </summary>
    [Fact]
    public async Task SaveLayout_AGardenAlreadyBeyondTheLimit_IsSavedAtItsSize_ShrunkFreely_NeverGrown()
    {
        var userId = await SeedUserAsync(formula: "gardener");
        var gardenId = Guid.NewGuid();
        await SeedGardenAsync(userId, gardenId, 60, 60);
        AuthAs(userId);
        var url = $"{GardensUrl}/{gardenId}/layout";

        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(url, Layout(60, 60))).StatusCode);

        var grown = await Client.PutAsJsonAsync(url, Layout(61, 60));
        Assert.Equal(HttpStatusCode.Forbidden, grown.StatusCode);
        using (var problem = JsonDocument.Parse(await grown.Content.ReadAsStringAsync()))
        {
            Assert.Equal("gardener", problem.RootElement.GetProperty("formula").GetString());
            Assert.Equal((50, 50), Size(problem.RootElement.GetProperty("limit")));
            Assert.Equal((60, 60), Size(problem.RootElement.GetProperty("current")));
            Assert.Equal((61, 60), Size(problem.RootElement.GetProperty("requested")));
        }

        // Taller alone is a growth too.
        Assert.Equal(HttpStatusCode.Forbidden, (await Client.PutAsJsonAsync(url, Layout(60, 61))).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(url, Layout(40, 40))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync(url, Layout(50, 50))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Client.PutAsJsonAsync(url, Layout(51, 50))).StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = await db.Gardens.AsNoTracking().SingleAsync(g => g.Id == gardenId);
        Assert.Equal((50, 50), (garden.LayoutWidth, garden.LayoutHeight));
    }

    [Fact]
    public async Task SaveLayout_Expert_100x100_Returns204()
    {
        var userId = await SeedUserAsync(formula: "expert");
        var gardenId = Guid.NewGuid();
        await SeedGardenAsync(userId, gardenId, 10, 10);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync($"{GardensUrl}/{gardenId}/layout", Layout(100, 100));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static object Layout(int width, int height) =>
        new { width, height, cellSize = "50cm", cellsJson = (string?)null, placements = Array.Empty<object>() };

    private static (int Width, int Height) Size(JsonElement size) =>
        (size.GetProperty("width").GetInt32(), size.GetProperty("height").GetInt32());

    private async Task<int> CountGardensAsync(string userId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        return await db.Gardens.CountAsync(g => g.UserId == userId);
    }

    private void AuthAs(string userId) =>
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));

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

    private async Task<Guid> SeedPlantAsync()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant { Id = Guid.NewGuid(), ScientificName = $"Plant {Guid.NewGuid():N}", PlantTypeId = 1 };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    private async Task SeedPlacementAsync(Guid gardenId, Guid plantId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.GardenPlacements.Add(new GardenPlacement
        {
            Id = Guid.NewGuid(),
            GardenId = gardenId,
            PlantId = plantId,
            StartRow = 0,
            StartCol = 0,
            SpanRows = 1,
            SpanCols = 1,
            PlacedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }
}
