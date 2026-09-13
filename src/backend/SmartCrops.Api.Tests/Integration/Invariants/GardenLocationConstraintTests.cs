using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Invariants;

/// <summary>
/// SMA-336 PR 3a/5 — the location CHECK constraints, exercised against
/// PostgreSQL (the in-memory provider enforces none of them). Proof by failure
/// on both carriers: a latitude of 91, a longitude of 181, a latitude without
/// its longitude and a pair without a non-blank name (review round 1, K4)
/// must each be REJECTED by the database, by the named constraint; a valid
/// pair and an all-NULL row must be accepted.
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
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t")]
    [InlineData("\n")]
    [InlineData("\t \r\n")]
    [InlineData(" ")]
    [InlineData("  ")]
    [InlineData("　")]
    public async Task Garden_PairWithoutAName_IsRejectedByPostgres(string? locationName)
    {
        // Review round 1 (K4): the endpoints refuse a blank name; a direct
        // write must be refused by the database too — a pair is not a place
        // without a name. Review round 2 (K5): « blank » is what
        // string.IsNullOrWhiteSpace says, not « made of spaces » — a tab, a
        // line break, a no-break space are no name either.
        var userId = await SeedUserAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Gardens.Add(NewGarden(userId, latitude: 45.76, longitude: 4.84, locationName));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_Gardens_Location_Name", ex.InnerException?.Message ?? string.Empty);
    }

    [Theory]
    [InlineData("Lyon Part-Dieu")]
    [InlineData("Villeurbanne  Cusset")]
    [InlineData("\tLyon\n")]
    public async Task Garden_NameWithSomethingInIt_IsAccepted(string locationName)
    {
        // The rule refuses a name made ONLY of whitespace; whitespace inside or
        // around a real name is the endpoint's business (it trims), not the
        // database's.
        var userId = await SeedUserAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Gardens.Add(NewGarden(userId, latitude: 45.76, longitude: 4.84, locationName));

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Fact]
    public async Task Garden_NameWithoutAPair_IsTolerated_AndReadsAsNotLocated()
    {
        // The name rule guards the pair, not the name: a name alone breaks no
        // constraint and GeoLocation reads it as « not located ».
        var userId = await SeedUserAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = NewGarden(userId, latitude: null, longitude: null);
        garden.LocationName = "Lyon";
        db.Gardens.Add(garden);

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
        Assert.Null(SmartCrops.Core.Models.GeoLocation.From(garden));
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

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t")]
    [InlineData("\r\n")]
    [InlineData("  ")]
    public async Task User_PairWithoutAName_IsRejectedByPostgres(string? locationName)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Users.Add(NewUser(latitude: 45.76, longitude: 4.84, locationName));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_AspNetUsers_Location_Name", ex.InnerException?.Message ?? string.Empty);
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

    // The name defaults to « Lyon » whenever a coordinate is present and to
    // null otherwise; a test of the name rule passes its own.
    private static Garden NewGarden(string userId, double? latitude, double? longitude, string? locationName = "Lyon") => new()
    {
        Id = Guid.NewGuid(),
        Name = "Terrasse",
        UserId = userId,
        LocationName = latitude is null && longitude is null ? null : locationName,
        Latitude = latitude,
        Longitude = longitude,
        LocationResolvedAt = latitude is null && longitude is null ? null : DateTime.UtcNow,
    };

    private static ApplicationUser NewUser(double? latitude, double? longitude, string? locationName = "Lyon")
    {
        var id = $"u-{Guid.NewGuid():N}";
        return new ApplicationUser
        {
            Id = id,
            UserName = id,
            NormalizedUserName = id.ToUpperInvariant(),
            LocationName = latitude is null && longitude is null ? null : locationName,
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
