using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for SMA-135 <c>POST /api/admin/plants/{id}/repin</c>. The
/// endpoint touches only the DB (no enrichment service), so these tests assert
/// the identity + purge contract directly against a real Postgres fixture: the
/// species path nulls the key and clears the external bits while leaving sources
/// and collections for the follow-up re-enrich; the genus path archives the
/// genus key, sets a genus-rank identity, and removes all Trefle/Perenual data.
/// </summary>
public class PlantRepinControllerTests : IntegrationTestBase
{
    public PlantRepinControllerTests(PostgresFixture fixture) : base(fixture) { }

    // ── auth + validation ──────────────────────────────────────────────

    [Fact]
    public async Task Repin_NonExistentPlant_Returns404()
    {
        AuthAsAdmin();
        var response = await Client.PostAsJsonAsync(
            $"/api/admin/plants/{Guid.NewGuid()}/repin",
            new { scientificName = "Solanum lycopersicum", taxonRank = "Species", gbifTaxonKey = (long?)null });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Repin_NoAuth_Returns401()
    {
        var response = await Client.PostAsJsonAsync(
            $"/api/admin/plants/{Guid.NewGuid()}/repin",
            new { scientificName = "Solanum lycopersicum", taxonRank = "Species" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Repin_AuthenticatedNonAdmin_Returns403()
    {
        AuthAsNonAdmin();
        var response = await Client.PostAsJsonAsync(
            $"/api/admin/plants/{Guid.NewGuid()}/repin",
            new { scientificName = "Solanum lycopersicum", taxonRank = "Species" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Repin_BlankScientificName_Returns400()
    {
        var plantId = await SeedFullyEnrichedPlantAsync("Sourceus fullus");
        AuthAsAdmin();
        var response = await Client.PostAsJsonAsync(
            $"/api/admin/plants/{plantId}/repin",
            new { scientificName = "   ", taxonRank = "Species" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Repin_UnknownTaxonRank_Returns400()
    {
        var plantId = await SeedFullyEnrichedPlantAsync("Sourceus fullus");
        AuthAsAdmin();
        var response = await Client.PostAsJsonAsync(
            $"/api/admin/plants/{plantId}/repin",
            new { scientificName = "Solanum lycopersicum", taxonRank = "Subspecies" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ── species path ───────────────────────────────────────────────────

    [Fact]
    public async Task Repin_Species_SetsIdentity_PurgesScalars_ClearsBits_KeepsSourcesAndCollections()
    {
        var plantId = await SeedFullyEnrichedPlantAsync("Sourceus fullus");
        AuthAsAdmin();

        var response = await Client.PostAsJsonAsync(
            $"/api/admin/plants/{plantId}/repin",
            new { scientificName = "Solanum lycopersicum", taxonRank = "Species", gbifTaxonKey = (long?)null });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<RepinResponseDto>();
        Assert.NotNull(body);
        Assert.Equal("Sourceus fullus", body!.OldScientificName);
        Assert.Equal("Solanum lycopersicum", body.NewScientificName);
        Assert.Equal("Species", body.TaxonRank);
        Assert.Null(body.GbifTaxonKey);
        Assert.False(body.IdentityNeedsReview);
        Assert.Equal(31, body.Purged.ScalarsCleared);            // 31 common, not the 4 exclusive
        Assert.Equal(0, body.Purged.PlantSourcesDeleted);
        Assert.Equal(0, body.Purged.CollectionRowsDeleted);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);

        Assert.Equal("Solanum lycopersicum", plant.ScientificName);
        Assert.Null(plant.GbifTaxonKey);
        Assert.Equal(PlantTaxonRank.Species, plant.TaxonRank);
        Assert.False(plant.IdentityNeedsReview);
        Assert.Equal(EnrichmentStatus.Manual, plant.EnrichmentStatus); // Gbif|Trefle|Perenual cleared

        // GBIF identity fields are KEPT — the re-enrich OVERWRITES them.
        Assert.Equal("Oleaceae", plant.Family);
        Assert.Equal("Olea", plant.Genus);
        Assert.Equal("europaea", plant.SpeciesEpithet);

        // 31 first-writer-wins scalars purged (sample).
        Assert.Null(plant.Author);
        Assert.Null(plant.WfoId);
        Assert.Null(plant.LifeCycle);
        Assert.Null(plant.CareLevel);
        Assert.Null(plant.IsToxicToPets);
        Assert.Null(plant.RequestedPerenualId);
        Assert.Null(plant.PropagationInstructions);

        // The 4 source-exclusive OVERWRITE fields are KEPT on the species path
        // (a Trefle/Perenual re-enrich rewrites them).
        Assert.NotNull(plant.FlowerColors);
        Assert.NotNull(plant.NativeRegions);
        Assert.NotNull(plant.IntroducedRegions);
        Assert.NotNull(plant.EdibleParts);

        // Sources + collections untouched.
        Assert.Equal(3, await db.PlantSources.CountAsync(s => s.PlantId == plantId));
        Assert.NotNull(await db.PlantTrefleData.SingleOrDefaultAsync(t => t.PlantId == plantId));
        Assert.NotNull(await db.PlantPerenualData.SingleOrDefaultAsync(p => p.PlantId == plantId));
        Assert.Equal(3, await db.PlantImages.CountAsync(i => i.PlantId == plantId));
        Assert.Equal(1, await db.PlantCommonNames.CountAsync(c => c.PlantId == plantId));
        Assert.Equal(1, await db.PlantSynonyms.CountAsync(s => s.PlantId == plantId));
        Assert.Equal(2, await db.PlantLongDescriptions.CountAsync(d => d.PlantId == plantId));
        Assert.Equal(1, await db.PlantPests.CountAsync(p => p.PlantId == plantId));
    }

    // ── genus path ─────────────────────────────────────────────────────

    [Fact]
    public async Task Repin_Genus_SetsGenus_ArchivesKey_PurgesAll_DeletesTrefleAndPerenual()
    {
        var plantId = await SeedFullyEnrichedPlantAsync("Sourceus fullus");
        AuthAsAdmin();

        var response = await Client.PostAsJsonAsync(
            $"/api/admin/plants/{plantId}/repin",
            new { scientificName = "Lavandula", taxonRank = "Genus", gbifTaxonKey = (long?)2927302 });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<RepinResponseDto>();
        Assert.NotNull(body);
        Assert.Equal("Genus", body!.TaxonRank);
        Assert.Equal(2927302, body.GbifTaxonKey);
        Assert.True(body.IdentityNeedsReview);
        Assert.Equal(35, body.Purged.ScalarsCleared);            // 31 common + 4 exclusive
        Assert.Equal(2, body.Purged.PlantSourcesDeleted);        // Trefle + Perenual
        Assert.Equal(8, body.Purged.CollectionRowsDeleted);      // 1+1 audit + 2 img + 1 cn + 1 syn + 1 ld + 1 pest

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);

        Assert.Equal("Lavandula", plant.ScientificName);
        Assert.Equal("Lavandula", plant.Genus);
        Assert.Null(plant.SpeciesEpithet);
        Assert.Equal("Oleaceae", plant.Family);                  // Family KEPT
        Assert.Null(plant.GbifTaxonKey);                         // unique-index safe
        Assert.Equal(PlantTaxonRank.Genus, plant.TaxonRank);
        Assert.True(plant.IdentityNeedsReview);
        Assert.Equal(EnrichmentStatus.Manual | EnrichmentStatus.GbifEnriched, plant.EnrichmentStatus);

        // 31 + 4 scalars purged (sample of the 4 exclusive).
        Assert.Null(plant.Author);
        Assert.Null(plant.FlowerColors);
        Assert.Null(plant.NativeRegions);
        Assert.Null(plant.IntroducedRegions);
        Assert.Null(plant.EdibleParts);

        // Genus key archived on the (surviving) GBIF source.
        var sources = await db.PlantSources.Where(s => s.PlantId == plantId).ToListAsync();
        Assert.Single(sources);
        Assert.Equal(PlantSourceType.GBIF, sources[0].SourceType);
        Assert.Equal("2927302", sources[0].ExternalId);
        Assert.Equal("https://api.gbif.org/v1/species/2927302", sources[0].Url);

        // Trefle + Perenual data removed.
        Assert.Null(await db.PlantTrefleData.SingleOrDefaultAsync(t => t.PlantId == plantId));
        Assert.Null(await db.PlantPerenualData.SingleOrDefaultAsync(p => p.PlantId == plantId));

        // Images: only the Manual one survives.
        var images = await db.PlantImages.Where(i => i.PlantId == plantId).ToListAsync();
        Assert.Single(images);
        Assert.Equal(PlantSourceType.Manual, images[0].Source);

        // Common names + synonyms wholly removed (Trefle-owned, no Source column).
        Assert.Equal(0, await db.PlantCommonNames.CountAsync(c => c.PlantId == plantId));
        Assert.Equal(0, await db.PlantSynonyms.CountAsync(s => s.PlantId == plantId));

        // Long descriptions: the Perenual "en" row is gone; the manual "fr" row survives.
        var descs = await db.PlantLongDescriptions.Where(d => d.PlantId == plantId).ToListAsync();
        Assert.Single(descs);
        Assert.Equal("fr", descs[0].Language);

        // Perenual pests removed.
        Assert.Equal(0, await db.PlantPests.CountAsync(p => p.PlantId == plantId));
    }

    [Fact]
    public async Task Repin_Genus_WithoutGbifKey_LeavesNoArchivedKey_StillPurges()
    {
        var plantId = await SeedFullyEnrichedPlantAsync("Sourceus fullus");
        AuthAsAdmin();

        var response = await Client.PostAsJsonAsync(
            $"/api/admin/plants/{plantId}/repin",
            new { scientificName = "Lavandula", taxonRank = "Genus", gbifTaxonKey = (long?)null });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        // No genus key supplied → the existing GBIF source keeps its prior ExternalId
        // (we don't fabricate one), Trefle/Perenual still purged.
        var sources = await db.PlantSources.Where(s => s.PlantId == plantId).ToListAsync();
        Assert.Single(sources);
        Assert.Equal(PlantSourceType.GBIF, sources[0].SourceType);
        Assert.Equal("5415040", sources[0].ExternalId); // unchanged seed value

        // The "StillPurges" promise: Trefle/Perenual data + collections are gone
        // even on the no-key branch.
        Assert.Null(await db.PlantTrefleData.SingleOrDefaultAsync(t => t.PlantId == plantId));
        Assert.Null(await db.PlantPerenualData.SingleOrDefaultAsync(p => p.PlantId == plantId));
        Assert.Equal(0, await db.PlantPests.CountAsync(p => p.PlantId == plantId));
        Assert.Equal(0, await db.PlantCommonNames.CountAsync(c => c.PlantId == plantId));
        Assert.Equal(0, await db.PlantSynonyms.CountAsync(s => s.PlantId == plantId));
    }

    [Fact]
    public async Task Repin_NumericTaxonRank_Returns400()
    {
        // A1 lock: "1" would parse to Species via Enum.TryParse — the name-based
        // gate must reject numeric strings instead of silently accepting them.
        var plantId = await SeedFullyEnrichedPlantAsync("Sourceus fullus");
        AuthAsAdmin();
        var response = await Client.PostAsJsonAsync(
            $"/api/admin/plants/{plantId}/repin",
            new { scientificName = "Lavandula", taxonRank = "1" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ── transactional rollback ─────────────────────────────────────────

    [Fact]
    public async Task Repin_NameCollision_RollsBackEverything()
    {
        // Repin A onto B's name (case-insensitively) → the unique index on
        // ScientificName raises 23505 on flush; the controller maps it to 409 and
        // the transaction rolls the whole unit back (identity + scalar purge +
        // collection deletes).
        await SeedPlainPlantAsync("Conflict species");
        var plantId = await SeedFullyEnrichedPlantAsync("Sourceus fullus");
        AuthAsAdmin();

        var response = await Client.PostAsJsonAsync(
            $"/api/admin/plants/{plantId}/repin",
            new { scientificName = "conflict species", taxonRank = "Genus", gbifTaxonKey = (long?)2927302 });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);

        // Nothing changed: identity, scalars, status, and source data all intact.
        Assert.Equal("Sourceus fullus", plant.ScientificName);
        Assert.Equal(5415040, plant.GbifTaxonKey);
        Assert.Equal(PlantTaxonRank.Species, plant.TaxonRank);
        Assert.NotNull(plant.Author);
        Assert.NotNull(plant.FlowerColors);
        Assert.Equal(
            EnrichmentStatus.Manual | EnrichmentStatus.GbifEnriched
                | EnrichmentStatus.TrefleEnriched | EnrichmentStatus.PerenualEnriched,
            plant.EnrichmentStatus);
        Assert.NotNull(await db.PlantTrefleData.SingleOrDefaultAsync(t => t.PlantId == plantId));
        Assert.NotNull(await db.PlantPerenualData.SingleOrDefaultAsync(p => p.PlantId == plantId));
        Assert.Equal(3, await db.PlantSources.CountAsync(s => s.PlantId == plantId));
    }

    // ── helpers ────────────────────────────────────────────────────────

    private async Task<Guid> SeedPlainPlantAsync(string scientificName)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = scientificName,
            PlantTypeId = 1,
            EnrichmentStatus = EnrichmentStatus.Manual,
        };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    /// <summary>
    /// Seed a plant with a full GBIF/Trefle/Perenual footprint: all 31 common
    /// first-writer-wins scalars + the 4 source-exclusive JSON fields set,
    /// 3 PlantSources, the two 1:1 audit rows, and one row per attached
    /// collection (incl. a Manual image + a manual "fr" long-description that
    /// must survive a genus purge).
    /// </summary>
    private async Task<Guid> SeedFullyEnrichedPlantAsync(string scientificName)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var id = Guid.NewGuid();
        var plant = new Plant
        {
            Id = id,
            ScientificName = scientificName,
            PlantTypeId = 1,
            // Identity.
            GbifTaxonKey = 5415040,
            Family = "Oleaceae",
            Genus = "Olea",
            SpeciesEpithet = "europaea",
            TaxonRank = PlantTaxonRank.Species,
            IdentityNeedsReview = false,
            EnrichmentStatus = EnrichmentStatus.Manual | EnrichmentStatus.GbifEnriched
                | EnrichmentStatus.TrefleEnriched | EnrichmentStatus.PerenualEnriched,
            // 31 common first-writer-wins scalars.
            Author = "L.",
            WfoId = "wfo-test",
            LightLevel = 5,
            SoilNutriments = 5,
            SoilPhMin = 6.0m,
            SoilPhMax = 7.0m,
            MinTempC = -5,
            MaxTempC = 30,
            IsEdible = true,
            IsVegetable = false,
            GrowthHabit = PlantGrowthHabit.Shrub,
            RequestedPerenualId = 4721,
            LifeCycle = PlantLifeCycle.Perennial,
            GrowthRate = PlantGrowthRate.Moderate,
            WateringNeedLevel = PlantWateringNeed.Average,
            CareLevel = PlantCareLevel.Easy,
            HardinessZoneMin = 5,
            HardinessZoneMax = 9,
            MinHeightCm = 10,
            MaxHeightCm = 100,
            IsIndoor = false,
            IsDroughtTolerant = true,
            IsSaltTolerant = false,
            IsThorny = false,
            IsInvasive = false,
            IsTropical = false,
            IsMedicinal = true,
            IsToxicToHumans = false,
            IsToxicToPets = true,
            PropagationInstructions = "Sow seeds in spring.",
            SowingInstructions = "Direct sow after frost.",
            // 4 source-exclusive OVERWRITE JSON fields.
            FlowerColors = "[\"purple\"]",
            NativeRegions = "[\"MED\"]",
            IntroducedRegions = "[\"NAM\"]",
            EdibleParts = "[\"fruit\"]",
        };
        db.Plants.Add(plant);

        db.PlantSources.AddRange(
            new PlantSource
            {
                PlantId = id,
                SourceType = PlantSourceType.GBIF,
                ExternalId = "5415040",
                Url = "https://api.gbif.org/v1/species/5415040",
            },
            new PlantSource
            {
                PlantId = id,
                SourceType = PlantSourceType.Trefle,
                ExternalId = "1234",
                Url = "https://trefle.io/api/v1/species/1234",
            },
            new PlantSource
            {
                PlantId = id,
                SourceType = PlantSourceType.Perenual,
                ExternalId = "4721",
                Url = "https://perenual.com/api/v2/species/details/4721",
            });

        db.PlantTrefleData.Add(new PlantTrefleData
        {
            Id = Guid.NewGuid(),
            PlantId = id,
            LastSyncAt = DateTime.UtcNow,
        });
        db.PlantPerenualData.Add(new PlantPerenualData
        {
            Id = Guid.NewGuid(),
            PlantId = id,
            PerenualId = 4721,
            HasSupremeData = false,
            LastSyncAt = DateTime.UtcNow,
        });

        db.PlantImages.AddRange(
            new PlantImage { PlantId = id, ImageType = PlantImageType.Main, Url = "http://t/img", Source = PlantSourceType.Trefle },
            new PlantImage { PlantId = id, ImageType = PlantImageType.Main, Url = "http://p/img", Source = PlantSourceType.Perenual },
            new PlantImage { PlantId = id, ImageType = PlantImageType.Main, Url = "http://m/img", Source = PlantSourceType.Manual });

        db.PlantCommonNames.Add(new PlantCommonName { PlantId = id, LanguageCode = "en", Name = "olive", IsPrimary = true });
        db.PlantSynonyms.Add(new PlantSynonym { PlantId = id, Synonym = "Olea oleaster" });

        db.PlantLongDescriptions.AddRange(
            new PlantLongDescription { PlantId = id, Language = "en", LongDescription = "Perenual EN text.", SourceMethod = "perenual" },
            new PlantLongDescription { PlantId = id, Language = "fr", LongDescription = "Texte FR manuel.", SourceMethod = "manual" });

        db.PlantPests.Add(new PlantPest { PlantId = id, Name = "Scale", Type = PlantPestType.Insect, Source = "perenual" });

        await db.SaveChangesAsync();
        return id;
    }

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

    private record RepinResponseDto(
        Guid PlantId,
        string OldScientificName,
        string NewScientificName,
        string TaxonRank,
        long? GbifTaxonKey,
        bool IdentityNeedsReview,
        RepinPurgeCountsDto Purged);

    private record RepinPurgeCountsDto(int ScalarsCleared, int PlantSourcesDeleted, int CollectionRowsDeleted);
}
