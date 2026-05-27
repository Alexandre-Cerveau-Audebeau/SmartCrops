using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Services;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for <c>POST /api/admin/bulk-import/preflight</c> — the
/// GBIF taxon-key overlap pre-flight (ADR-0004 layer b / SMA-45). The GBIF
/// resolver is replaced by <see cref="Stubs.StubPlantTaxonomyService"/> at
/// fixture boot, so each test enqueues canned resolutions in submission
/// order, then asserts on <c>intra_batch</c> / <c>db_existing</c> overlap
/// emission and on the request-shape validation guards.
/// </summary>
public class BulkImportPreflightControllerTests : IntegrationTestBase
{
    public BulkImportPreflightControllerTests(PostgresFixture fixture) : base(fixture) { }

    [Fact]
    public async Task Preflight_NoAuth_Returns401()
    {
        // Mirror the bulk-create [Authorize] test: pre-flight inherits the
        // same controller-level attribute, so an unauthenticated POST must
        // also surface 401 (not 400, not 500).
        var request = new BulkImportPreflightRequest(new List<PreflightCandidate>
        {
            new("Solanum lycopersicum", "vegetable"),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import/preflight", request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Preflight_EmptyCandidates_Returns400()
    {
        AuthAsAnyUser();
        var request = new BulkImportPreflightRequest(new List<PreflightCandidate>());

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import/preflight", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Preflight_AboveMaxCandidates_Returns400()
    {
        AuthAsAnyUser();
        var candidates = Enumerable.Range(0, BulkImportPreflightService.MaxCandidates + 1)
            .Select(i => new PreflightCandidate($"Species number{i}", "vegetable"))
            .ToList();
        var request = new BulkImportPreflightRequest(candidates);

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import/preflight", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Preflight_CleanBatch_NoOverlaps()
    {
        AuthAsAnyUser();
        // Two distinct names resolving to two distinct accepted keys — no
        // collision, no DB row to match against. CandidateCount=2,
        // NoMatchCount=0, Overlaps empty.
        Fixture.TaxonomyStub.Enqueue(new PlantTaxonomyResult(111, "Solanaceae", "Solanum", "lycopersicum", "EXACT", 98, "Solanum lycopersicum"));
        Fixture.TaxonomyStub.Enqueue(new PlantTaxonomyResult(222, "Lamiaceae", "Mentha", "piperita", "EXACT", 99, "Mentha piperita"));

        var request = new BulkImportPreflightRequest(new List<PreflightCandidate>
        {
            new("Solanum lycopersicum", "vegetable"),
            new("Mentha piperita", "herb"),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import/preflight", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportPreflightResponse>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.CandidateCount);
        Assert.Equal(0, body.NoMatchCount);
        Assert.Empty(body.Overlaps);
    }

    [Fact]
    public async Task Preflight_TwoCandidatesSameKey_EmitsIntraBatchOverlaps()
    {
        AuthAsAnyUser();
        // The rosemary case from ADR-0004 / batch-1: two distinct names that
        // both resolve to GBIF accepted key 10902460. The pre-flight must
        // emit ONE overlap per candidate (two rows total), both flagged
        // intra_batch, with each carrying the other as the partner.
        Fixture.TaxonomyStub.Enqueue(new PlantTaxonomyResult(10902460, "Lamiaceae", "Salvia", "rosmarinus", "EXACT", 99, "Salvia rosmarinus"));
        Fixture.TaxonomyStub.Enqueue(new PlantTaxonomyResult(10902460, "Lamiaceae", "Salvia", "rosmarinus", "EXACT", 99, "Salvia rosmarinus"));

        var request = new BulkImportPreflightRequest(new List<PreflightCandidate>
        {
            new("Rosmarinus officinalis", "herb"),
            new("Salvia rosmarinus", "herb"),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import/preflight", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportPreflightResponse>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.CandidateCount);
        Assert.Equal(0, body.NoMatchCount);
        Assert.Equal(2, body.Overlaps.Count);
        Assert.All(body.Overlaps, o =>
        {
            Assert.Equal("intra_batch", o.ConflictType);
            Assert.Equal(10902460, o.ResolvedAcceptedKey);
            Assert.Equal("EXACT", o.ResolvedMatchType);
        });
        // The partner field carries the OTHER candidate's name.
        var rosemaryRow = body.Overlaps.Single(o => o.CandidateScientificName == "Rosmarinus officinalis");
        var salviaRow = body.Overlaps.Single(o => o.CandidateScientificName == "Salvia rosmarinus");
        Assert.Contains("Salvia rosmarinus", rosemaryRow.ConflictingPartner);
        Assert.Contains("Rosmarinus officinalis", salviaRow.ConflictingPartner);
    }

    [Fact]
    public async Task Preflight_KeyAlreadyInDbUnderDifferentName_EmitsDbExistingOverlap()
    {
        AuthAsAnyUser();
        // Pre-seed a Plant carrying GbifTaxonKey 10902460 under the legacy
        // name "Rosmarinus officinalis" — same setup as the smoke duplicate
        // SMA-11 merged. The new candidate "Salvia rosmarinus" resolves to
        // the same key; pre-flight must flag it as db_existing with the
        // partner pointing at the persisted row.
        var existingId = await SeedPlantWithKeyAsync("Rosmarinus officinalis", plantTypeId: 3, gbifTaxonKey: 10902460);
        Fixture.TaxonomyStub.Enqueue(new PlantTaxonomyResult(10902460, "Lamiaceae", "Salvia", "rosmarinus", "EXACT", 99, "Salvia rosmarinus"));

        var request = new BulkImportPreflightRequest(new List<PreflightCandidate>
        {
            new("Salvia rosmarinus", "herb"),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import/preflight", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportPreflightResponse>();
        Assert.NotNull(body);
        Assert.Equal(1, body!.CandidateCount);
        Assert.Equal(0, body.NoMatchCount);
        var overlap = Assert.Single(body.Overlaps);
        Assert.Equal("db_existing", overlap.ConflictType);
        Assert.Equal("Salvia rosmarinus", overlap.CandidateScientificName);
        Assert.Equal(10902460, overlap.ResolvedAcceptedKey);
        Assert.Contains(existingId.ToString(), overlap.ConflictingPartner);
        Assert.Contains("Rosmarinus officinalis", overlap.ConflictingPartner);
    }

    [Fact]
    public async Task Preflight_NoMatchCandidate_CountedAndExcludedFromOverlapChecks()
    {
        AuthAsAnyUser();
        // One candidate GBIF cannot resolve (matchType=NONE → GbifTaxonKey=null).
        // It MUST count in NoMatchCount and MUST NOT generate any overlap row,
        // even though a DB row with the same name happens to exist.
        await SeedPlantWithKeyAsync("Nonexistent fakeus", plantTypeId: 1, gbifTaxonKey: 999);
        Fixture.TaxonomyStub.EnqueueNoMatch();

        var request = new BulkImportPreflightRequest(new List<PreflightCandidate>
        {
            new("Nonexistent fakeus", "vegetable"),
        });

        var response = await Client.PostAsJsonAsync("/api/admin/bulk-import/preflight", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BulkImportPreflightResponse>();
        Assert.NotNull(body);
        Assert.Equal(1, body!.CandidateCount);
        Assert.Equal(1, body.NoMatchCount);
        Assert.Empty(body.Overlaps);
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private async Task<Guid> SeedPlantWithKeyAsync(string scientificName, int plantTypeId, int gbifTaxonKey)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = scientificName,
            PlantTypeId = plantTypeId,
            GbifTaxonKey = gbifTaxonKey,
        };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    private void AuthAsAnyUser()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }
}
