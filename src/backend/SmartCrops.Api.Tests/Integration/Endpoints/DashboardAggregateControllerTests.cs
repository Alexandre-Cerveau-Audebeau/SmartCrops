using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-336 (PR 2/5) — <c>GET /api/dashboard</c>, the transport aggregate.
///
/// <para>Two locks carry the weight of this file. The WHITELIST proves the
/// response is the lean shape the lot was built for — the moment a
/// <c>PlantListItemResponse</c> is spliced back in, keys appear that are not on
/// the list, and a companion test matches the catalog's seeded free text to
/// catch one nested a level deeper. The ISOLATION lock proves an aggregate that
/// now carries garden PLANS never crosses accounts.</para>
///
/// <para>The rest covers the states DEV data does not have: a user with no
/// garden, a garden with no placement, a garden with no <c>CellsJson</c>, and a
/// variety planted in two gardens.</para>
/// </summary>
public class DashboardAggregateControllerTests : IntegrationTestBase
{
    public DashboardAggregateControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string Url = "/api/dashboard";

    /// <summary>
    /// camelCase keys of <see cref="DashboardResponse"/>, ordinal order.
    /// </summary>
    private static readonly string[] ResponseWhitelist = ["gardens", "totals", "varieties"];

    /// <summary>
    /// camelCase keys of <see cref="DashboardGardenDto"/>, ordinal order. The
    /// point of listing them: not one field of the plant catalog row is here.
    /// </summary>
    private static readonly string[] GardenWhitelist =
    [
        "cellSize",
        "cellsJson",
        "config",
        // The GARDEN's own description — the widget owns the rename dialog, and
        // PUT /api/gardens/{id} replaces name and description together. NOT the
        // plant catalog's free text; the test below tells the two apart.
        "description",
        "height",
        "id",
        "isEdible",
        "name",
        "occupiedCells",
        "placementCount",
        "placements",
        "updatedAt",
        "varietyCount",
        "width",
    ];

    /// <summary>camelCase keys of <see cref="VarietyCountDto"/>, ordinal order.</summary>
    private static readonly string[] VarietyWhitelist =
    [
        "cells",
        "commonName",
        "count",
        "gardenIds",
        "imageAttribution",
        "imageUrl",
        "isEdible",
        "plantId",
        "plantType",
        "scientificName",
    ];

    /// <summary>camelCase keys of <see cref="DashboardTotalsDto"/>, ordinal order.</summary>
    private static readonly string[] TotalsWhitelist =
    [
        "catalogPlantCount",
        "gardenCount",
        "placementCount",
        "varietyCount",
    ];

    // ── Authorization ────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboard_NoBearer_Returns401()
    {
        var response = await Client.GetAsync(Url);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetDashboard_NeverLeaksAnotherUsersGardens()
    {
        var mine = Guid.NewGuid().ToString();
        var theirs = Guid.NewGuid().ToString();
        await SeedUserAsync(mine);
        await SeedUserAsync(theirs);

        var theirGarden = await SeedGardenAsync(theirs, "Their plot", cellsJson: "[{\"row\":0,\"col\":0,\"soil\":\"humus\"}]");
        var plant = await SeedPlantAsync("Solanum lycopersicum", await PlantTypeIdAsync("Vegetable"));
        await SeedPlacementAsync(theirGarden, plant, 0, 0);

        AuthAs(mine);
        var body = await GetDashboardAsync();

        Assert.Empty(body.Gardens);
        Assert.Empty(body.Varieties);
        Assert.Equal(0, body.Totals.GardenCount);
        Assert.Equal(0, body.Totals.PlacementCount);
    }

    // ── The contract ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboard_ResponseCarriesExactlyTheWhitelistedKeys()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Terrasse");
        var plantId = await SeedPlantAsync("Ocimum basilicum", await PlantTypeIdAsync("Herb"));
        await SeedPlacementAsync(gardenId, plantId, 0, 0);
        AuthAs(userId);

        using var document = JsonDocument.Parse(await Client.GetStringAsync(Url));
        var root = document.RootElement;

        Assert.Equal(ResponseWhitelist, Keys(root));
        Assert.Equal(GardenWhitelist, Keys(root.GetProperty("gardens")[0]));
        Assert.Equal(VarietyWhitelist, Keys(root.GetProperty("varieties")[0]));
        Assert.Equal(TotalsWhitelist, Keys(root.GetProperty("totals")));
    }

