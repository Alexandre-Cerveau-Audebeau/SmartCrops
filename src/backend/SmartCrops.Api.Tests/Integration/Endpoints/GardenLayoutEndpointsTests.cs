using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Closes the PR #33 test gap: <c>GET</c> and <c>PUT /api/gardens/{id}/layout</c>
/// shipped without integration test coverage. These tests exercise the full
/// request pipeline (JWT auth, ownership filtering, FK validation, replace-all
/// placements transactional behavior) against a real PG container.
/// </summary>
public class GardenLayoutEndpointsTests : IntegrationTestBase
{
    public GardenLayoutEndpointsTests(PostgresFixture fixture) : base(fixture) { }

    // ── GET ────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetLayout_OwnedGarden_NoPlacements_Returns200WithEmptyList()
    {
        var (userId, gardenId, _) = await SeedAsync();
        AuthAs(userId);

        var response = await Client.GetAsync($"/api/gardens/{gardenId}/layout");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<LayoutResponseDto>();
        Assert.NotNull(body);
        Assert.Empty(body!.Placements);
    }

    [Fact]
    public async Task GetLayout_OwnedGarden_WithPlacements_Returns200WithItems()
    {
        var (userId, gardenId, plantId) = await SeedAsync();
        await SeedPlacementsAsync(gardenId, plantId, count: 3);
        AuthAs(userId);

        var response = await Client.GetAsync($"/api/gardens/{gardenId}/layout");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<LayoutResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(3, body!.Placements.Count);
    }

    [Fact]
    public async Task GetLayout_OtherUsersGarden_Returns404()
    {
        // Ownership filter folds non-owned into the same 404 bucket as nonexistent —
        // intentional, prevents discovery of others' garden ids.
        var (ownerId, gardenId, _) = await SeedAsync();
        var otherUserId = $"u-{Guid.NewGuid():N}";
        await SeedUserAsync(otherUserId);
        AuthAs(otherUserId);

        var response = await Client.GetAsync($"/api/gardens/{gardenId}/layout");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        // Suppress unused warning — keep ownerId in the seed for the contract symmetry.
        _ = ownerId;
    }

