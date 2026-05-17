using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Invariants;

/// <summary>
/// Validates the invariants on the new <c>PlantPests</c> table introduced in PR #57:
/// the NotBlank CHECK on <c>Name</c>, the DEFAULT timestamps, and the partial
/// unique index on <c>(Source, SourceExternalId) WHERE SourceExternalId IS NOT NULL</c>.
/// </summary>
public class PlantPestConstraintsTests : IntegrationTestBase
{
    public PlantPestConstraintsTests(PostgresFixture fixture) : base(fixture) { }

    // ── CK_PlantPests_Name_NotBlank ─────────────────────────────────────

    // "Blank" here means empty or space-padded. The existing convention across
    // PlantCommonName/PlantSynonym/PlantSource uses Postgres `btrim(col) <> ''`
    // which trims spaces only (no tabs / other whitespace) — tab-only values
    // technically pass, which is fine because the input pipeline never produces
    // them; the constraint exists to reject empty and space-padded strings.
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Name_Blank_Rejected(string name)
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantPests.Add(NewPest(plantId, name));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_PlantPests_Name_NotBlank", ex.InnerException?.Message ?? string.Empty);
    }

    [Theory]
    [InlineData("Aphids")]
    [InlineData("Powdery Mildew")]
    public async Task Name_Valid_Accepted(string name)
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantPests.Add(NewPest(plantId, name));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    // ── DEFAULT CURRENT_TIMESTAMP on CreatedAt + UpdatedAt ──────────────

    [Fact]
    public async Task PlantPest_RawInsert_DefaultsApplied()
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        // Insert via raw SQL omitting CreatedAt/UpdatedAt so the DB default is
        // exercised directly (the interceptor doesn't fire on raw SQL).
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""PlantPests"" (""PlantId"", ""Name"", ""Type"", ""Source"")
              VALUES ({0}, 'Aphids', 'Insect', 'perenual');",
            plantId);

        var result = await db.PlantPests
            .Where(p => p.PlantId == plantId)
            .Select(p => new { p.CreatedAt, p.UpdatedAt })
            .SingleAsync();

        var now = DateTime.UtcNow;
        Assert.InRange(result.CreatedAt, now.AddMinutes(-1), now.AddMinutes(1));
        Assert.InRange(result.UpdatedAt, now.AddMinutes(-1), now.AddMinutes(1));
    }

    // ── Partial unique index (Source, SourceExternalId) ─────────────────

    [Fact]
    public async Task SourceExternalId_DuplicatePerSource_Rejected()
    {
        var plantId = await SeedPlantAsync();

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            db.PlantPests.Add(NewPest(plantId, "Aphids", "perenual-aphid-1"));
            await db.SaveChangesAsync();
        }

        using var scope2 = CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db2.PlantPests.Add(NewPest(plantId, "Aphids duplicate import", "perenual-aphid-1"));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db2.SaveChangesAsync());
        Assert.Contains("IX_PlantPests_Source_SourceExternalId", ex.InnerException?.Message ?? string.Empty);
    }

    [Fact]
    public async Task SourceExternalId_NullMultiple_Accepted()
    {
        // The WHERE filter means null SourceExternalId rows are outside the unique
        // constraint — multiple "manual" pest entries with no upstream id coexist.
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantPests.AddRange(
            NewPest(plantId, "Manual entry A"),
            NewPest(plantId, "Manual entry B"));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Fact]
    public async Task SourceExternalId_SameIdDifferentSource_Accepted()
    {
        // The unique constraint is composite on (Source, SourceExternalId), so the
        // same external id under a different source is intentionally allowed.
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantPests.AddRange(
            NewPest(plantId, "From Perenual", "pest-42", "perenual"),
            NewPest(plantId, "From Trefle", "pest-42", "trefle"));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    // ── helpers ─────────────────────────────────────────────────────────

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

    private static PlantPest NewPest(
        Guid plantId,
        string name,
        string? sourceExternalId = null,
        string source = "perenual",
        PlantPestType type = PlantPestType.Insect) =>
        new()
        {
            PlantId = plantId,
            Name = name,
            Type = type,
            Source = source,
            SourceExternalId = sourceExternalId,
        };
}