    [Fact]
    public async Task GetDashboard_CarriesTheGardensOwnTextButNoPlantCatalogFreeText()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(
            userId,
            "Terrasse",
            description: "Le coin sud, refait au printemps.");
        var plantId = await SeedPlantAsync("Ocimum basilicum", await PlantTypeIdAsync("Herb"));
        await SeedTranslationsAsync(
            plantId,
            ("en", "Basil", "A fragrant culinary herb nobody asked this endpoint for."));
        await SeedPlacementAsync(gardenId, plantId, 0, 0);
        AuthAs(userId);

        var raw = await Client.GetStringAsync(Url);

        // The garden's own words travel — the widget edits them.
        Assert.Contains("Le coin sud, refait au printemps.", raw, StringComparison.Ordinal);

        // The plant catalog's do not, and this is the whole point of the lot:
        // the aggregate is lighter than the gardens list because it carries
        // plans, not catalog rows. A key-level assertion could not catch a
        // PlantListItemResponse spliced back in one level deeper; matching the
        // seeded text can.
        Assert.DoesNotContain("nobody asked this endpoint for", raw, StringComparison.Ordinal);
    }

    // ── Empty states ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboard_NoGardens_ReturnsZerosNotNulls()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var body = await GetDashboardAsync();

        Assert.Empty(body.Gardens);
        Assert.Empty(body.Varieties);
        Assert.Equal(0, body.Totals.GardenCount);
        Assert.Equal(0, body.Totals.PlacementCount);
        Assert.Equal(0, body.Totals.VarietyCount);
    }

    [Fact]
    public async Task GetDashboard_EmptyGarden_CountsZero_AndIsEdibleIsNull()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        await SeedGardenAsync(userId, "Jamais planté");
        AuthAs(userId);

        var garden = Assert.Single((await GetDashboardAsync()).Gardens);

        Assert.Equal(0, garden.PlacementCount);
        Assert.Equal(0, garden.VarietyCount);
        Assert.Equal(0, garden.OccupiedCells);
        Assert.Empty(garden.Placements);
        // NOT false: an unplanted garden is neither ornamental nor edible, and
        // false would make the Gardens widget wear an « Ornamental » chip — which
        // the product rule then reads as « never shows a harvest ».
        Assert.Null(garden.IsEdible);
    }

    [Fact]
    public async Task GetDashboard_GardenWithoutCellsJson_ShipsNullPlanAndStillCounts()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Sans plan", cellsJson: null);
        var plantId = await SeedPlantAsync("Hedera helix", await PlantTypeIdAsync("Ornamental"));
        await SeedPlacementAsync(gardenId, plantId, 2, 3);
        AuthAs(userId);

        var garden = Assert.Single((await GetDashboardAsync()).Gardens);

        // Null travels as null — the client's parseCellsJson(null, w, h) already
        // reads that as a full grid of active cells, so there is nothing to
        // invent here.
        Assert.Null(garden.CellsJson);
        Assert.Equal(1, garden.PlacementCount);
        Assert.Equal(1, garden.VarietyCount);
        Assert.Equal(1, garden.OccupiedCells);
    }

    // ── Stored data this server did not write ────────────────────────────────

    [Theory]
    // Not JSON at all — an export, a hand-edit, a truncated write.
    [InlineData("not json")]
    // Valid JSON, wrong shape: an object where the reader wants an array.
    [InlineData("{\"start\":\"08:00\"}")]
    // An array of the wrong element type.
    [InlineData("[1,2,3]")]
    // Truncated mid-document.
    [InlineData("[{\"start\":\"08:00\",")]
    public async Task GetDashboard_MalformedLightSchedule_DegradesToNull_AndStillServesTheGarden(
        string storedJson)
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Serre");
        await SetLightScheduleJsonAsync(gardenId, storedJson);
        var plantId = await SeedPlantAsync("Ocimum basilicum", await PlantTypeIdAsync("Herb"));
        await SeedPlacementAsync(gardenId, plantId, 0, 0);
        AuthAs(userId);

        // LightScheduleJson is an unconstrained text column: the two write paths
        // validate what they store, but exports preserve legacy raw values and
        // nothing stops a hand-edit. One malformed garden must not take the
        // whole dashboard down with it (round 1, E4 / G1).
        var response = await Client.GetAsync(Url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var garden = Assert.Single((await GetDashboardAsync()).Gardens);
        Assert.Null(garden.Config.LightSchedule);
        Assert.Equal(1, garden.PlacementCount);
    }

    [Fact]
    public async Task GetDashboard_MalformedLightScheduleOnOneGarden_StillServesTheOthers()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var broken = await SeedGardenAsync(userId, "Serre cassée");
        await SetLightScheduleJsonAsync(broken, "{ this is not a slot list }");
        await SeedGardenAsync(userId, "Terrasse saine");
        AuthAs(userId);

        var body = await GetDashboardAsync();

        Assert.Equal(2, body.Gardens.Count);
        Assert.All(body.Gardens, g => Assert.Null(g.Config.LightSchedule));
    }

    [Fact]
    public async Task GetDashboard_WellFormedLightSchedule_StillTravels()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Serre");
        await SetLightScheduleJsonAsync(gardenId, "[{\"start\":\"08:00\",\"end\":\"20:00\"}]");
        AuthAs(userId);

        var garden = Assert.Single((await GetDashboardAsync()).Gardens);

        // The tolerance must not swallow the valid case with it.
        var slot = Assert.Single(garden.Config.LightSchedule!);
        Assert.Equal("08:00", slot.Start);
        Assert.Equal("20:00", slot.End);
    }

    // ── Counters ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboard_SeededGardens_CountExactly()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Potager");
        var basil = await SeedPlantAsync("Ocimum basilicum", await PlantTypeIdAsync("Herb"));
        var fern = await SeedPlantAsync("Athyrium vidalii", await PlantTypeIdAsync("Ornamental"));

        await SeedPlacementAsync(gardenId, basil, 0, 0);
        await SeedPlacementAsync(gardenId, basil, 0, 1);
        await SeedPlacementAsync(gardenId, fern, 1, 0, spanRows: 2, spanCols: 3);
        AuthAs(userId);

        var body = await GetDashboardAsync();
        var garden = Assert.Single(body.Gardens);

        Assert.Equal(3, garden.PlacementCount);
        Assert.Equal(2, garden.VarietyCount);
        Assert.Equal(1 + 1 + 6, garden.OccupiedCells);

        // Busiest variety first.
        Assert.Equal(["Ocimum basilicum", "Athyrium vidalii"], body.Varieties.Select(v => v.ScientificName));
        Assert.Equal(2, body.Varieties[0].Count);
        Assert.Equal(2, body.Varieties[0].Cells);
        Assert.Equal(1, body.Varieties[1].Count);
        Assert.Equal(6, body.Varieties[1].Cells);

        Assert.Equal(1, body.Totals.GardenCount);
        Assert.Equal(3, body.Totals.PlacementCount);
        Assert.Equal(2, body.Totals.VarietyCount);
    }

    [Fact]
    public async Task GetDashboard_VarietyInTwoGardens_CountsOnceAndNamesBothGardens()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var first = await SeedGardenAsync(userId, "Balcon");
        var second = await SeedGardenAsync(userId, "Terrasse");
        var fern = await SeedPlantAsync("Athyrium vidalii", await PlantTypeIdAsync("Ornamental"));

        await SeedPlacementAsync(first, fern, 0, 0);
        await SeedPlacementAsync(second, fern, 0, 0);
        await SeedPlacementAsync(second, fern, 0, 1);
        AuthAs(userId);

        var body = await GetDashboardAsync();

        // Each garden counts its own variety once: 1 + 1 = 2 per-garden counts…
        Assert.Equal([1, 1], body.Gardens.Select(g => g.VarietyCount));
        // …but the page total is DISTINCT varieties (decision D11): one.
        Assert.Equal(1, body.Totals.VarietyCount);
        Assert.Equal(3, body.Totals.PlacementCount);

        var variety = Assert.Single(body.Varieties);
        Assert.Equal(3, variety.Count);
        Assert.Equal([first, second], variety.GardenIds.OrderBy(id => id == first ? 0 : 1));
        Assert.Equal(2, variety.GardenIds.Count);
    }

    [Fact]
    public async Task GetDashboard_CatalogPlantCount_IsReusedRatherThanCountedAgain()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        AuthAs(userId);

        var first = (await GetDashboardAsync()).Totals.CatalogPlantCount;

        // A plant lands between the two reads. The caption is ALLOWED to be
        // stale inside the window (round 1, E2): the catalog is reference data
        // an admin import writes, and re-scanning the table on every dashboard
        // load to keep a « … of N in the catalog » caption to the second is a
        // cost with no reader. Staleness is the contract, so it is what is
        // asserted — not tolerated silently.
        await SeedPlantAsync("Rosa gallica", await PlantTypeIdAsync("Ornamental"));

        var second = (await GetDashboardAsync()).Totals.CatalogPlantCount;

        Assert.Equal(first, second);
    }

    // ── The R4 edible rule ───────────────────────────────────────────────────

    /// <remarks>
    /// Round 1, E1 — the cases are stated with the NAMES the rule reads.
    /// <c>EdiblePlantTypes</c> in <c>DashboardController</c> matches on
    /// <c>PlantType.Name</c>; writing the theory as the integers 1 to 4 made it
    /// depend, invisibly at the assertion site, on both the existence of those
    /// ids and the id → name mapping of the seeded reference table. Reorder that
    /// seed and the theory kept passing while asserting a different rule, and its
    /// own <c>[InlineData]</c> comments became wrong with nothing to say so.
    /// <see cref="PlantTypeIdAsync"/> resolves the name and fails loudly when the
    /// row is gone.
    /// </remarks>
    [Theory]
    // Plant type says edible, the flag disagrees — 31 catalog plants are like this.
    [InlineData("Vegetable", false, true)]
    // The flag says edible, the type says ornamental — 38 catalog plants are like this.
    [InlineData("Ornamental", true, true)]
    // Neither says edible.
    [InlineData("Ornamental", false, false)]
    // The flag is unknown; the type is filled on every catalog row and decides alone.
    [InlineData("Ornamental", null, false)]
    [InlineData("Fruit", null, true)]
    // Named but NOT in the rule's list: « Medicinal » is a real seeded type and
    // the union must not quietly adopt it.
    [InlineData("Medicinal", null, false)]
    [InlineData("Herb", null, true)]
    public async Task GetDashboard_EdibleVerdictIsTheUnionOfTypeAndFlag(
        string plantTypeName,
        bool? isEdible,
        bool expected)
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Test");
        var plantId = await SeedPlantAsync(
            "Test plant",
            await PlantTypeIdAsync(plantTypeName),
            isEdible);
        await SeedPlacementAsync(gardenId, plantId, 0, 0);
        AuthAs(userId);

        var garden = Assert.Single((await GetDashboardAsync()).Gardens);

        Assert.Equal(expected, garden.IsEdible);
        // The type name also travels on the variety row, so the widget's own
        // half of R4 reads the same vocabulary the server judged with.
        Assert.Equal(plantTypeName, Assert.Single((await GetDashboardAsync()).Varieties).PlantType);
    }

    // ── One snapshot, not two reads (E3) ─────────────────────────────────────

    [Fact]
    public async Task GetDashboard_VarietyCountsAndGardenIdsComeFromTheSameSnapshot()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var first = await SeedGardenAsync(userId, "Balcon");
        var second = await SeedGardenAsync(userId, "Terrasse");
        var basil = await SeedPlantAsync("Ocimum basilicum", await PlantTypeIdAsync("Herb"));
        var fern = await SeedPlantAsync("Athyrium vidalii", await PlantTypeIdAsync("Ornamental"));

        await SeedPlacementAsync(first, basil, 0, 0);
        await SeedPlacementAsync(second, basil, 0, 0, spanRows: 2, spanCols: 2);
        await SeedPlacementAsync(second, fern, 1, 0);
        AuthAs(userId);

        var body = await GetDashboardAsync();

        // The invariants the second placement read could break: every counted
        // variety names at least one garden, and the three placement figures on
        // the page agree because they are now derived from ONE read.
        Assert.All(body.Varieties, v =>
        {
            Assert.True(v.Count > 0);
            Assert.NotEmpty(v.GardenIds);
        });
        Assert.Equal(body.Totals.PlacementCount, body.Varieties.Sum(v => v.Count));
        Assert.Equal(body.Totals.PlacementCount, body.Gardens.Sum(g => g.PlacementCount));
        Assert.Equal(
            body.Gardens.Sum(g => g.OccupiedCells),
            body.Varieties.Sum(v => v.Cells));

        // Every garden id a variety names is a garden the response also ships.
        var shipped = body.Gardens.Select(g => g.Id).ToHashSet();
        Assert.All(body.Varieties, v => Assert.All(v.GardenIds, id => Assert.Contains(id, shipped)));
    }

    [Fact]
    public async Task GetDashboard_OneEdibleAmongOrnamentals_MakesTheGardenEdible()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Mixte");
        var fern = await SeedPlantAsync("Athyrium vidalii", await PlantTypeIdAsync("Ornamental"));
        var basil = await SeedPlantAsync("Ocimum basilicum", await PlantTypeIdAsync("Herb"));

        await SeedPlacementAsync(gardenId, fern, 0, 0);
        await SeedPlacementAsync(gardenId, fern, 0, 1);
        await SeedPlacementAsync(gardenId, basil, 1, 0);
        AuthAs(userId);

        var garden = Assert.Single((await GetDashboardAsync()).Gardens);

        // « At least one », not « a majority »: declaring this garden ornamental
        // would erase a real harvest, while the reverse mistake only shows an
        // empty one.
        Assert.True(garden.IsEdible);
    }

    // ── Placement order ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboard_PlacementsAreOrderedByGridPosition()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Ordre");
        var plantId = await SeedPlantAsync("Iris germanica", await PlantTypeIdAsync("Ornamental"));

        // Inserted out of order on purpose.
        await SeedPlacementAsync(gardenId, plantId, 2, 5);
        await SeedPlacementAsync(gardenId, plantId, 0, 9);
        await SeedPlacementAsync(gardenId, plantId, 0, 1);
        await SeedPlacementAsync(gardenId, plantId, 1, 0);
        AuthAs(userId);

        var garden = Assert.Single((await GetDashboardAsync()).Gardens);

        Assert.Equal(
            [(0, 1), (0, 9), (1, 0), (2, 5)],
            garden.Placements.Select(p => (p.StartRow, p.StartCol)));
    }

    [Fact]
    public async Task GetDashboard_PlacementOrderSurvivesALayoutSave()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Ordre stable");
        var iris = await SeedPlantAsync("Iris germanica", await PlantTypeIdAsync("Ornamental"));
        var fern = await SeedPlantAsync("Athyrium vidalii", await PlantTypeIdAsync("Ornamental"));
        AuthAs(userId);

        // The layout PUT deletes every placement and re-inserts it, so `Id` and
        // `PlacedAt` are BOTH new afterwards. Saving the same arrangement twice
        // must not reshuffle the response — otherwise the names a card previews,
        // and the order of the variety pastilles, change under a user who
        // changed nothing.
        var layout = new
        {
            Width = 10,
            Height = 10,
            CellSize = "50cm",
            CellsJson = (string?)null,
            Placements = new object[]
            {
                new { PlantId = fern, StartRow = 3, StartCol = 1, SpanRows = 1, SpanCols = 1, Notes = (string?)null },
                new { PlantId = iris, StartRow = 0, StartCol = 4, SpanRows = 1, SpanCols = 1, Notes = (string?)null },
                new { PlantId = iris, StartRow = 0, StartCol = 0, SpanRows = 1, SpanCols = 1, Notes = (string?)null },
            },
        };

        var first = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", layout);
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        var before = (await GetDashboardAsync()).Gardens.Single().Placements
            .Select(p => (p.StartRow, p.StartCol, p.PlantId))
            .ToList();

        var second = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", layout);
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);
        var after = (await GetDashboardAsync()).Gardens.Single().Placements
            .Select(p => (p.StartRow, p.StartCol, p.PlantId))
            .ToList();

        Assert.Equal(before, after);
        Assert.Equal([(0, 0), (0, 4), (3, 1)], after.Select(p => (p.StartRow, p.StartCol)));
    }

    // ── Localisation ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboard_ServesTheRequestedLanguage_ThenEnglish()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Potager");
        var translated = await SeedPlantAsync("Ocimum basilicum", await PlantTypeIdAsync("Herb"));
        var englishOnly = await SeedPlantAsync("Hedera helix", await PlantTypeIdAsync("Ornamental"));
        var untranslated = await SeedPlantAsync("Athyrium vidalii", await PlantTypeIdAsync("Ornamental"));

        await SeedTranslationsAsync(translated, ("fr", "Basilic", null), ("en", "Basil", null));
        await SeedTranslationsAsync(englishOnly, ("en", "English ivy", null));

        await SeedPlacementAsync(gardenId, translated, 0, 0);
        await SeedPlacementAsync(gardenId, englishOnly, 1, 0);
        await SeedPlacementAsync(gardenId, untranslated, 2, 0);
        AuthAs(userId);

        var body = await GetDashboardAsync("fr");
        var byId = body.Varieties.ToDictionary(v => v.PlantId);

        Assert.Equal("Basilic", byId[translated].CommonName);
        Assert.Equal("English ivy", byId[englishOnly].CommonName);
        // No third-language guess: the client falls back to the scientific name.
        Assert.Null(byId[untranslated].CommonName);
    }

    // ── The variety avatar ───────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboard_PicksAStableCoverImage_WithItsAttribution()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var gardenId = await SeedGardenAsync(userId, "Potager");
        var withImages = await SeedPlantAsync("Ocimum basilicum", await PlantTypeIdAsync("Herb"));
        var withoutImages = await SeedPlantAsync("Athyrium vidalii", await PlantTypeIdAsync("Ornamental"));

        await SeedImagesAsync(
            withImages,
            (PlantSourceType.Trefle, PlantImageType.Leaf, "https://bs.plantnet.org/leaf.jpg", "Leaf credit"),
            // Habit outranks Leaf — the library's own cover priority.
            (PlantSourceType.Trefle, PlantImageType.Habit, "https://bs.plantnet.org/habit.jpg", "Habit credit"),
            // Perenual URLs expire (SMA-118) and must never be surfaced.
            (PlantSourceType.Perenual, PlantImageType.Main, "https://perenual.example/expired.jpg", "Perenual credit"));

        await SeedPlacementAsync(gardenId, withImages, 0, 0);
        await SeedPlacementAsync(gardenId, withoutImages, 1, 0);
        AuthAs(userId);

        var byId = (await GetDashboardAsync()).Varieties.ToDictionary(v => v.PlantId);

        Assert.Equal("https://bs.plantnet.org/habit.jpg", byId[withImages].ImageUrl);
        Assert.Equal("Habit credit", byId[withImages].ImageAttribution);
        // Null together, always: the widget may render the photo, so it must be
        // able to credit it.
        Assert.Null(byId[withoutImages].ImageUrl);
        Assert.Null(byId[withoutImages].ImageAttribution);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static string[] Keys(JsonElement element) =>
        [.. element.EnumerateObject().Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal)];

    private async Task<DashboardResponse> GetDashboardAsync(string? lang = null)
    {
        var url = lang is null ? Url : $"{Url}?lang={lang}";
        var body = await Client.GetFromJsonAsync<DashboardResponse>(url);
        Assert.NotNull(body);
        return body;
    }

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

    private async Task<Guid> SeedGardenAsync(
        string userId,
        string name,
        string? cellsJson = null,
        string? description = null)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = new Garden
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = description,
            UserId = userId,
            LayoutWidth = 10,
            LayoutHeight = 10,
            CellSize = "50cm",
            CellsJson = cellsJson,
            Hemisphere = "N",
            LatitudeBand = "mid",
        };
        db.Gardens.Add(garden);
        await db.SaveChangesAsync();
        return garden.Id;
    }

    /// <summary>
    /// Writes <c>LightScheduleJson</c> straight to the column, bypassing the API
    /// validators on purpose — the point is stored data this build did not write.
    /// </summary>
    private async Task SetLightScheduleJsonAsync(Guid gardenId, string json)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"UPDATE ""Gardens"" SET ""LightScheduleJson"" = {1} WHERE ""Id"" = {0};",
            gardenId,
            json);
    }

    /// <summary>
    /// The id of a SEEDED <c>PlantTypes</c> row, by the name the R4 rule reads.
    /// Fails with the available names rather than returning a wrong id.
    /// </summary>
    private async Task<int> PlantTypeIdAsync(string name)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var row = await db.PlantTypes.AsNoTracking().SingleOrDefaultAsync(t => t.Name == name);
        Assert.True(
            row is not null,
            $"No seeded PlantType named '{name}'. Seeded: "
                + string.Join(", ", await db.PlantTypes.AsNoTracking().Select(t => t.Name).ToListAsync()));
        return row!.Id;
    }

    private async Task<Guid> SeedPlantAsync(
        string scientificName,
        int plantTypeId,
        bool? isEdible = null)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = scientificName,
            PlantTypeId = plantTypeId,
            IsEdible = isEdible,
        };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    private async Task SeedPlacementAsync(
        Guid gardenId,
        Guid plantId,
        int row,
        int col,
        int spanRows = 1,
        int spanCols = 1)
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
            SpanRows = spanRows,
            SpanCols = spanCols,
            PlacedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private async Task SeedTranslationsAsync(
        Guid plantId,
        params (string Language, string CommonName, string? Description)[] translations)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        foreach (var (language, commonName, description) in translations)
        {
            db.PlantTranslations.Add(new PlantTranslation
            {
                PlantId = plantId,
                Language = language,
                CommonName = commonName,
                Description = description,
            });
        }
        await db.SaveChangesAsync();
    }

    private async Task SeedImagesAsync(
        Guid plantId,
        params (PlantSourceType Source, PlantImageType Type, string Url, string Credit)[] images)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var order = 0;
        foreach (var (source, type, url, credit) in images)
        {
            db.PlantImages.Add(new PlantImage
            {
                PlantId = plantId,
                Source = source,
                ImageType = type,
                Url = url,
                Credit = credit,
                DisplayOrder = order++,
            });
        }
        await db.SaveChangesAsync();
    }
}
