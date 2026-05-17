using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Invariants;

/// <summary>
/// Validates the <c>DEFAULT CURRENT_TIMESTAMP</c> defaults on Plant-aggregate
/// timestamp columns. The interceptor unit tests cover the UPDATE path; this class
/// covers the INSERT-time DB-default path that the in-memory provider cannot exercise
/// (documented gap from PR #37, addressed for the new entities in PR #55).
/// </summary>
public class DefaultTimestampTests : IntegrationTestBase
{
    public DefaultTimestampTests(PostgresFixture fixture) : base(fixture) { }

    [Fact]
    public async Task Plants_CreatedAt_And_UpdatedAt_PopulatedByDbDefault_OnRawInsert()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var id = Guid.NewGuid();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""Plants"" (""Id"", ""ScientificName"", ""PlantTypeId"") VALUES ({0}, {1}, 1);",
            id, $"Test plant {id:N}");

        // Read raw so EF doesn't massage timestamps client-side. CURRENT_TIMESTAMP
        // resolves at INSERT time, so the value should be within a small window of
        // "now". Using UTC because Npgsql round-trips as UTC for timestamptz.
        var result = await db.Plants
            .Where(p => p.Id == id)
            .Select(p => new { p.CreatedAt, p.UpdatedAt })
            .SingleAsync();

        var now = DateTime.UtcNow;
        Assert.InRange(result.CreatedAt, now.AddMinutes(-1), now.AddMinutes(1));
        Assert.InRange(result.UpdatedAt, now.AddMinutes(-1), now.AddMinutes(1));
    }

    [Fact]
    public async Task Gardens_CreatedAt_And_UpdatedAt_PopulatedByDbDefault_AlignedInPR55()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var id = Guid.NewGuid();
        // No Identity user is seeded; the FK on UserId is Restrict but the test
        // only inserts a Garden row without other Gardens — the FK to AspNetUsers
        // is enforced, so seed a minimal user first.
        var userId = $"u-{Guid.NewGuid():N}";
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0);",
            userId);

        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""Gardens"" (""Id"", ""Name"", ""UserId"") VALUES ({0}, 'Garden', {1});",
            id, userId);

        var result = await db.Gardens
            .Where(g => g.Id == id)
            .Select(g => new { g.CreatedAt, g.UpdatedAt })
            .SingleAsync();

        var now = DateTime.UtcNow;
        Assert.InRange(result.CreatedAt, now.AddMinutes(-1), now.AddMinutes(1));
        Assert.InRange(result.UpdatedAt, now.AddMinutes(-1), now.AddMinutes(1));
    }

    [Fact]
    public async Task PlantSuggestions_CreatedAt_And_UpdatedAt_PopulatedByDbDefault_AlignedInPR55()
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var id = Guid.NewGuid();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""PlantSuggestions"" (""Id"", ""PlantId"", ""FieldName"", ""SuggestedValue"", ""Status"")
              VALUES ({0}, {1}, 'CommonName', 'Tomate', 'Pending');",
            id, plantId);

        var result = await db.PlantSuggestions
            .Where(s => s.Id == id)
            .Select(s => new { s.CreatedAt, s.UpdatedAt })
            .SingleAsync();

        var now = DateTime.UtcNow;
        Assert.InRange(result.CreatedAt, now.AddMinutes(-1), now.AddMinutes(1));
        Assert.InRange(result.UpdatedAt, now.AddMinutes(-1), now.AddMinutes(1));
    }

    [Fact]
    public async Task PlantCommonNames_UpdatedAt_PopulatedByDbDefault_AddedInPR55()
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""PlantCommonNames"" (""PlantId"", ""LanguageCode"", ""Name"", ""IsPrimary"")
              VALUES ({0}, 'en', 'Tomato', TRUE);",
            plantId);

        var result = await db.PlantCommonNames
            .Where(n => n.PlantId == plantId)
            .Select(n => new { n.CreatedAt, n.UpdatedAt })
            .SingleAsync();

        var now = DateTime.UtcNow;
        Assert.InRange(result.CreatedAt, now.AddMinutes(-1), now.AddMinutes(1));
        Assert.InRange(result.UpdatedAt, now.AddMinutes(-1), now.AddMinutes(1));
    }

    private async Task<Guid> SeedPlantAsync()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plantId = Guid.NewGuid();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""Plants"" (""Id"", ""ScientificName"", ""PlantTypeId"") VALUES ({0}, {1}, 1);",
            plantId, $"Test plant {plantId:N}");
        return plantId;
    }
}
