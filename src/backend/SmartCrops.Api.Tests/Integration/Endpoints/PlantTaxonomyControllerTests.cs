using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for the GBIF admin enrichment endpoints. The
/// <see cref="SmartCrops.Core.Interfaces.IPlantTaxonomyService"/> is stubbed
/// at the DI layer (see <c>PostgresFixture</c>), so these tests verify the
/// ADR-0003 dual-write contract (PlantSource raw + Plant curated, single
/// transaction) without touching GBIF over HTTP.
/// </summary>
public class PlantTaxonomyControllerTests : IntegrationTestBase
{
    public PlantTaxonomyControllerTests(PostgresFixture fixture) : base(fixture) { }

    // ── enrich/{plantId} ───────────────────────────────────────────────

    [Fact]
    public async Task Enrich_NonExistentPlant_Returns404()
    {
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{Guid.NewGuid()}", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Enrich_NoAuth_Returns401()
    {
        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{Guid.NewGuid()}", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Enrich_Match_PerformsDualWrite()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TaxonomyStub.Enqueue(MatchResult(2930137, "Solanaceae", "Solanum", "lycopersicum"));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<MatchedResponseDto>();
        Assert.NotNull(body);
        Assert.True(body!.Matched);
        Assert.Equal(2930137, body.GbifTaxonKey);

        // Plant: curated fields updated, GbifEnriched flag set, LastEnrichmentAt fresh.
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Equal(2930137, plant.GbifTaxonKey);
        Assert.Equal("Solanaceae", plant.Family);
        Assert.Equal("Solanum", plant.Genus);
        Assert.Equal("lycopersicum", plant.SpeciesEpithet);
        Assert.True(plant.EnrichmentStatus.HasFlag(EnrichmentStatus.GbifEnriched));
        Assert.NotNull(plant.LastEnrichmentAt);

        // PlantSource: raw audit row written, ExternalId = stringified taxon key.
        var source = await db.PlantSources
            .SingleAsync(s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF);
        Assert.Equal("2930137", source.ExternalId);
        Assert.Equal("https://api.gbif.org/v1/species/2930137", source.Url);
        Assert.NotNull(source.LastFetchedAt);
    }

    [Fact]
    public async Task Enrich_AlreadyEnriched_SkipsWithoutForce()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TaxonomyStub.Enqueue(MatchResult(2930137, "Solanaceae", "Solanum", "lycopersicum"));
        AuthAsAnyUser();

        // First call writes the row + sets the flag.
        await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}", null);