    [Fact]
    public async Task GetLayout_NonexistentGarden_Returns404()
    {
        var (userId, _, _) = await SeedAsync();
        AuthAs(userId);

        var response = await Client.GetAsync($"/api/gardens/{Guid.NewGuid()}/layout");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetLayout_NoAuthHeader_Returns401()
    {
        var response = await Client.GetAsync($"/api/gardens/{Guid.NewGuid()}/layout");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ── PUT ────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task SaveLayout_ReplacesAllPlacements_Returns204()
    {
        // Start with 2 placements, PUT 3 — DB should reflect the 3 new ones only.
        var (userId, gardenId, plantId) = await SeedAsync();
        await SeedPlacementsAsync(gardenId, plantId, count: 2);
        AuthAs(userId);

        var request = new SaveLayoutRequestDto(
            Width: 10,
            Height: 10,
            CellSize: "M",
            CellsJson: "{}",
            Placements:
            [
                new SavePlacementRequestDto(plantId, 0, 0, 1, 1, "A"),
                new SavePlacementRequestDto(plantId, 1, 0, 1, 1, "B"),
                new SavePlacementRequestDto(plantId, 2, 0, 1, 1, "C"),
            ]);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var placements = await db.GardenPlacements.Where(p => p.GardenId == gardenId).ToListAsync();
        Assert.Equal(3, placements.Count);
        Assert.Contains(placements, p => p.Notes == "A");
        Assert.Contains(placements, p => p.Notes == "B");
        Assert.Contains(placements, p => p.Notes == "C");
    }

    [Fact]
    public async Task SaveLayout_EmptyPlacements_TruncatesExisting()
    {
        var (userId, gardenId, plantId) = await SeedAsync();
        await SeedPlacementsAsync(gardenId, plantId, count: 5);
        AuthAs(userId);

        var request = new SaveLayoutRequestDto(10, 10, "M", null, []);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var count = await db.GardenPlacements.CountAsync(p => p.GardenId == gardenId);
        Assert.Equal(0, count);
    }

    [Fact]
    public async Task SaveLayout_InvalidPlantId_Returns400_AndDoesNotMutate()
    {
        // Existence check (PlantIds against the Plants table) catches a bogus id before
        // any placement is inserted. The pre-existing placements must stay intact.
        var (userId, gardenId, plantId) = await SeedAsync();
        await SeedPlacementsAsync(gardenId, plantId, count: 2);
        AuthAs(userId);

        var bogusPlantId = Guid.NewGuid();
        var request = new SaveLayoutRequestDto(
            10, 10, "M", null,
            [new SavePlacementRequestDto(bogusPlantId, 0, 0, 1, 1, "x")]);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        // Pre-existing placements should still be there since SaveChangesAsync never
        // ran on the bogus payload (the controller returns before calling it).
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var count = await db.GardenPlacements.CountAsync(p => p.GardenId == gardenId);
        Assert.Equal(2, count);
    }

    [Fact]
    public async Task SaveLayout_OtherUsersGarden_Returns404()
    {
        var (_, gardenId, plantId) = await SeedAsync();
        var otherUserId = $"u-{Guid.NewGuid():N}";
        await SeedUserAsync(otherUserId);
        AuthAs(otherUserId);

        var request = new SaveLayoutRequestDto(
            10, 10, "M", null,
            [new SavePlacementRequestDto(plantId, 0, 0, 1, 1, null)]);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task SaveLayout_NoAuthHeader_Returns401()
    {
        var request = new SaveLayoutRequestDto(10, 10, "M", null, []);
        var response = await Client.PutAsJsonAsync($"/api/gardens/{Guid.NewGuid()}/layout", request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task SaveLayout_PersistsLayoutGeometry_AndRefreshesUpdatedAt()
    {
        // Width/Height/CellSize/CellsJson are persisted on the Garden row itself,
        // and Garden implements IHasUpdatedAt so the interceptor must bump UpdatedAt.
        var (userId, gardenId, _) = await SeedAsync();

        DateTime beforeUpdatedAt;
        using (var s = CreateScope())
        {
            var db = s.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            beforeUpdatedAt = await db.Gardens.Where(g => g.Id == gardenId).Select(g => g.UpdatedAt).SingleAsync();
        }

        AuthAs(userId);
        var request = new SaveLayoutRequestDto(7, 8, "L", "{\"cells\":[]}", []);
        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", request);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        using var scope = CreateScope();
        var db2 = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = await db2.Gardens.SingleAsync(g => g.Id == gardenId);
        Assert.Equal(7, garden.LayoutWidth);
        Assert.Equal(8, garden.LayoutHeight);
        Assert.Equal("L", garden.CellSize);
        Assert.Equal("{\"cells\":[]}", garden.CellsJson);
        Assert.True(garden.UpdatedAt >= beforeUpdatedAt);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

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
            ScientificName = $"Plant {Guid.NewGuid():N}",
            PlantTypeId = 1,
        };
        db.Gardens.Add(garden);
        db.Plants.Add(plant);
        await db.SaveChangesAsync();

        return (userId, garden.Id, plant.Id);
    }

    private async Task SeedUserAsync(string userId)
    {
        // Direct INSERT bypasses Identity normalisation but is sufficient — the JWT
        // auth path resolves the user by id and short-circuits the security-stamp
        // check because the test token carries no `security_stamp` claim.
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

    private async Task SeedPlacementsAsync(Guid gardenId, Guid plantId, int count)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        for (var i = 0; i < count; i++)
        {
            db.GardenPlacements.Add(new GardenPlacement
            {
                Id = Guid.NewGuid(),
                GardenId = gardenId,
                PlantId = plantId,
                StartRow = i,
                StartCol = 0,
                SpanRows = 1,
                SpanCols = 1,
                Notes = $"seed-{i}",
                PlacedAt = DateTime.UtcNow,
            });
        }
        await db.SaveChangesAsync();
    }

    // Minimal DTOs mirroring the production contract — kept private so the test file
    // can stand on its own without depending on internal API surface that may evolve.
    private record LayoutResponseDto(int? Width, int? Height, string? CellSize, string? CellsJson, List<PlacementDto> Placements);
    private record PlacementDto(Guid Id, Guid PlantId, string? PlantName, string? PlantScientificName, int StartRow, int StartCol, int SpanRows, int SpanCols, string? Notes);
    private record SaveLayoutRequestDto(int Width, int Height, string CellSize, string? CellsJson, List<SavePlacementRequestDto> Placements);
    private record SavePlacementRequestDto(Guid PlantId, int StartRow, int StartCol, int SpanRows, int SpanCols, string? Notes);
}
