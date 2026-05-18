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

    private record EnrichAllResponseDto(int Total, int Matched, int NotMatched, int Skipped, int Failed);
}