        // Second call without ?force should short-circuit before touching the stub.
        var beforeCalls = Fixture.TaxonomyStub.ReceivedNames.Count;
        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SkippedResponseDto>();
        Assert.NotNull(body);
        Assert.True(body!.Skipped);
        Assert.Equal("AlreadyEnriched", body.Reason);
        Assert.Equal(beforeCalls, Fixture.TaxonomyStub.ReceivedNames.Count); // stub not invoked

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var sourceCount = await db.PlantSources.CountAsync(s => s.PlantId == plantId);
        Assert.Equal(1, sourceCount);
    }

    [Fact]
    public async Task Enrich_Force_UpdatesExistingSourceLastFetchedAt()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TaxonomyStub.Enqueue(MatchResult(2930137, "Solanaceae", "Solanum", "lycopersicum"));
        AuthAsAnyUser();

        await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}", null);

        DateTime firstFetchedAt;
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            firstFetchedAt = (await db.PlantSources
                .SingleAsync(s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF))
                .LastFetchedAt!.Value;
        }

        // Small delay so LastFetchedAt is observably newer on the second pass.
        await Task.Delay(15);

        Fixture.TaxonomyStub.Enqueue(MatchResult(2930137, "Solanaceae", "Solanum", "lycopersicum"));
        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}?force=true", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope2 = CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var sources = await db2.PlantSources
            .Where(s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF)
            .ToListAsync();
        Assert.Single(sources); // no duplicate row, just an update
        Assert.True(sources[0].LastFetchedAt > firstFetchedAt);
    }

    [Fact]
    public async Task Enrich_Force_WithDifferentTaxonKey_SyncsUrl()
    {
        // Regression: previously only ExternalId was updated on re-enrichment,
        // leaving Url pointing at the stale taxon key. Both must move together.
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TaxonomyStub.Enqueue(MatchResult(2930137, "Solanaceae", "Solanum", "lycopersicum"));
        AuthAsAnyUser();

        await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}", null);

        Fixture.TaxonomyStub.Enqueue(MatchResult(9999999, "Solanaceae", "Solanum", "lycopersicum"));
        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}?force=true", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var source = await db.PlantSources
            .SingleAsync(s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF);
        Assert.Equal("9999999", source.ExternalId);
        Assert.Equal("https://api.gbif.org/v1/species/9999999", source.Url);
    }

    [Fact]
    public async Task Enrich_NoMatch_DoesNotWriteSource_NorSetFlag()
    {
        var plantId = await SeedPlantAsync("Plantus inventicus");
        Fixture.TaxonomyStub.EnqueueNoMatch();
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<NoMatchResponseDto>();
        Assert.NotNull(body);
        Assert.False(body!.Matched);
        Assert.Equal("NONE", body.MatchType);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Null(plant.GbifTaxonKey);
        Assert.False(plant.EnrichmentStatus.HasFlag(EnrichmentStatus.GbifEnriched));

        var sourceCount = await db.PlantSources.CountAsync(s => s.PlantId == plantId);
        Assert.Equal(0, sourceCount);
    }

    // ── enrich-all ─────────────────────────────────────────────────────

    [Fact]
    public async Task EnrichAll_SkipsAlreadyEnriched_ByDefault()
    {
        // Seed 2 plants: one already enriched, one not. Without ?force, the
        // SQL filter on EnrichmentStatus excludes the enriched one upfront.
        var enrichedId = await SeedPlantAsync("Solanum lycopersicum", alreadyGbifEnriched: true);
        var pendingId = await SeedPlantAsync("Daucus carota");

        Fixture.TaxonomyStub.Enqueue(MatchResult(2706302, "Apiaceae", "Daucus", "carota"));
        AuthAsAnyUser();

        var response = await Client.PostAsync("/api/admin/taxonomy/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(1, body!.Total);     // only the pending one was loaded
        Assert.Equal(1, body.Matched);
        Assert.Equal(0, body.NotMatched);
        Assert.Equal(0, body.Skipped);    // not counted because never loaded
        Assert.Equal(0, body.Failed);

        // Sanity: only the previously-pending plant was passed to the stub.
        var seen = Fixture.TaxonomyStub.ReceivedNames;
        Assert.Single(seen);
        Assert.Equal("Daucus carota", seen[0]);

        // The enriched plant didn't get touched.
        _ = enrichedId;
        _ = pendingId;
    }

    [Fact]
    public async Task EnrichAll_MixedOutcomes_CountedCorrectly()
    {
        // 3 plants: 1 match, 1 NONE, 1 match. Order is by insertion (no sort).
        await SeedPlantAsync("Solanum lycopersicum");
        await SeedPlantAsync("Plantus inventicus");
        await SeedPlantAsync("Daucus carota");

        Fixture.TaxonomyStub.Enqueue(MatchResult(2930137, "Solanaceae", "Solanum", "lycopersicum"));
        Fixture.TaxonomyStub.EnqueueNoMatch();
        Fixture.TaxonomyStub.Enqueue(MatchResult(2706302, "Apiaceae", "Daucus", "carota"));
        AuthAsAnyUser();

        var response = await Client.PostAsync("/api/admin/taxonomy/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(3, body!.Total);
        Assert.Equal(2, body.Matched);
        Assert.Equal(1, body.NotMatched);
        Assert.Equal(0, body.Skipped);
        Assert.Equal(0, body.Failed);
    }

    [Fact]
    public async Task EnrichAll_Force_ReprocessesEnrichedPlants()
    {
        await SeedPlantAsync("Solanum lycopersicum", alreadyGbifEnriched: true);
        await SeedPlantAsync("Daucus carota", alreadyGbifEnriched: true);

        Fixture.TaxonomyStub.Enqueue(MatchResult(2930137, "Solanaceae", "Solanum", "lycopersicum"));
        Fixture.TaxonomyStub.Enqueue(MatchResult(2706302, "Apiaceae", "Daucus", "carota"));
        AuthAsAnyUser();

        var response = await Client.PostAsync("/api/admin/taxonomy/enrich-all?force=true", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.Total);
        Assert.Equal(2, body.Matched);
        Assert.Equal(0, body.Skipped);
    }

    [Fact]
    public async Task EnrichAll_WithLimit_ProcessesOnlyChunkAndReportsRemaining()
    {
        // 3 pending plants, chunk of 2 → first call enriches 2 and reports
        // 1 still in the !GbifEnriched filter (PR 2a-2 contract).
        await SeedPlantAsync("Solanum lycopersicum");
        await SeedPlantAsync("Daucus carota");
        await SeedPlantAsync("Plantus inventicus");

        Fixture.TaxonomyStub.Enqueue(MatchResult(2930137, "Solanaceae", "Solanum", "lycopersicum"));
        Fixture.TaxonomyStub.Enqueue(MatchResult(2706302, "Apiaceae", "Daucus", "carota"));
        AuthAsAnyUser();

        var response = await Client.PostAsync("/api/admin/taxonomy/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.Total);
        Assert.Equal(2, body.Matched);
        Assert.Equal(1, body.NotEnrichedRemaining);
    }

    [Fact]
    public async Task EnrichAll_TwoConsecutiveChunks_AdvancedByCursor_NoOverlap()
    {
        // 4 pending plants x two limit=2 calls (cursor-driven) = all 4
        // enriched exactly once. The second chunk uses afterId from the
        // first response so the seek window strictly advances.
        await SeedPlantAsync("Aaa species");
        await SeedPlantAsync("Bbb species");
        await SeedPlantAsync("Ccc species");
        await SeedPlantAsync("Ddd species");

        Fixture.TaxonomyStub.Enqueue(MatchResult(1, "F1", "G1", "s1"));
        Fixture.TaxonomyStub.Enqueue(MatchResult(2, "F2", "G2", "s2"));
        Fixture.TaxonomyStub.Enqueue(MatchResult(3, "F3", "G3", "s3"));
        Fixture.TaxonomyStub.Enqueue(MatchResult(4, "F4", "G4", "s4"));
        AuthAsAnyUser();

        var chunk1 = await Client.PostAsync("/api/admin/taxonomy/enrich-all?limit=2", null);
        var body1 = await chunk1.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body1);
        Assert.Equal(2, body1!.Total);
        Assert.Equal(2, body1.NotEnrichedRemaining);
        Assert.NotNull(body1.NextAfterId);

        var chunk2 = await Client.PostAsync(
            $"/api/admin/taxonomy/enrich-all?limit=2&afterId={body1.NextAfterId}", null);
        var body2 = await chunk2.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body2);
        Assert.Equal(2, body2!.Total);
        Assert.Equal(0, body2.NotEnrichedRemaining);
        Assert.NotNull(body2.NextAfterId);

        var seen = Fixture.TaxonomyStub.ReceivedNames;
        Assert.Equal(4, seen.Count);
        Assert.Equal(4, seen.Distinct().Count());
    }

    [Fact]
    public async Task EnrichAll_WithAfterId_SkipsPlantsAtOrBeforeCursor()
    {
        // Seed 3 plants, then call with afterId = smallest seeded Id.
        // The cursor must exclude that plant AND anything smaller, leaving
        // exactly the 2 strictly-larger Ids in this chunk.
        await SeedPlantAsync("AlphaSpecies one");
        await SeedPlantAsync("AlphaSpecies two");
        await SeedPlantAsync("AlphaSpecies three");

        Guid cursor;
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            cursor = await db.Plants
                .Where(p => p.ScientificName.StartsWith("AlphaSpecies "))
                .OrderBy(p => p.Id)
                .Select(p => p.Id)
                .FirstAsync();
        }

        Fixture.TaxonomyStub.Enqueue(MatchResult(10, "F", "G", "s10"));
        Fixture.TaxonomyStub.Enqueue(MatchResult(11, "F", "G", "s11"));
        AuthAsAnyUser();

        var response = await Client.PostAsync(
            $"/api/admin/taxonomy/enrich-all?afterId={cursor}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.Total);
        Assert.Equal(2, body.Matched);
        // The plant at the cursor was never loaded, so it's still pending.
        Assert.Equal(1, body.NotEnrichedRemaining);
    }

    [Fact]
    public async Task EnrichAll_ReturnsNextAfterId_AsMaxProcessedId()
    {
        // NextAfterId must equal the largest Id the chunk actually processed
        // -- the contract the driver relies on to advance.
        await SeedPlantAsync("Beta one");
        await SeedPlantAsync("Beta two");
        await SeedPlantAsync("Beta three");

        Fixture.TaxonomyStub.Enqueue(MatchResult(20, "F", "G", "s20"));
        Fixture.TaxonomyStub.Enqueue(MatchResult(21, "F", "G", "s21"));
        AuthAsAnyUser();

        var response = await Client.PostAsync("/api/admin/taxonomy/enrich-all?limit=2", null);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.Total);
        Assert.NotNull(body.NextAfterId);

        Guid expectedMax;
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var firstTwo = await db.Plants
                .OrderBy(p => p.Id)
                .Select(p => p.Id)
                .Take(2)
                .ToListAsync();
            expectedMax = firstTwo[^1];
        }
        Assert.Equal(expectedMax, body.NextAfterId);
    }

    [Fact]
    public async Task EnrichAll_UnmatchableFrontBlock_StillReachesTail()
    {
        // REGRESSION for CR r1 #2: a front block of unmatchable plants must
        // NOT stall the cursor. Pre-PR-2a-2-r2, OrderBy(Id).Take + a stalled
        // guard halted the phase as soon as the head of the !flagged set
        // returned only NoMatch -- larger Ids were never attempted. With
        // keyset pagination, the cursor advances past the unmatchables and
        // chunk 2 reaches the tail.
        await SeedPlantAsync("Frontblock one");   // Id-sorted positions 1..4
        await SeedPlantAsync("Frontblock two");
        await SeedPlantAsync("Frontblock three");
        await SeedPlantAsync("Frontblock four");

        // FIFO stub. EnrichAll iterates plantIds in OrderBy(Id), so positions
        // 1,2 see NoMatch and 3,4 see Match.
        Fixture.TaxonomyStub.EnqueueNoMatch();
        Fixture.TaxonomyStub.EnqueueNoMatch();
        Fixture.TaxonomyStub.Enqueue(MatchResult(30, "F", "G", "s30"));
        Fixture.TaxonomyStub.Enqueue(MatchResult(31, "F", "G", "s31"));
        AuthAsAnyUser();

        var chunk1 = await Client.PostAsync("/api/admin/taxonomy/enrich-all?limit=2", null);
        var body1 = await chunk1.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body1);
        Assert.Equal(2, body1!.Total);
        Assert.Equal(0, body1.Matched);
        Assert.Equal(2, body1.NotMatched);
        Assert.NotNull(body1.NextAfterId);
        // Critical: remaining did NOT decrease (4 -> 4), the symptom that
        // tripped the old stalled guard. The cursor proceeds anyway.
        Assert.Equal(4, body1.NotEnrichedRemaining);

        var chunk2 = await Client.PostAsync(
            $"/api/admin/taxonomy/enrich-all?limit=2&afterId={body1.NextAfterId}", null);
        var body2 = await chunk2.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body2);
        Assert.Equal(2, body2!.Total);
        Assert.Equal(2, body2.Matched);
        Assert.Equal(2, body2.NotEnrichedRemaining);

        // The two tail plants are now flagged -- proof the cursor reached
        // them.
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var tailFlagged = await db.Plants
            .Where(p => p.ScientificName.StartsWith("Frontblock "))
            .OrderBy(p => p.Id)
            .Skip(2)
            .CountAsync(p => (p.EnrichmentStatus & EnrichmentStatus.GbifEnriched) != 0);
        Assert.Equal(2, tailFlagged);
    }

    [Fact]
    public async Task EnrichAll_FailedPlant_RemainsUnflagged_RetriedOnFreshRun()
    {
        // Hardening proof for CR r2 B-1 (PR #82): the seek cursor advances
        // PAST a plant that threw during enrichment (Failed++, no flag) -- by
        // design, to avoid the "rethrow = poison-pill" and "last-successful-id =
        // re-stall" failure modes. The guarantee that no failed plant is lost
        // relies on (a) no state file in the driver, so afterId resets to null
        // every run, and (b) the SQL filter still seeing the !flagged plant
        // at the head of the remaining set on the next run.
        await SeedPlantAsync("Failed alpha");
        await SeedPlantAsync("Failed beta");

        // The controller iterates plantIds in OrderBy(Id), but Guid.NewGuid()
        // is randomized, so resolve which seeded id is smaller before queuing
        // the FIFO outcomes.
        Guid pSmallerId;
        Guid pLargerId;
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var ordered = await db.Plants
                .Where(p => p.ScientificName.StartsWith("Failed "))
                .OrderBy(p => p.Id)
                .Select(p => p.Id)
                .ToListAsync();
            pSmallerId = ordered[0];
            pLargerId = ordered[1];
        }

        // Chunk 1 (limit=2): smaller throws -> Failed=1, no flag.
        // Larger matches -> flagged.
        Fixture.TaxonomyStub.EnqueueFailure(new InvalidOperationException("transient upstream blip"));
        Fixture.TaxonomyStub.Enqueue(MatchResult(100, "F", "G", "s100"));
        AuthAsAnyUser();

        var chunk1 = await Client.PostAsync("/api/admin/taxonomy/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, chunk1.StatusCode);
        var body1 = await chunk1.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body1);
        Assert.Equal(2, body1!.Total);
        Assert.Equal(1, body1.Matched);
        Assert.Equal(0, body1.NotMatched);
        Assert.Equal(1, body1.Failed);
        // The cursor is the max processed Id, NOT the last successful Id --
        // this is the trade-off the test pins.
        Assert.Equal(pLargerId, body1.NextAfterId);
        // One plant remains in !GbifEnriched: the failed one.
        Assert.Equal(1, body1.NotEnrichedRemaining);

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var pSmaller = await db.Plants.SingleAsync(p => p.Id == pSmallerId);
            var pLarger = await db.Plants.SingleAsync(p => p.Id == pLargerId);
            Assert.False(pSmaller.EnrichmentStatus.HasFlag(EnrichmentStatus.GbifEnriched));
            Assert.True(pLarger.EnrichmentStatus.HasFlag(EnrichmentStatus.GbifEnriched));
        }

        // "Fresh run": no afterId (the driver holds no state file). The
        // SQL filter excludes the larger plant (now flagged) and re-selects
        // the smaller one at the head of the remaining set.
        Fixture.TaxonomyStub.Enqueue(MatchResult(101, "F", "G", "s101"));

        var freshRun = await Client.PostAsync("/api/admin/taxonomy/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, freshRun.StatusCode);
        var body2 = await freshRun.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body2);
        // Only the previously-failed plant is in the remaining set.
        Assert.Equal(1, body2!.Total);
        Assert.Equal(1, body2.Matched);
        Assert.Equal(0, body2.Failed);
        Assert.Equal(0, body2.NotEnrichedRemaining);

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var pSmaller = await db.Plants.SingleAsync(p => p.Id == pSmallerId);
            // The proof: a plant that failed in chunk 1 is now enriched on
            // the next run. Never lost.
            Assert.True(pSmaller.EnrichmentStatus.HasFlag(EnrichmentStatus.GbifEnriched));
        }
    }

    [Fact]
    public async Task EnrichAll_NoLimit_ReturnsRemainingZeroAfterFullRun()
    {
        // Regression: omitting ?limit preserves the pre-PR-2a-2 full-run
        // behaviour. After the loop every pending plant is flagged, so
        // NotEnrichedRemaining is 0.
        await SeedPlantAsync("Solanum lycopersicum");
        await SeedPlantAsync("Daucus carota");

        Fixture.TaxonomyStub.Enqueue(MatchResult(2930137, "Solanaceae", "Solanum", "lycopersicum"));
        Fixture.TaxonomyStub.Enqueue(MatchResult(2706302, "Apiaceae", "Daucus", "carota"));
        AuthAsAnyUser();

        var response = await Client.PostAsync("/api/admin/taxonomy/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.Total);
        Assert.Equal(2, body.Matched);
        Assert.Equal(0, body.NotEnrichedRemaining);
    }

    // ── helpers ────────────────────────────────────────────────────────

    private static PlantTaxonomyResult MatchResult(int key, string family, string genus, string epithet) =>
        new(key, family, genus, epithet, "EXACT", 99, $"{genus} {epithet}");

    private async Task<Guid> SeedPlantAsync(string scientificName, bool alreadyGbifEnriched = false)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = scientificName,
            PlantTypeId = 1,
            EnrichmentStatus = alreadyGbifEnriched
                ? EnrichmentStatus.Manual | EnrichmentStatus.GbifEnriched
                : EnrichmentStatus.Manual,
        };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    private void AuthAsAnyUser()
    {
        // The endpoint only enforces [Authorize] (any authenticated principal),
        // and the JWT validation pipeline short-circuits the security-stamp
        // check when no security_stamp claim is present (see PostgresFixture).
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }

    private record MatchedResponseDto(
        bool Matched,
        int? GbifTaxonKey,
        string? Family,
        string? Genus,
        string MatchType,
        int? Confidence);

    private record NoMatchResponseDto(bool Matched, string MatchType);

    private record SkippedResponseDto(bool Skipped, string Reason);

    private record EnrichAllResponseDto(
        int Total,
        int Matched,
        int NotMatched,
        int Skipped,
        int Failed,
        int NotEnrichedRemaining,
        Guid? NextAfterId);
}
