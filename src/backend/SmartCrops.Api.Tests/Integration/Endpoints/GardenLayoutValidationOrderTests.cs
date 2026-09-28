using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-448, PR #297, fix round 1 (S1 — GitHub G1, Extension E1): the
/// validations of <c>PUT /api/gardens/{id}/layout</c> that depend on the
/// request alone — the cell size's whitelist and the config's — run BEFORE
/// the transaction and the account's lock. A malformed request used to open
/// the transaction, lock the account's row and load the garden with its
/// placements before answering 400: for the time of that work it held the
/// lock a switch of formula, a creation or another save of the same account
/// waits on — and, the row locked by another transaction, it waited for the
/// release to answer a 400 it could have given at once.
///
/// <para>The order of the refusals changes with it, and these tests say
/// how: an invalid cell size on a garden of another account answers
/// <b>400, not the ownership's 404</b> (a 400 says nothing about the
/// garden); a request at once too large for the formula and malformed
/// answers <b>400 before the formula's 403</b>.</para>
/// </summary>
public class GardenLayoutValidationOrderTests : IntegrationTestBase
{
    public GardenLayoutValidationOrderTests(PostgresFixture fixture) : base(fixture) { }

    /// <summary>Long enough for a request that answers at once, short enough to say it waited.</summary>
    private static readonly TimeSpan Patience = TimeSpan.FromSeconds(3);

    /// <summary>The proof by failure: the account's row locked elsewhere, an invalid cell size WAITED for the release; it answers 400 at once.</summary>
    [Fact]
    public async Task SaveLayout_InvalidCellSize_Answers400AtOnce_WhileAnotherTransactionHoldsTheAccountsLock()
    {
        var userId = await SeedUserAsync("novice");
        var gardenId = await SeedGardenAsync(userId, 10, 10);
        AuthAs(userId);

        await using var holder = await HoldTheAccountsLockAsync(userId);

        var request = Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", new SaveLayoutRequestDto(10, 10, "M", null, null, []));
        var settled = await Task.WhenAny(request, Task.Delay(Patience));

        Assert.True(ReferenceEquals(settled, request), $"The request with an invalid cell size waited more than {Patience.TotalSeconds} s for the account's lock instead of answering 400 at once.");
        var response = await request;
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("cellSize", await response.Content.ReadAsStringAsync());
    }

    /// <summary>The same for the config, which depends on the request alone too.</summary>
    [Fact]
    public async Task SaveLayout_InvalidConfig_Answers400AtOnce_WhileAnotherTransactionHoldsTheAccountsLock()
    {
        var userId = await SeedUserAsync("novice");
        var gardenId = await SeedGardenAsync(userId, 10, 10);
        AuthAs(userId);

        await using var holder = await HoldTheAccountsLockAsync(userId);

        var request = Client.PutAsJsonAsync(
            $"/api/gardens/{gardenId}/layout",
            new SaveLayoutRequestDto(10, 10, "50cm", null, new GardenConfigRequestDto("X", null, null, null, null), []));
        var settled = await Task.WhenAny(request, Task.Delay(Patience));

        Assert.True(ReferenceEquals(settled, request), $"The request with an invalid config waited more than {Patience.TotalSeconds} s for the account's lock instead of answering 400 at once.");
        var response = await request;
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("orientation", await response.Content.ReadAsStringAsync());
    }

    /// <summary>The order changed, said: a 400 on a garden of another account, where the ownership's 404 came first.</summary>
    [Fact]
    public async Task SaveLayout_InvalidCellSize_OnAnotherAccountsGarden_Answers400_NotTheOwnerships404()
    {
        var owner = await SeedUserAsync("novice");
        var gardenId = await SeedGardenAsync(owner, 10, 10);
        var other = await SeedUserAsync("novice");
        AuthAs(other);

        var response = await Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", new SaveLayoutRequestDto(10, 10, "M", null, null, []));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(10, await StoredWidthAsync(gardenId));
    }

