using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Invariants;

/// <summary>
/// Validates partial (filtered) unique indexes. Behaviour is invisible to the EF Core
/// in-memory provider, so a CHECK-style integration test is the only way to assert
/// uniqueness is only enforced where the WHERE filter matches.
///
/// Coverage:
/// - <c>PlantCommonNames(PlantId, LanguageCode) WHERE IsPrimary = TRUE</c> (PR #36)
/// - <c>Plants.GbifTaxonKey WHERE GbifTaxonKey IS NOT NULL</c> (PR #36)
/// </summary>
public class PartialUniqueIndexTests : IntegrationTestBase
{
    public PartialUniqueIndexTests(PostgresFixture fixture) : base(fixture) { }

    [Fact]
    public async Task PlantCommonNames_TwoPrimary_SameLanguage_Rejected()
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantCommonNames.Add(new PlantCommonName
        {
            PlantId = plantId,
            LanguageCode = "en",
            Name = "Tomato",
            IsPrimary = true,
        });
        await db.SaveChangesAsync();

        using var scope2 = CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db2.PlantCommonNames.Add(new PlantCommonName
        {
            PlantId = plantId,
            LanguageCode = "en",
            Name = "Love apple",
            IsPrimary = true,
        });

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db2.SaveChangesAsync());
        Assert.Contains("IX_PlantCommonNames_PlantId_LanguageCode", ex.InnerException?.Message ?? string.Empty);
    }

    [Fact]
    public async Task PlantCommonNames_OnePrimary_OneNonPrimary_SameLanguage_Accepted()
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantCommonNames.AddRange(
            new PlantCommonName
            {
                PlantId = plantId,
                LanguageCode = "en",
                Name = "Tomato",
                IsPrimary = true,
            },
            new PlantCommonName
            {
                PlantId = plantId,
                LanguageCode = "en",
                Name = "Love apple",
                IsPrimary = false,
            });

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Fact]
    public async Task PlantCommonNames_TwoNonPrimary_SameLanguage_Accepted()
    {
        // The filter (IsPrimary = TRUE) means non-primary rows are entirely outside
        // the unique constraint — duplicates are allowed.
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantCommonNames.AddRange(
            new PlantCommonName
            {
                PlantId = plantId,
                LanguageCode = "en",
                Name = "Tomato",
                IsPrimary = false,
            },
            new PlantCommonName
            {
                PlantId = plantId,
                LanguageCode = "en",
                Name = "Love apple",
                IsPrimary = false,
            });

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Fact]
    public async Task Plants_TwoNullGbifTaxonKey_Accepted()
    {
        // The filter (GbifTaxonKey IS NOT NULL) means NULL rows are outside the
        // unique constraint — many plants without a GBIF id can coexist.
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.AddRange(
            new Plant { Id = Guid.NewGuid(), ScientificName = $"A {Guid.NewGuid():N}", PlantTypeId = 1 },
            new Plant { Id = Guid.NewGuid(), ScientificName = $"B {Guid.NewGuid():N}", PlantTypeId = 1 });

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Fact]
    public async Task Plants_TwoSameGbifTaxonKey_Rejected()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = $"A {Guid.NewGuid():N}",
            PlantTypeId = 1,
            GbifTaxonKey = 42424242,
        });
        await db.SaveChangesAsync();

        using var scope2 = CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db2.Plants.Add(new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = $"B {Guid.NewGuid():N}",
            PlantTypeId = 1,
            GbifTaxonKey = 42424242,
        });

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db2.SaveChangesAsync());
        Assert.Contains("IX_Plants_GbifTaxonKey", ex.InnerException?.Message ?? string.Empty);
    }

    private async Task<Guid> SeedPlantAsync()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = $"Test plant {Guid.NewGuid():N}",
            PlantTypeId = 1,
        };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }
}
