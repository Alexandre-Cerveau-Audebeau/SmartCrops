using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for <c>POST /api/admin/bulk-import</c>. The service is the
/// real <c>BulkImportService</c> (no stubs — bulk-create is purely DB-bound),
/// so these tests verify the end-to-end contract: per-item dedup, plant-type
/// resolution by name, the no-default-plant-type rule, and the mixed-batch
/// counting invariant <c>Total = Created + Skipped + Failed</c>.
/// </summary>
public class BulkImportControllerTests : IntegrationTestBase
{
    public BulkImportControllerTests(PostgresFixture fixture) : base(fixture) { }

    [Fact]
    public async Task Create_NoAuth_Returns401()
    {
        var request = new BulkImportRequest(new List<BulkImportItem>
        {
            new("Solanum lycopersicum", "Vegetable"),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import", request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_AuthenticatedNonAdmin_Returns403()
    {
        AuthAsNonAdmin();
        var request = new BulkImportRequest(new List<BulkImportItem>
        {
            new("Solanum lycopersicum", "Vegetable"),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import", request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Create_ValidItems_CreatesPlants()
    {
        AuthAsAdmin();
        var request = new BulkImportRequest(new List<BulkImportItem>
        {
            new("Solanum lycopersicum", "Vegetable"),
            new("Mentha piperita", "Herb"),
            new("Rosa gallica", "Ornamental"),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportResult>();
        Assert.NotNull(body);
        Assert.Equal(3, body!.Total);
        Assert.Equal(3, body.Created);
        Assert.Equal(0, body.Skipped);
        Assert.Equal(0, body.Failed);
        Assert.Empty(body.FailedReasons);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(3, await db.Plants.CountAsync());

        // Plant-type FK resolved by NAME (case-insensitive), not silently
        // defaulted — the herb row must land on PlantTypeId = 3 (Herb), not 1.
        var herb = await db.Plants.SingleAsync(p => p.ScientificName == "Mentha piperita");
        Assert.Equal(3, herb.PlantTypeId);
    }

    [Fact]
    public async Task Create_DuplicateScientificName_Skips()
    {
        // Pre-seed the row so the dedup check fires against the existing-names
        // snapshot — bulk-create is additive, not destructive.
        await SeedPlantAsync("Solanum lycopersicum", plantTypeId: 1);
        AuthAsAdmin();

        var request = new BulkImportRequest(new List<BulkImportItem>
        {
            new("Solanum lycopersicum", "Vegetable"),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportResult>();
        Assert.NotNull(body);
        Assert.Equal(1, body!.Total);
        Assert.Equal(0, body.Created);
        Assert.Equal(1, body.Skipped);
        Assert.Equal(0, body.Failed);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(1, await db.Plants.CountAsync(p => p.ScientificName == "Solanum lycopersicum"));
    }

    [Fact]
    public async Task Create_UnknownPlantType_Fails()
    {
        AuthAsAdmin();
        var request = new BulkImportRequest(new List<BulkImportItem>
        {
            new("Solanum lycopersicum", "Nonexistent"),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportResult>();
        Assert.NotNull(body);
        Assert.Equal(1, body!.Total);
        Assert.Equal(0, body.Created);
        Assert.Equal(0, body.Skipped);
        Assert.Equal(1, body.Failed);
        Assert.Single(body.FailedReasons);
        Assert.Contains("unknown plant type", body.FailedReasons[0], StringComparison.OrdinalIgnoreCase);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(0, await db.Plants.CountAsync());
    }

    [Fact]
    public async Task Create_MissingPlantType_Fails()
    {
        // No generic default exists (PlantTypes seeded: Vegetable/Fruit/Herb/
        // Ornamental/Medicinal). The caller MUST classify each row; a missing
        // PlantType yields Failed rather than a silent fallback.
        AuthAsAdmin();
        var request = new BulkImportRequest(new List<BulkImportItem>
        {
            new("Solanum lycopersicum", null),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportResult>();
        Assert.NotNull(body);
        Assert.Equal(1, body!.Total);
        Assert.Equal(0, body.Created);
        Assert.Equal(0, body.Skipped);
        Assert.Equal(1, body.Failed);
        Assert.Single(body.FailedReasons);
        Assert.Contains("PlantType is required", body.FailedReasons[0]);
    }

    [Fact]
    public async Task Create_MixedBatch_CorrectCounts()
    {
        // Pin the Total = Created + Skipped + Failed invariant against a
        // single-batch mix: 2 valid + 1 duplicate + 1 unknown-type + 1
        // missing-type = 1 created + 1 skipped + 2 failed (the second valid
        // exercises that one Failed doesn't poison the next item's create).
        await SeedPlantAsync("Solanum lycopersicum", plantTypeId: 1);
        AuthAsAdmin();

        var request = new BulkImportRequest(new List<BulkImportItem>
        {
            new("Mentha piperita", "Herb"),                // valid → Created
            new("Solanum lycopersicum", "Vegetable"),      // duplicate → Skipped
            new("Lavandula angustifolia", "Nonexistent"),  // bad type → Failed
            new("Rosa gallica", null),                     // missing type → Failed
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportResult>();
        Assert.NotNull(body);
        Assert.Equal(4, body!.Total);
        Assert.Equal(1, body.Created);
        Assert.Equal(1, body.Skipped);
        Assert.Equal(2, body.Failed);
        Assert.Equal(body.Total, body.Created + body.Skipped + body.Failed);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        // The pre-seeded row + one Created; the two Failed items must not be
        // partially staged into the DB.
        Assert.Equal(2, await db.Plants.CountAsync());
        Assert.True(await db.Plants.AnyAsync(p => p.ScientificName == "Mentha piperita"));
        Assert.False(await db.Plants.AnyAsync(p => p.ScientificName == "Lavandula angustifolia"));
        Assert.False(await db.Plants.AnyAsync(p => p.ScientificName == "Rosa gallica"));
    }

    [Fact]
    public async Task Create_CaseVariantInSameRequest_DedupsToOne()
    {
        // CR PR #80 r1: two case-variant spellings of the same scientific name
        // shipped in the SAME request must dedup in-memory (case-insensitive)
        // to a single Created row — not crash the batch SaveChanges on the
        // unique index. Pins the in-batch case-insensitive dedup behaviour
        // introduced beyond the original prompt.
        AuthAsAdmin();
        var request = new BulkImportRequest(new List<BulkImportItem>
        {
            new("Mentha piperita", "Herb"),
            new("mentha piperita", "Herb"),  // same name, different case
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportResult>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.Total);
        Assert.Equal(1, body.Created);
        Assert.Equal(1, body.Skipped);
        Assert.Equal(0, body.Failed);
        Assert.Equal(body.Total, body.Created + body.Skipped + body.Failed);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        // Exactly one row in the DB — proves the unique-index backstop never
        // fired (we'd have rolled back instead, which would also be wrong here).
        var count = await db.Plants
            .CountAsync(p => EF.Functions.ILike(p.ScientificName, "mentha piperita"));
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task Create_CaseVariantAlreadyInDb_Skips()
    {
        // CR bulk-create follow-up #2: a case-variant of a scientific name
        // that ALREADY exists in the DB (seeded "Mentha piperita", request
        // ships "mentha piperita") must be deduped to Skipped — not silently
        // created as a second row. Before the LOWER-based dedup query +
        // functional unique index on LOWER(ScientificName), the case-sensitive
        // '=' lookup missed the existing row and the plain unique index
        // treated the variant as distinct bytes, silently creating a
        // duplicate. This test pins the fix.
        await SeedPlantAsync("Mentha piperita", plantTypeId: 3); // Herb
        AuthAsAdmin();
        var request = new BulkImportRequest(new List<BulkImportItem>
        {
            new("mentha piperita", "Herb"),  // lowercase variant of existing row
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportResult>();
        Assert.NotNull(body);
        Assert.Equal(1, body!.Total);
        Assert.Equal(0, body.Created);
        Assert.Equal(1, body.Skipped);
        Assert.Equal(0, body.Failed);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var count = await db.Plants
            .CountAsync(p => EF.Functions.ILike(p.ScientificName, "mentha piperita"));
        Assert.Equal(1, count);  // still one row — no case-variant duplicate
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private async Task<Guid> SeedPlantAsync(string scientificName, int plantTypeId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = scientificName,
            PlantTypeId = plantTypeId,
        };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    // SMA-33: these endpoints are gated to the Admin role. AuthAsAdmin mints a
    // token carrying the Admin role (happy path); AuthAsNonAdmin a plain
    // authenticated user (used to prove the 403 forbidden gate).
    private void AuthAsAdmin()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId, Roles.Admin));
    }

    private void AuthAsNonAdmin()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }
}
