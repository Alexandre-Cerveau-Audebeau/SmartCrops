using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Authorization;
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
        AuthAsAdmin();

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
    public async Task Enrich_AuthenticatedNonAdmin_Returns403()
    {
        AuthAsNonAdmin();

        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{Guid.NewGuid()}", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Enrich_Match_PerformsDualWrite()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TaxonomyStub.Enqueue(MatchResult(2930137, "Solanaceae", "Solanum", "lycopersicum"));
        AuthAsAdmin();

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
        AuthAsAdmin();

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
        AuthAsAdmin();

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
        AuthAsAdmin();

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
        AuthAsAdmin();

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
        AuthAsAdmin();

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
        AuthAsAdmin();

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
        AuthAsAdmin();

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
        AuthAsAdmin();

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
        AuthAsAdmin();

        var chunk1 = await Client.PostAsync("/api/admin/taxonomy/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, chunk1.StatusCode);
        var body1 = await chunk1.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body1);
        Assert.Equal(2, body1!.Total);
        Assert.Equal(2, body1.NotEnrichedRemaining);
        Assert.NotNull(body1.NextAfterId);

        var chunk2 = await Client.PostAsync(
            $"/api/admin/taxonomy/enrich-all?limit=2&afterId={body1.NextAfterId}", null);
        Assert.Equal(HttpStatusCode.OK, chunk2.StatusCode);
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
        AuthAsAdmin();

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
        AuthAsAdmin();

        var response = await Client.PostAsync("/api/admin/taxonomy/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
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
        AuthAsAdmin();

        var chunk1 = await Client.PostAsync("/api/admin/taxonomy/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, chunk1.StatusCode);
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
        Assert.Equal(HttpStatusCode.OK, chunk2.StatusCode);
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
        AuthAsAdmin();

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

    // ── SMA-46 layer (c): DuplicateTaxonKey resilience ───────────────────

    [Fact]
    public async Task Enrich_NoTaxonKeyConflict_ProceedsThroughTryCatch_Matches()
    {
        // Regression guard for the SMA-46 try/catch wrapper on SaveChangesAsync.
        // A clean enrich must traverse the new try block, NOT enter the
        // DuplicateTaxonKey catch, commit the transaction, persist the key,
        // and return EnrichMatchedResponse. Existing happy-path test
        // (Enrich_Match_PerformsDualWrite) verifies dual-write semantics;
        // this one specifically pins that the catch wrapper is invisible
        // on the no-conflict path.
        var plantId = await SeedPlantAsync("Carum carvi");
        Fixture.TaxonomyStub.Enqueue(MatchResult(2967319, "Apiaceae", "Carum", "carvi"));
        AuthAsAdmin();

        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<MatchedResponseDto>();
        Assert.NotNull(body);
        Assert.True(body!.Matched);
        Assert.Equal(2967319, body.GbifTaxonKey);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Equal(2967319, plant.GbifTaxonKey);
        Assert.True(plant.EnrichmentStatus.HasFlag(EnrichmentStatus.GbifEnriched));
    }

    [Fact]
    public async Task Enrich_KeyHeldByAnotherPlant_ReturnsSkippedDuplicateTaxonKey_AndRollsBack()
    {
        // ADR-0004 layer (c) — the canonical drift case: a previously-enriched
        // plant (winner) owns GbifTaxonKey 2856037; a second plant (loser)
        // with a different ScientificName resolves to the same key. The
        // partial-unique index IX_Plants_GbifTaxonKey raises 23505 on flush;
        // the new catch classifies the outcome as Skipped/DuplicateTaxonKey
        // instead of Failed, rolls back the staged writes (loser stays
        // !GbifEnriched, no orphan PlantSources row), and keeps the winner
        // untouched.
        var winnerId = await SeedPlantWithKeyAsync("Allium porrum", gbifTaxonKey: 2856037);
        var loserId = await SeedPlantAsync("Allium ampeloprasum");
        Fixture.TaxonomyStub.Enqueue(MatchResult(2856037, "Amaryllidaceae", "Allium", "ampeloprasum"));
        AuthAsAdmin();

        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{loserId}", null);

        // 200 OK with EnrichSkippedResponse(true, "DuplicateTaxonKey").
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SkippedResponseDto>();
        Assert.NotNull(body);
        Assert.True(body!.Skipped);
        Assert.Equal("DuplicateTaxonKey", body.Reason);

        // The transaction rolled back: loser stays !GbifEnriched, has no
        // GbifTaxonKey, no PlantSources row, and the winner is unchanged.
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var loser = await db.Plants.SingleAsync(p => p.Id == loserId);
        Assert.Null(loser.GbifTaxonKey);
        Assert.False(loser.EnrichmentStatus.HasFlag(EnrichmentStatus.GbifEnriched));
        Assert.Equal(0, await db.PlantSources.CountAsync(s => s.PlantId == loserId));

        var winner = await db.Plants.SingleAsync(p => p.Id == winnerId);
        Assert.Equal(2856037, winner.GbifTaxonKey);
    }

    [Fact]
    public async Task EnrichAll_OneDuplicateKeyMidBatch_CountsAsSkipped_NotFailed_BatchContinues()
    {
        // Batch-level pin for SMA-46: a 23505 mid-batch must not poison the
        // remaining plants AND must aggregate to skipped++ (not failed++),
        // so a single drift collision doesn't trigger the driver's "Failed"
        // mop-up warning (Enrich-AllSources.ps1 L169).
        var winnerId = await SeedPlantWithKeyAsync("Allium porrum", gbifTaxonKey: 2856037);
        var loserId = await SeedPlantAsync("Allium ampeloprasum");
        var bystanderId = await SeedPlantAsync("Daucus carota");

        // Determine cursor order so we can queue stub outcomes in the right
        // FIFO position (Enrich iterates plantIds in OrderBy(Id), and the
        // winner is excluded upfront — it's already GbifEnriched).
        Guid firstPendingId;
        Guid secondPendingId;
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var ordered = await db.Plants
                .Where(p => p.Id == loserId || p.Id == bystanderId)
                .OrderBy(p => p.Id)
                .Select(p => p.Id)
                .ToListAsync();
            firstPendingId = ordered[0];
            secondPendingId = ordered[1];
        }

        // FIFO queue matches OrderBy(Id) iteration. Whichever of loser/bystander
        // is first gets its outcome enqueued first.
        if (firstPendingId == loserId)
        {
            Fixture.TaxonomyStub.Enqueue(MatchResult(2856037, "Amaryllidaceae", "Allium", "ampeloprasum"));
            Fixture.TaxonomyStub.Enqueue(MatchResult(2706302, "Apiaceae", "Daucus", "carota"));
        }
        else
        {
            Fixture.TaxonomyStub.Enqueue(MatchResult(2706302, "Apiaceae", "Daucus", "carota"));
            Fixture.TaxonomyStub.Enqueue(MatchResult(2856037, "Amaryllidaceae", "Allium", "ampeloprasum"));
        }
        AuthAsAdmin();

        var response = await Client.PostAsync("/api/admin/taxonomy/enrich-all", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.Total);          // 2 pending (winner excluded upfront)
        Assert.Equal(1, body.Matched);         // bystander
        Assert.Equal(0, body.NotMatched);
        Assert.Equal(1, body.Skipped);         // loser, classified DuplicateTaxonKey
        Assert.Equal(0, body.Failed);          // NOT failed
        Assert.Equal(body.Total, body.Matched + body.NotMatched + body.Skipped + body.Failed);

        // Bystander committed; loser still pending. Block-scoped using to
        // match the cursor-ordering scope above (mixing using-declaration
        // and using-statement on the same name in one method is CS0136).
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var bystander = await db.Plants.SingleAsync(p => p.Id == bystanderId);
            Assert.True(bystander.EnrichmentStatus.HasFlag(EnrichmentStatus.GbifEnriched));
            var loser = await db.Plants.SingleAsync(p => p.Id == loserId);
            Assert.False(loser.EnrichmentStatus.HasFlag(EnrichmentStatus.GbifEnriched));
            Assert.Null(loser.GbifTaxonKey);
        }
        _ = winnerId; // referenced only by SeedPlantWithKeyAsync side effect
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
        AuthAsAdmin();

        var response = await Client.PostAsync("/api/admin/taxonomy/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.Total);
        Assert.Equal(2, body.Matched);
        Assert.Equal(0, body.NotEnrichedRemaining);
    }

    // ── SMA-71: raw capture + Author ───────────────────────────────────

    [Fact]
    public async Task Enrich_PersistsRawResponseJson_OnGbifSource_AndAuthor()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.TaxonomyStub.Enqueue(MatchResultRich(
            2930137, author: "L.", raw: "{\"matchType\":\"EXACT\",\"kingdom\":\"Plantae\"}"));
        AuthAsAdmin();

        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var source = await db.PlantSources.SingleAsync(
            s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF);
        Assert.NotNull(source.RawResponseJson);
        // jsonb survives the unmapped field — substring is stable across formatting.
        Assert.Contains("Plantae", source.RawResponseJson!);
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Equal("L.", plant.Author);
    }

    [Fact]
    public async Task Enrich_Author_FirstWriterWins_DoesNotOverwriteExisting()
    {
        // Seed a plant whose Author was already set (e.g. by a Manual source).
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        using (var seed = CreateScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            (await db.Plants.SingleAsync(p => p.Id == plantId)).Author = "Existing Author";
            await db.SaveChangesAsync();
        }
        Fixture.TaxonomyStub.Enqueue(MatchResultRich(2930137, author: "L.", raw: "{}"));
        AuthAsAdmin();

        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}?force=true", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db2 = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal("Existing Author", (await db2.Plants.SingleAsync(p => p.Id == plantId)).Author);
    }

    [Fact]
    public async Task Enrich_MatchWithNullRaw_DoesNotErasePreviouslyCapturedBody()
    {
        // Loss-proof guard (CR r1): a re-fetch that matches but returns a null
        // body must PRESERVE a previously captured RawResponseJson, not null it.
        var plantId = await SeedPlantWithGbifSourceAsync("Solanum lycopersicum");
        using (var seed = CreateScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var src = await db.PlantSources.SingleAsync(
                s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF);
            src.RawResponseJson = "{\"matchType\":\"EXACT\",\"kingdom\":\"Plantae\"}";
            await db.SaveChangesAsync();
        }
        // Force re-enrich returns a MATCH but a null literal (the edge case).
        Fixture.TaxonomyStub.Enqueue(MatchResultRich(2930137, author: "L.", raw: null));
        AuthAsAdmin();

        var response = await Client.PostAsync($"/api/admin/taxonomy/enrich/{plantId}?force=true", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db2 = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var source = await db2.PlantSources.SingleAsync(
            s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF);
        // Prior body survived the null re-fetch.
        Assert.Contains("Plantae", source.RawResponseJson!);
    }

    // ── gbif/raw-backfill ──────────────────────────────────────────────

    [Fact]
    public async Task BackfillGbifRaw_NoAuth_Returns401()
    {
        var response = await Client.PostAsync("/api/admin/taxonomy/gbif/raw-backfill", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task BackfillGbifRaw_AuthenticatedNonAdmin_Returns403()
    {
        AuthAsNonAdmin();
        var response = await Client.PostAsync("/api/admin/taxonomy/gbif/raw-backfill", null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task BackfillGbifRaw_Admin_PopulatesRawAndAuthor_AndIsIdempotent()
    {
        // A plant with a Gbif source but no raw/author yet (pre-backfill state).
        var plantId = await SeedPlantWithGbifSourceAsync("Solanum lycopersicum");
        // The backfill RE-FETCHES per source → enqueue one stub result per run.
        Fixture.TaxonomyStub.Enqueue(MatchResultRich(
            2930137, author: "L.", raw: "{\"matchType\":\"EXACT\",\"kingdom\":\"Plantae\"}"));
        AuthAsAdmin();

        var response = await Client.PostAsync("/api/admin/taxonomy/gbif/raw-backfill", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<GbifRawBackfillDto>();
        Assert.Equal(1, body!.Candidates);
        Assert.Equal(1, body.Processed);
        Assert.Equal(1, body.Populated);
        Assert.Equal(0, body.Failures);

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var source = await db.PlantSources.SingleAsync(
                s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF);
            Assert.Contains("Plantae", source.RawResponseJson!);
            Assert.Equal("L.", (await db.Plants.SingleAsync(p => p.Id == plantId)).Author);
        }

        // Idempotent: a second run re-fetches and rewrites the same values.
        Fixture.TaxonomyStub.Enqueue(MatchResultRich(
            2930137, author: "L.", raw: "{\"matchType\":\"EXACT\",\"kingdom\":\"Plantae\"}"));
        var second = await Client.PostAsync("/api/admin/taxonomy/gbif/raw-backfill", null);
        var secondBody = await second.Content.ReadFromJsonAsync<GbifRawBackfillDto>();
        Assert.Equal(1, secondBody!.Populated);
    }

    [Fact]
    public async Task BackfillGbifRaw_NoMatchOnRefetch_CountsFailure_LeavesRawNull()
    {
        var plantId = await SeedPlantWithGbifSourceAsync("Gone species");
        Fixture.TaxonomyStub.EnqueueNoMatch(); // re-fetch no longer resolves
        AuthAsAdmin();

        var response = await Client.PostAsync("/api/admin/taxonomy/gbif/raw-backfill", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<GbifRawBackfillDto>();
        Assert.Equal(1, body!.Candidates);
        Assert.Equal(0, body.Processed);
        Assert.Equal(0, body.Populated);
        Assert.Equal(1, body.Failures);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var source = await db.PlantSources.SingleAsync(
            s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF);
        Assert.Null(source.RawResponseJson);
    }

    [Fact]
    public async Task BackfillGbifRaw_MatchWithNullRaw_PreservesExistingBody_NotCountedPopulated()
    {
        // Loss-proof guard at the backfill write site too: a match with a null
        // body keeps the prior capture; `populated` only counts fresh bodies.
        var plantId = await SeedPlantWithGbifSourceAsync("Solanum lycopersicum");
        using (var seed = CreateScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var src = await db.PlantSources.SingleAsync(
                s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF);
            src.RawResponseJson = "{\"matchType\":\"EXACT\",\"kingdom\":\"Plantae\"}";
            await db.SaveChangesAsync();
        }
        Fixture.TaxonomyStub.Enqueue(MatchResultRich(2930137, author: "L.", raw: null));
        AuthAsAdmin();

        var response = await Client.PostAsync("/api/admin/taxonomy/gbif/raw-backfill", null);
        var body = await response.Content.ReadFromJsonAsync<GbifRawBackfillDto>();
        Assert.Equal(1, body!.Processed);  // matched
        Assert.Equal(0, body.Populated);   // but no fresh body written

        using var scope = CreateScope();
        var db2 = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var source = await db2.PlantSources.SingleAsync(
            s => s.PlantId == plantId && s.SourceType == PlantSourceType.GBIF);
        Assert.Contains("Plantae", source.RawResponseJson!); // prior body preserved
    }

    private record GbifRawBackfillDto(int Candidates, int Processed, int Populated, int Failures);

    // ── helpers ────────────────────────────────────────────────────────

    private static PlantTaxonomyResult MatchResult(int key, string family, string genus, string epithet) =>
        new(key, family, genus, epithet, "EXACT", 99, $"{genus} {epithet}");

    // SMA-71: a match result carrying the loss-proof literal + parsed authorship.
    private static PlantTaxonomyResult MatchResultRich(int key, string? author, string? raw) =>
        new(key, "Solanaceae", "Solanum", "lycopersicum", "EXACT", 99, "Solanum lycopersicum", author, raw);

    private async Task<Guid> SeedPlantWithGbifSourceAsync(string scientificName)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = scientificName,
            PlantTypeId = 1,
            GbifTaxonKey = 2930137,
            EnrichmentStatus = EnrichmentStatus.Manual | EnrichmentStatus.GbifEnriched,
        };
        db.Plants.Add(plant);
        db.PlantSources.Add(new PlantSource
        {
            PlantId = plant.Id,
            SourceType = PlantSourceType.GBIF,
            ExternalId = "2930137",
            Url = "https://api.gbif.org/v1/species/2930137",
            // RawResponseJson intentionally null — the pre-backfill state.
        });
        await db.SaveChangesAsync();
        return plant.Id;
    }

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

    private async Task<Guid> SeedPlantWithKeyAsync(string scientificName, int gbifTaxonKey)
    {
        // Seed a row directly with GbifTaxonKey set + GbifEnriched flag, so the
        // SMA-46 duplicate-key tests can drive a 23505 from a known winner
        // without the test having to call the live enrichment path twice.
        // Mirrors the factory pattern used by BulkImportPreflightControllerTests.
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = scientificName,
            PlantTypeId = 1,
            GbifTaxonKey = gbifTaxonKey,
            EnrichmentStatus = EnrichmentStatus.Manual | EnrichmentStatus.GbifEnriched,
        };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    // SMA-33: admin-gated controller — AuthAsAdmin carries the Admin role,
    // AuthAsNonAdmin is a plain authenticated user (for the 403 gate). The JWT
    // validation pipeline short-circuits the security-stamp check when no
    // security_stamp claim is present (see PostgresFixture).
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
