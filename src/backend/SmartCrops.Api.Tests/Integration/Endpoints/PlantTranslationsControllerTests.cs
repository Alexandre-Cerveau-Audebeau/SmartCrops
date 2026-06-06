using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for the SMA-120 backfill
/// (<c>POST /api/admin/translations/backfill</c>): promotes common names
/// (<c>PlantCommonNames</c>) + EN descriptions (Perenual <c>species-details</c> cache)
/// into <c>PlantTranslations</c>. Write policy: CommonName insert-only, EN Description
/// overwrite, FR rows name-only, idempotent.
/// </summary>
public class PlantTranslationsControllerTests : IntegrationTestBase
{
    public PlantTranslationsControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string Url = "/api/admin/translations/backfill";
    private const int OrnamentalTypeId = 4; // seeded by PlantTypeConfiguration, survives Respawn

    private void AuthAsAdmin()
    {
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken($"u-{Guid.NewGuid():N}", Roles.Admin));
    }

    /// <summary>Seed: Plant A (with a curated EN translation already present) + Plant B (none),
    /// each with en/fr common names and a cached species-details body.</summary>
    private async Task<(Guid a, Guid b)> SeedAsync()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        db.Plants.AddRange(
            new Plant { Id = a, ScientificName = "Plant Alpha", PlantTypeId = OrnamentalTypeId },
            new Plant { Id = b, ScientificName = "Plant Beta", PlantTypeId = OrnamentalTypeId });

        db.PlantCommonNames.AddRange(
            new PlantCommonName { PlantId = a, LanguageCode = "en", Name = "Alpha EN", IsPrimary = true },
            new PlantCommonName { PlantId = a, LanguageCode = "fr", Name = "Alpha FR", IsPrimary = true },
            new PlantCommonName { PlantId = b, LanguageCode = "en", Name = "Beta EN", IsPrimary = true },
            new PlantCommonName { PlantId = b, LanguageCode = "fr", Name = "Beta FR", IsPrimary = true });

        db.PlantPerenualData.AddRange(
            new PlantPerenualData { PlantId = a, PerenualId = 1001, LastSyncAt = DateTime.UtcNow },
            new PlantPerenualData { PlantId = b, PerenualId = 1002, LastSyncAt = DateTime.UtcNow });

        db.PerenualRawCache.AddRange(
            new PerenualRawCache { Endpoint = "species-details", ResourceId = "1001", HttpStatus = 200, FetchedAt = DateTime.UtcNow, RawJson = "{\"common_name\":\"alpha cache\",\"description\":\"Alpha cache description.\"}" },
            new PerenualRawCache { Endpoint = "species-details", ResourceId = "1002", HttpStatus = 200, FetchedAt = DateTime.UtcNow, RawJson = "{\"common_name\":\"beta cache\",\"description\":\"Beta cache description.\"}" });

        // Plant A already has a curated EN translation (seed) — name must be kept,
        // description must be overwritten by the cache.
        db.PlantTranslations.Add(new PlantTranslation { PlantId = a, Language = "en", CommonName = "Alpha Seed En", Description = "Old en desc" });

        await db.SaveChangesAsync();
        return (a, b);
    }

    private record BackfillResp(bool DryRun, int Plants, int EnNamesToInsert, int FrNamesToInsert, int EnDescriptionsToWrite, int PlantsWithoutFrName, int PlantsWithoutAnyName);

    [Fact]
    public async Task Backfill_NoAuth_Returns401()
    {
        var res = await Client.PostAsync($"{Url}?dryRun=true", null);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Backfill_DryRun_ReportsCounts_WithoutPersisting()
    {
        var (a, _) = await SeedAsync();
        AuthAsAdmin();

        var res = await Client.PostAsync($"{Url}?dryRun=true", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<BackfillResp>();
        Assert.True(body!.DryRun);
        Assert.Equal(2, body.Plants);
        Assert.Equal(1, body.EnNamesToInsert);   // B only (A's EN row exists)
        Assert.Equal(2, body.FrNamesToInsert);    // A + B
        Assert.Equal(2, body.EnDescriptionsToWrite); // A overwrite + B new-with-desc
        Assert.Equal(0, body.PlantsWithoutFrName);
        Assert.Equal(0, body.PlantsWithoutAnyName);

        // Nothing persisted: still only the single seed translation row.
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(1, await db.PlantTranslations.CountAsync());
        var seed = await db.PlantTranslations.SingleAsync(t => t.PlantId == a && t.Language == "en");
        Assert.Equal("Old en desc", seed.Description); // untouched in dry-run
    }

    [Fact]
    public async Task Backfill_Apply_InsertOnlyName_OverwriteEnDescription_FrNameOnly()
    {
        var (a, b) = await SeedAsync();
        AuthAsAdmin();

        var res = await Client.PostAsync($"{Url}?dryRun=false", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        // Plant A EN: name KEPT (insert-only), description OVERWRITTEN from cache.
        var aEn = await db.PlantTranslations.SingleAsync(t => t.PlantId == a && t.Language == "en");
        Assert.Equal("Alpha Seed En", aEn.CommonName);
        Assert.Equal("Alpha cache description.", aEn.Description);

        // Plant A FR: inserted, name only, NO description.
        var aFr = await db.PlantTranslations.SingleAsync(t => t.PlantId == a && t.Language == "fr");
        Assert.Equal("Alpha FR", aFr.CommonName);
        Assert.Null(aFr.Description);

        // Plant B EN: inserted with cache description; FR inserted name-only.
        var bEn = await db.PlantTranslations.SingleAsync(t => t.PlantId == b && t.Language == "en");
        Assert.Equal("Beta EN", bEn.CommonName);
        Assert.Equal("Beta cache description.", bEn.Description);
        var bFr = await db.PlantTranslations.SingleAsync(t => t.PlantId == b && t.Language == "fr");
        Assert.Equal("Beta FR", bFr.CommonName);
        Assert.Null(bFr.Description);

        // No FR row ever carries a description.
        Assert.False(await db.PlantTranslations.AnyAsync(t => t.Language == "fr" && t.Description != null));
    }

    /// <summary>Regression (CR Ⓐ): an existing EN row whose plant has NO EN name source
    /// this run (no <c>PlantCommonNames.en</c>, cache <c>common_name</c> empty) must STILL
    /// have its EN description overwritten from the cache — description overwrite is
    /// decoupled from name presence.</summary>
    [Fact]
    public async Task Backfill_OverwritesEnDescription_WhenExistingRowHasNoEnNameSource()
    {
        var c = Guid.NewGuid();
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            db.Plants.Add(new Plant { Id = c, ScientificName = "Plant Gamma", PlantTypeId = OrnamentalTypeId });
            // No en common name (fr only), so nameByPlantLang has no en entry.
            db.PlantCommonNames.Add(new PlantCommonName { PlantId = c, LanguageCode = "fr", Name = "Gamma FR", IsPrimary = true });
            db.PlantPerenualData.Add(new PlantPerenualData { PlantId = c, PerenualId = 1003, LastSyncAt = DateTime.UtcNow });
            // Cache has a description but an empty common_name → no EN name source at all.
            db.PerenualRawCache.Add(new PerenualRawCache { Endpoint = "species-details", ResourceId = "1003", HttpStatus = 200, FetchedAt = DateTime.UtcNow, RawJson = "{\"common_name\":\"\",\"description\":\"Gamma cache description.\"}" });
            // Existing EN row (e.g. seed) — name kept, description must still be overwritten.
            db.PlantTranslations.Add(new PlantTranslation { PlantId = c, Language = "en", CommonName = "Gamma Seed En", Description = "Old en desc" });
            await db.SaveChangesAsync();
        }
        AuthAsAdmin();

        var res = await Client.PostAsync($"{Url}?dryRun=false", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        using var verify = CreateScope();
        var vdb = verify.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var enRow = await vdb.PlantTranslations.SingleAsync(t => t.PlantId == c && t.Language == "en");
        Assert.Equal("Gamma Seed En", enRow.CommonName);           // name kept (insert-only)
        Assert.Equal("Gamma cache description.", enRow.Description); // description overwritten despite null name source
    }

    [Fact]
    public async Task Backfill_IsIdempotent()
    {
        await SeedAsync();
        AuthAsAdmin();

        await Client.PostAsync($"{Url}?dryRun=false", null);
        var res2 = await Client.PostAsync($"{Url}?dryRun=false", null);
        var body = await res2.Content.ReadFromJsonAsync<BackfillResp>();

        Assert.Equal(0, body!.EnNamesToInsert);
        Assert.Equal(0, body.FrNamesToInsert);
        Assert.Equal(0, body.EnDescriptionsToWrite);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(4, await db.PlantTranslations.CountAsync()); // A en/fr + B en/fr
    }
}
