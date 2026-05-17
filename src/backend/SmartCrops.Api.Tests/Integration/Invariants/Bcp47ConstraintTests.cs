using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Invariants;

/// <summary>
/// Validates the BCP 47 CHECK constraint on <c>PlantCommonNames.LanguageCode</c>
/// introduced in PR #41. Pattern (lowercase, stored via value converter):
/// <c>^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?$</c>.
/// Previously only covered by a source-text smoke test (see ADR-0002 and
/// Bcp47CheckConstraintMigrationTests); these tests exercise the actual PG enforcement.
/// </summary>
public class Bcp47ConstraintTests : IntegrationTestBase
{
    public Bcp47ConstraintTests(PostgresFixture fixture) : base(fixture) { }

    [Theory]
    [InlineData("fr")]                 // 2-letter primary
    [InlineData("en")]
    [InlineData("eng")]                // 3-letter primary
    [InlineData("fr-fr")]              // primary + region (lowercased)
    [InlineData("zh-hans-cn")]         // primary + script + region (lowercased)
    [InlineData("es-419")]             // primary + UN M.49 region
    public async Task LanguageCode_Valid_Accepted(string code)
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantCommonNames.Add(new PlantCommonName
        {
            PlantId = plantId,
            LanguageCode = code,
            Name = "Sample",
            IsPrimary = false,
        });

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Theory]
    [InlineData("fr_FR")]               // underscore not allowed
    [InlineData("french")]              // primary too long (>3)
    [InlineData("fr-")]                 // trailing hyphen
    [InlineData("fr-FRA")]              // region must be 2 alpha or 3 digits, not 3 alpha
    [InlineData("zh-Hant!")]            // non-alphanum char
    [InlineData("a")]                   // primary too short
    public async Task LanguageCode_Invalid_Rejected(string code)
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantCommonNames.Add(new PlantCommonName
        {
            PlantId = plantId,
            LanguageCode = code,
            Name = "Sample",
            IsPrimary = false,
        });

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_PlantCommonName_LanguageCode_Bcp47", ex.InnerException?.Message ?? string.Empty);
    }

    [Fact]
    public async Task LanguageCode_UppercaseInput_StoredLowercase_AndAccepted()
    {
        // The ValueConverter on LanguageCode lowercases on write, so an uppercase
        // input from C# becomes lowercase in the DB and satisfies the lowercase regex.
        // This guards against regressions where the converter is dropped and the
        // CHECK then rejects what used to be accepted.
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantCommonNames.Add(new PlantCommonName
        {
            PlantId = plantId,
            LanguageCode = "FR-FR",
            Name = "Sample",
            IsPrimary = false,
        });

        await db.SaveChangesAsync();

        using var verifyScope = CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var stored = await verifyDb.PlantCommonNames.SingleAsync();
        Assert.Equal("fr-fr", stored.LanguageCode);
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
