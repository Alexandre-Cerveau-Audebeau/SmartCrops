using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration;

/// <summary>
/// Sanity checks that the integration infrastructure boots end-to-end: container starts,
/// migrations apply, DbContext can connect, and the seeded reference data (PlantTypes via
/// HasData) survives <see cref="Respawn.Respawner.ResetAsync"/>.
/// </summary>
public class SmokeTests : IntegrationTestBase
{
    public SmokeTests(PostgresFixture fixture) : base(fixture) { }

    [Fact]
    public async Task Container_Starts_And_Migrations_Apply()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        Assert.True(await db.Database.CanConnectAsync());

        // The Plants table is created by the InitialCreate migration. Touch it via a
        // raw SELECT — if the table is missing the query throws and the assertion fails.
        // (An earlier version used ContinueWith(_ => true) which silently swallowed the
        // fault and always reported success — round-2 fix surfaced by CodeRabbit.)
        var ex = await Record.ExceptionAsync(() =>
            db.Database.ExecuteSqlRawAsync("SELECT 1 FROM \"Plants\" LIMIT 1;"));
        Assert.Null(ex);
    }

    [Fact]
    public async Task Reference_PlantTypes_Survive_RespawnReset()
    {
        // Respawn is configured to ignore PlantTypes (seeded via HasData in the
        // InitialCreate migration). Each test starts with the 5 reference rows intact.
        // Authoritative source: PlantTypeConfiguration.cs HasData call seeds
        // Vegetable / Fruit / Herb / Ornamental / Medicinal.
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var typeCount = await db.PlantTypes.CountAsync();
        Assert.Equal(5, typeCount);
    }
}
