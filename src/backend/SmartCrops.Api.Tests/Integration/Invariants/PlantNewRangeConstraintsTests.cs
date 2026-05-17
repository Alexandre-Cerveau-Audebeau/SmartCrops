using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Invariants;

/// <summary>
/// Validates the CHECK constraints added in PR #57 on the <c>Plants</c> table.
///
/// Scope (additive only — pre-flight inventory confirmed these were absent):
/// - <c>CK_Plants_Year_Range</c> (1700 to current year)
/// - <c>CK_Plants_SoilNutriments_Range</c> (0-10)
/// - <c>CK_Plants_Temperature_Bounds</c> (-50..60, complements existing ordering check)
/// - <c>CK_Plants_HardinessZone_Bounds</c> (1..13, complements existing ordering check)
/// </summary>
public class PlantNewRangeConstraintsTests : IntegrationTestBase
{
    public PlantNewRangeConstraintsTests(PostgresFixture fixture) : base(fixture) { }

    // ── Year ────────────────────────────────────────────────────────────

    // Valid year inputs are sourced dynamically so the upper-bound entry tracks
    // the actual CHECK ceiling (EXTRACT(YEAR FROM CURRENT_DATE)) instead of being
    // pinned to a calendar year that would silently rot — round-2 fix surfaced
    // by CodeRabbit (the previous InlineData(2026) would have broken on Jan 1, 2027).
    public static IEnumerable<object[]> ValidYearsData()
    {
        yield return [1700];                       // lower bound inclusive
        yield return [1753];                       // Linné's foundational publication year
        yield return [DateTime.UtcNow.Year];       // current year (dynamic)
    }

    [Theory]
    [MemberData(nameof(ValidYearsData))]
    public async Task Year_Valid_Accepted(int year)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(NewPlant(p => p.Year = year));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    public static IEnumerable<object[]> InvalidYearsData()
    {
        yield return [1699];                       // just below lower bound
        yield return [DateTime.UtcNow.Year + 1];   // first future year — always > CURRENT_DATE
    }

    [Theory]
    [MemberData(nameof(InvalidYearsData))]
    public async Task Year_Invalid_Rejected(int year)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(NewPlant(p => p.Year = year));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_Plants_Year_Range", ex.InnerException?.Message ?? string.Empty);
    }

    [Fact]
    public async Task Year_Null_Accepted()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(NewPlant(p => p.Year = null));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    // ── SoilNutriments ──────────────────────────────────────────────────

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    [InlineData(10)]
    public async Task SoilNutriments_Valid_Accepted(int level)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(NewPlant(p => p.SoilNutriments = level));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(11)]
    public async Task SoilNutriments_Invalid_Rejected(int level)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(NewPlant(p => p.SoilNutriments = level));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_Plants_SoilNutriments_Range", ex.InnerException?.Message ?? string.Empty);
    }

    // ── TempC bounds (complements existing ordering check) ──────────────

    [Theory]
    [InlineData(-50, 60)]    // edges of allowed range
    [InlineData(-10, 35)]    // sensible horticultural range
    public async Task TempC_WithinBounds_Accepted(int min, int max)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(NewPlant(p =>
        {
            p.MinTempC = min;
            p.MaxTempC = max;
        }));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Theory]
    [InlineData(-51, 30)]    // MinTempC below -50 (likely a unit-conversion bug)
    [InlineData(0, 61)]      // MaxTempC above 60 (likely Fahrenheit value misread)
    public async Task TempC_OutsideBounds_Rejected(int min, int max)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(NewPlant(p =>
        {
            p.MinTempC = min;
            p.MaxTempC = max;
        }));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_Plants_Temperature_Bounds", ex.InnerException?.Message ?? string.Empty);
    }

    // ── HardinessZone bounds (USDA scale) ───────────────────────────────

    [Theory]
    [InlineData(1, 13)]    // edges of USDA scale
    [InlineData(5, 9)]     // common temperate range
    public async Task HardinessZone_WithinBounds_Accepted(int min, int max)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(NewPlant(p =>
        {
            p.HardinessZoneMin = min;
            p.HardinessZoneMax = max;
        }));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Theory]
    [InlineData(0, 5)]     // below USDA scale
    [InlineData(5, 14)]    // above USDA scale
    public async Task HardinessZone_OutsideBounds_Rejected(int min, int max)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Plants.Add(NewPlant(p =>
        {
            p.HardinessZoneMin = min;
            p.HardinessZoneMax = max;
        }));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_Plants_HardinessZone_Bounds", ex.InnerException?.Message ?? string.Empty);
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private static Plant NewPlant(Action<Plant>? configure = null)
    {
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = $"Test plant {Guid.NewGuid():N}",
            PlantTypeId = 1,
        };
        configure?.Invoke(plant);
        return plant;
    }
}