    /// <summary>The order changed, said: a request at once too large and malformed answers 400, where the formula's 403 came first.</summary>
    [Fact]
    public async Task SaveLayout_TooLargeAndMalformed_Answers400_BeforeTheFormulas403()
    {
        var userId = await SeedUserAsync("novice");
        var gardenId = await SeedGardenAsync(userId, 20, 20);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync(
            $"/api/gardens/{gardenId}/layout",
            new SaveLayoutRequestDto(21, 20, "50cm", null, new GardenConfigRequestDto("X", null, null, null, null), []));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("orientation", await response.Content.ReadAsStringAsync());
        Assert.Equal(20, await StoredWidthAsync(gardenId));
    }

    /// <summary>A valid request still waits for the lock and lands after it: the reorder moved the validations, not the lock.</summary>
    [Fact]
    public async Task SaveLayout_ValidRequest_StillWaitsForTheAccountsLock_ThenLands()
    {
        var userId = await SeedUserAsync("novice");
        var gardenId = await SeedGardenAsync(userId, 10, 10);
        AuthAs(userId);

        var holder = await HoldTheAccountsLockAsync(userId);
        var request = Client.PutAsJsonAsync($"/api/gardens/{gardenId}/layout", new SaveLayoutRequestDto(12, 12, "50cm", null, null, []));
        try
        {
            var settled = await Task.WhenAny(request, Task.Delay(Patience));

            Assert.False(ReferenceEquals(settled, request), "A valid request answered without waiting for the account's lock.");
        }
        finally
        {
            // Released whatever the assertion says (SMA-448, PR #297, fix round 2, T1 — GitHub G4, Extension):
            // a failed assertion would otherwise leave the row locked, and the next test's reset would wait on it.
            await holder.DisposeAsync();
        }
        var response = await request;
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(12, await StoredWidthAsync(gardenId));
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /// <summary>Another transaction holding the account's row — what a switch of formula or another save holds (<see cref="AccountFormulaLock"/>); released on dispose — and released at once when the lock cannot be taken (SMA-448, PR #297, fix round 2, T1).</summary>
    private async Task<LockHolder> HoldTheAccountsLockAsync(string userId)
    {
        var connection = new NpgsqlConnection(Fixture.ConnectionString);
        NpgsqlTransaction? transaction = null;
        try
        {
            await connection.OpenAsync();
            transaction = await connection.BeginTransactionAsync();
            await using var command = new NpgsqlCommand("SELECT \"Formula\" FROM \"AspNetUsers\" WHERE \"Id\" = @id FOR UPDATE", connection, transaction);
            command.Parameters.AddWithValue("id", userId);
            await command.ExecuteScalarAsync();
            return new LockHolder(connection, transaction);
        }
        catch
        {
            if (transaction is not null) await transaction.DisposeAsync();
            await connection.DisposeAsync();
            throw;
        }
    }

    private sealed class LockHolder(NpgsqlConnection connection, NpgsqlTransaction transaction) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            await transaction.RollbackAsync();
            await transaction.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private void AuthAs(string userId) =>
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));

    private async Task<string> SeedUserAsync(string formula)
    {
        var userId = Guid.NewGuid().ToString();
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"", ""Formula"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0, {1});",
            userId, formula);
        return userId;
    }

    private async Task<Guid> SeedGardenAsync(string userId, int width, int height)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = new Garden
        {
            Id = Guid.NewGuid(),
            Name = "Garden",
            UserId = userId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            LayoutWidth = width,
            LayoutHeight = height,
            CellSize = "50cm",
        };
        db.Gardens.Add(garden);
        await db.SaveChangesAsync();
        return garden.Id;
    }

    private async Task<int?> StoredWidthAsync(Guid gardenId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        return (await db.Gardens.AsNoTracking().SingleAsync(g => g.Id == gardenId)).LayoutWidth;
    }

    private record SaveLayoutRequestDto(int Width, int Height, string CellSize, string? CellsJson, GardenConfigRequestDto? Config, List<object> Placements);

    private record GardenConfigRequestDto(string? Orientation, string? GardenType, List<object>? LightSchedule, string? Hemisphere, string? LatitudeBand);
}
