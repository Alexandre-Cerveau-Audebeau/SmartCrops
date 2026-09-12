using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Invariants;

/// <summary>
/// SMA-336 PR 3a/5 — the location CHECK constraints, exercised against
/// PostgreSQL (the in-memory provider enforces none of them). Proof by failure
/// on both carriers: a latitude of 91, a longitude of 181 and a latitude
/// without its longitude must each be REJECTED by the database, by the named
/// constraint; a valid pair and an all-NULL row must be accepted.
/// </summary>
public class GardenLocationConstraintTests : IntegrationTestBase
{
    public GardenLocationConstraintTests(PostgresFixture fixture) : base(fixture) { }

    // ── Gardens ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Garden_LatitudeOutOfRange_IsRejectedByPostgres()
    {
        var userId = await SeedUserAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Gardens.Add(NewGarden(userId, latitude: 91, longitude: 4.84));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_Gardens_Latitude_Range", ex.InnerException?.Message ?? string.Empty);
    }

    [Fact]
    public async Task Garden_LongitudeOutOfRange_IsRejectedByPostgres()
    {
        var userId = await SeedUserAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Gardens.Add(NewGarden(userId, latitude: 45.76, longitude: 181));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_Gardens_Longitude_Range", ex.InnerException?.Message ?? string.Empty);
    }

    [Fact]
    public async Task Garden_LatitudeWithoutLongitude_IsRejectedByPostgres()
    {
        var userId = await SeedUserAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Gardens.Add(NewGarden(userId, latitude: 45.76, longitude: null));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_Gardens_Location_Pair", ex.InnerException?.Message ?? string.Empty);
    }

    [Theory]
    [InlineData(45.76, 4.84)]     // Lyon
    [InlineData(-90, -180)]       // the corners of the ranges are inside them
    [InlineData(90, 180)]
    public async Task Garden_ValidPair_IsAccepted(double latitude, double longitude)
    {
        var userId = await SeedUserAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Gardens.Add(NewGarden(userId, latitude, longitude));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Fact]
    public async Task Garden_NoLocation_IsAccepted()
    {
        // NULL everywhere IS the « not located » state; the constraints must
        // let every existing row through untouched.
        var userId = await SeedUserAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Gardens.Add(NewGarden(userId, latitude: null, longitude: null));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    // ── AspNetUsers ──────────────────────────────────────────────────────────

    [Fact]
    public async Task User_LatitudeOutOfRange_IsRejectedByPostgres()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Users.Add(NewUser(latitude: 91, longitude: 4.84));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_AspNetUsers_Latitude_Range", ex.InnerException?.Message ?? string.Empty);
    }

    [Fact]
    public async Task User_LongitudeOutOfRange_IsRejectedByPostgres()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Users.Add(NewUser(latitude: 45.76, longitude: -181));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_AspNetUsers_Longitude_Range", ex.InnerException?.Message ?? string.Empty);
    }

    [Fact]
    public async Task User_LongitudeWithoutLatitude_IsRejectedByPostgres()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Users.Add(NewUser(latitude: null, longitude: 4.84));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_AspNetUsers_Location_Pair", ex.InnerException?.Message ?? string.Empty);
    }

    [Fact]
    public async Task User_ValidPair_IsAccepted()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Users.Add(NewUser(latitude: 45.76, longitude: 4.84));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static Garden NewGarden(string userId, double? latitude, double? longitude) => new()
    {
        Id = Guid.NewGuid(),
        Name = "Terrasse",
        UserId = userId,
        LocationName = latitude is null && longitude is null ? null : "Lyon",
        Latitude = latitude,
        Longitude = longitude,
        LocationResolvedAt = latitude is null && longitude is null ? null : DateTime.UtcNow,
    };

    private static ApplicationUser NewUser(double? latitude, double? longitude)
    {
        var id = $"u-{Guid.NewGuid():N}";
        return new ApplicationUser
        {
            Id = id,
            UserName = id,
            NormalizedUserName = id.ToUpperInvariant(),
            LocationName = latitude is null && longitude is null ? null : "Lyon",
            Latitude = latitude,
            Longitude = longitude,
            LocationResolvedAt = latitude is null && longitude is null ? null : DateTime.UtcNow,
        };
    }

    private async Task<string> SeedUserAsync()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0);",
            userId);
        return userId;
    }
}
