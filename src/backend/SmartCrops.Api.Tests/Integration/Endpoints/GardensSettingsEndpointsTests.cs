using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-448, lot F5-a — the two writes of the Gardens widget's settings
/// (pre-flight F5 § C.1, § C.2; decided by Alexandre on 28/09 — contract v3
/// A-N5, A-N6): <c>POST /api/gardens/{id}/open</c>, the ONE stamp of a
/// garden's last opening, and <c>PUT /api/gardens/order</c>, the account's
/// custom order, set-based and without a ceiling. Both leave
/// <c>UpdatedAt</c> INTACT — « dernière modification » stays true — which is
/// the proof the pre-flight asks for first (§ D, proof 1): a write through a
/// tracked entity would make <c>UpdateTimestampInterceptor</c> advance it.
/// </summary>
public class GardensSettingsEndpointsTests : IntegrationTestBase
{
    public GardensSettingsEndpointsTests(PostgresFixture fixture) : base(fixture) { }

    /// <summary>A fixed instant in the past, the garden's last modification before any write of this lot.</summary>
    private static readonly DateTime Before = new(2026, 9, 1, 8, 0, 0, DateTimeKind.Utc);

    private static readonly TimeSpan Tolerance = TimeSpan.FromMinutes(1);

    // ── POST /api/gardens/{id}/open ──────────────────────────────────────────

    [Fact]
    public async Task OpenGarden_StampsTheLastOpening_AndLeavesUpdatedAtIntact()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, "Terrasse");
        AuthAs(userId);

        var response = await Client.PostAsync($"/api/gardens/{gardenId}/open", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var (lastOpenedAt, updatedAt, sortOrder) = await ReadRowAsync(gardenId);
        Assert.NotNull(lastOpenedAt);
        Assert.InRange(lastOpenedAt!.Value, DateTime.UtcNow - Tolerance, DateTime.UtcNow + Tolerance);
        // The proof the pre-flight asks for first: the opening is NOT a
        // modification — the stamp is written by set-based SQL, out of the
        // interceptor's reach, and UpdatedAt does not move by a tick.
        Assert.Equal(Before, updatedAt);
        Assert.Null(sortOrder);
    }

    [Fact]
    public async Task OpenGarden_Twice_KeepsTheLastInstantOnly_NoHistory()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, "Terrasse");
        AuthAs(userId);
        var earlier = new DateTime(2026, 9, 10, 9, 0, 0, DateTimeKind.Utc);
        await SetAsync(gardenId, lastOpenedAt: earlier);

        var response = await Client.PostAsync($"/api/gardens/{gardenId}/open", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var (lastOpenedAt, updatedAt, _) = await ReadRowAsync(gardenId);
        Assert.NotEqual(earlier, lastOpenedAt);
        Assert.InRange(lastOpenedAt!.Value, DateTime.UtcNow - Tolerance, DateTime.UtcNow + Tolerance);
        Assert.Equal(Before, updatedAt);
    }

    [Fact]
    public async Task OpenGarden_AnotherUsersGarden_Returns404_AndStampsNothing()
    {
        var mine = await SeedUserAsync();
        var theirs = await SeedUserAsync();
        var theirGarden = await SeedGardenAsync(theirs, "Their plot");
        AuthAs(mine);

        var response = await Client.PostAsync($"/api/gardens/{theirGarden}/open", null);

        // Ownership answers 404 on the gardens' routes, never 403.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var (lastOpenedAt, updatedAt, _) = await ReadRowAsync(theirGarden);
        Assert.Null(lastOpenedAt);
        Assert.Equal(Before, updatedAt);
    }

    [Fact]
    public async Task OpenGarden_UnknownGarden_Returns404()
    {
        var userId = await SeedUserAsync();
        AuthAs(userId);

        var response = await Client.PostAsync($"/api/gardens/{Guid.NewGuid()}/open", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task OpenGarden_NoBearer_Returns401()
    {
        var response = await Client.PostAsync($"/api/gardens/{Guid.NewGuid()}/open", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>
    /// The guard of the pre-flight (§ D, proof 13): reading a garden — the
    /// planner's two reads — writes NOTHING; only the explicit opening does.
    /// A GET that writes would contradict its own semantics and the contract
    /// (F5: « jamais un GET qui écrit »).
    /// </summary>
    [Fact]
    public async Task GetGardenAndLayout_WriteNothing_NeitherTheOpeningNorAModification()
    {
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, "Terrasse");
        AuthAs(userId);

        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync($"/api/gardens/{gardenId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync($"/api/gardens/{gardenId}/layout")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync("/api/gardens")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync("/api/dashboard")).StatusCode);

        var (lastOpenedAt, updatedAt, sortOrder) = await ReadRowAsync(gardenId);
        Assert.Null(lastOpenedAt);
        Assert.Null(sortOrder);
        Assert.Equal(Before, updatedAt);
    }

    // ── PUT /api/gardens/order ───────────────────────────────────────────────

    [Fact]
    public async Task PutOrder_Expert_WritesEveryPlace_SetBased_WithoutACeiling_UpdatedAtIntact()
    {
        // Sixty gardens (pre-flight § D, proof 2) — more than the fifty-one an
        // order in the widget's options could hold; reversed, so every place
        // is written and none is where it was.
        var userId = await SeedUserAsync("expert");
        var gardens = new List<Guid>();
        for (var i = 0; i < 60; i++) gardens.Add(await SeedGardenAsync(userId, $"Jardin {i:00}"));
        AuthAs(userId);
        var order = gardens.AsEnumerable().Reverse().ToList();

        var response = await Client.PutAsJsonAsync("/api/gardens/order", new { ids = order });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var rows = await ReadRowsAsync(userId);
        Assert.Equal(60, rows.Count);
        for (var place = 0; place < order.Count; place++)
        {
            var (lastOpenedAt, updatedAt, sortOrder) = rows[order[place]];
            Assert.Equal(place, sortOrder);
            Assert.Null(lastOpenedAt);
            Assert.Equal(Before, updatedAt);
        }
    }

    [Fact]
    public async Task PutOrder_Again_ReplacesEveryPlace()
    {
        var userId = await SeedUserAsync("expert");
        var a = await SeedGardenAsync(userId, "A");
        var b = await SeedGardenAsync(userId, "B");
        var c = await SeedGardenAsync(userId, "C");
        AuthAs(userId);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync("/api/gardens/order", new { ids = new[] { a, b, c } })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await Client.PutAsJsonAsync("/api/gardens/order", new { ids = new[] { c, a, b } })).StatusCode);

        var rows = await ReadRowsAsync(userId);
        Assert.Equal(0, rows[c].SortOrder);
        Assert.Equal(1, rows[a].SortOrder);
        Assert.Equal(2, rows[b].SortOrder);
    }

    /// <summary>
    /// [P] A list that names SOME of the account's gardens writes their places
    /// and leaves the others as they were — a tab that missed a garden created
    /// elsewhere still writes a coherent order; the client puts an unranked
    /// garden at the head.
    /// </summary>
    [Fact]
    public async Task PutOrder_APartialList_LeavesTheGardensItDoesNotName_AsTheyWere()
    {
        var userId = await SeedUserAsync("expert");
        var a = await SeedGardenAsync(userId, "A");
        var b = await SeedGardenAsync(userId, "B");
        var c = await SeedGardenAsync(userId, "C");
        await SetAsync(c, sortOrder: 7);
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync("/api/gardens/order", new { ids = new[] { b, a } });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var rows = await ReadRowsAsync(userId);
        Assert.Equal(0, rows[b].SortOrder);
        Assert.Equal(1, rows[a].SortOrder);
        Assert.Equal(7, rows[c].SortOrder);
    }

    [Theory]
    [InlineData("gardener")]
    [InlineData("novice")]
    public async Task PutOrder_AFormulaWithoutTheCustomOrder_Returns403_FormulaGardenOrder_AndWritesNothing(string formula)
    {
        var userId = await SeedUserAsync(formula);
        var a = await SeedGardenAsync(userId, "A");
        var b = await SeedGardenAsync(userId, "B");
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync("/api/gardens/order", new { ids = new[] { b, a } });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("formula.gardenOrder", problem.RootElement.GetProperty("code").GetString());
        Assert.Equal(formula, problem.RootElement.GetProperty("formula").GetString());
        var rows = await ReadRowsAsync(userId);
        Assert.All(rows.Values, row => Assert.Null(row.SortOrder));
        Assert.All(rows.Values, row => Assert.Equal(Before, row.UpdatedAt));
    }

    [Fact]
    public async Task PutOrder_ADuplicateId_Returns400_AndWritesNothing()
    {
        var userId = await SeedUserAsync("expert");
        var a = await SeedGardenAsync(userId, "A");
        var b = await SeedGardenAsync(userId, "B");
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync("/api/gardens/order", new { ids = new[] { b, a, b } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("ids must be distinct", await response.Content.ReadAsStringAsync());
        Assert.All((await ReadRowsAsync(userId)).Values, row => Assert.Null(row.SortOrder));
    }

    [Fact]
    public async Task PutOrder_AnotherUsersId_Returns400_Never404_AndWritesNothingAtAll()
    {
        // Strict on write, and atomic: an id of another account refuses the
        // WHOLE list — 400 on the list, never a 404 that would name a garden
        // — and none of the caller's own places is written either.
        var mine = await SeedUserAsync("expert");
        var theirs = await SeedUserAsync("expert");
        var a = await SeedGardenAsync(mine, "A");
        var b = await SeedGardenAsync(mine, "B");
        var theirGarden = await SeedGardenAsync(theirs, "Their plot");
        AuthAs(mine);

        var response = await Client.PutAsJsonAsync("/api/gardens/order", new { ids = new[] { b, theirGarden, a } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("ids must all be gardens of the caller", await response.Content.ReadAsStringAsync());
        Assert.All((await ReadRowsAsync(mine)).Values, row => Assert.Null(row.SortOrder));
        Assert.Null((await ReadRowAsync(theirGarden)).SortOrder);
    }

    [Fact]
    public async Task PutOrder_AnUnknownId_Returns400()
    {
        var userId = await SeedUserAsync("expert");
        var a = await SeedGardenAsync(userId, "A");
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync("/api/gardens/order", new { ids = new[] { a, Guid.NewGuid() } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("ids must all be gardens of the caller", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task PutOrder_AnEmptyList_Returns400()
    {
        var userId = await SeedUserAsync("expert");
        AuthAs(userId);

        var response = await Client.PutAsJsonAsync("/api/gardens/order", new { ids = Array.Empty<Guid>() });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PutOrder_NoBearer_Returns401()
    {
        var response = await Client.PutAsJsonAsync("/api/gardens/order", new { ids = new[] { Guid.NewGuid() } });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ── DELETE /api/gardens/{id} — the opening and the place go with the garden ──

    /// <summary>
    /// SMA-448, the final text of the Terms and the policy, § 5.2, T2: the
    /// policy says that the date a garden was last opened and its rank in the
    /// custom order « are kept until that garden or the account is deleted,
    /// then erased » — two columns of the garden's row, which goes with it
    /// (<c>GardensController.DeleteGarden</c>). No test of
    /// <c>DELETE /api/gardens/{id}</c> existed on develop. The garden opened
    /// and ranked, deleted by its account: 204, its row gone; the account's
    /// other garden, ranked too, stays as it was.
    /// </summary>
    [Fact]
    public async Task DeleteGarden_Own_Returns204_TheRowGoes_WithItsOpeningAndPlace()
    {
        var userId = await SeedUserAsync("expert");
        var gardenId = await SeedGardenAsync(userId, "Terrasse");
        var other = await SeedGardenAsync(userId, "Balcon");
        var opened = new DateTime(2026, 9, 20, 18, 45, 0, DateTimeKind.Utc);
        await SetAsync(gardenId, lastOpenedAt: opened, sortOrder: 0);
        await SetAsync(other, sortOrder: 1);
        AuthAs(userId);
        Assert.Equal(new Row(opened, Before, 0), await ReadRowAsync(gardenId));

        var response = await Client.DeleteAsync($"/api/gardens/{gardenId}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.False(await GardenExistsAsync(gardenId), "the garden's row — its opening and its place in it — should be gone");
        var rows = await ReadRowsAsync(userId);
        Assert.Equal([other], rows.Keys);
        Assert.Equal(new Row(null, Before, 1), rows[other]);
    }

    /// <summary>
    /// The other half of T2: a garden of another account answers 404 — the
    /// gardens' routes never say 403, which would name it — and nothing of
    /// it is deleted, its opening and its place included.
    /// </summary>
    [Fact]
    public async Task DeleteGarden_AnotherUsersGarden_Returns404_AndDeletesNothing()
    {
        var mine = await SeedUserAsync("expert");
        var theirs = await SeedUserAsync("expert");
        var theirGarden = await SeedGardenAsync(theirs, "Their plot");
        var opened = new DateTime(2026, 9, 20, 18, 45, 0, DateTimeKind.Utc);
        await SetAsync(theirGarden, lastOpenedAt: opened, sortOrder: 3);
        AuthAs(mine);

        var response = await Client.DeleteAsync($"/api/gardens/{theirGarden}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.True(await GardenExistsAsync(theirGarden));
        Assert.Equal(new Row(opened, Before, 3), await ReadRowAsync(theirGarden));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void AuthAs(string userId) =>
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));

    private async Task<string> SeedUserAsync(string formula = "gardener")
    {
        var userId = $"u-{Guid.NewGuid():N}";
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

    /// <summary>A garden last modified at <see cref="Before"/> — the instant every write of this lot must leave where it is.</summary>
    private async Task<Guid> SeedGardenAsync(string userId, string name)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = new Garden
        {
            Id = Guid.NewGuid(),
            Name = name,
            UserId = userId,
            CreatedAt = Before,
            UpdatedAt = Before,
        };
        db.Gardens.Add(garden);
        await db.SaveChangesAsync();
        return garden.Id;
    }

    /// <summary>
    /// Writes the two columns straight to the row — the state a test starts
    /// from. Typed Npgsql parameters: EF Core maps no store type for a DBNull
    /// handed to a raw statement (the lesson of <c>FormulaBackfillMigrationTests</c>).
    /// </summary>
    private async Task SetAsync(Guid gardenId, DateTime? lastOpenedAt = null, int? sortOrder = null)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await connection.OpenAsync();
        try
        {
            await using var command = new NpgsqlCommand(
                @"UPDATE ""Gardens"" SET ""LastOpenedAt"" = @opened, ""SortOrder"" = @place WHERE ""Id"" = @id", connection);
            command.Parameters.Add(new NpgsqlParameter("id", NpgsqlTypes.NpgsqlDbType.Uuid) { Value = gardenId });
            command.Parameters.Add(new NpgsqlParameter("opened", NpgsqlTypes.NpgsqlDbType.TimestampTz) { Value = lastOpenedAt.HasValue ? lastOpenedAt.Value : DBNull.Value });
            command.Parameters.Add(new NpgsqlParameter("place", NpgsqlTypes.NpgsqlDbType.Integer) { Value = sortOrder.HasValue ? sortOrder.Value : DBNull.Value });
            Assert.Equal(1, await command.ExecuteNonQueryAsync());
        }
        finally
        {
            await connection.CloseAsync();
        }
    }

    private sealed record Row(DateTime? LastOpenedAt, DateTime UpdatedAt, int? SortOrder);

    /// <summary>Whether a row with this id is in the table at all — whoever owns it.</summary>
    private async Task<bool> GardenExistsAsync(Guid gardenId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        return await db.Gardens.AsNoTracking().AnyAsync(g => g.Id == gardenId);
    }

    private async Task<Row> ReadRowAsync(Guid gardenId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await connection.OpenAsync();
        try
        {
            await using var command = new NpgsqlCommand(
                @"SELECT ""LastOpenedAt"", ""UpdatedAt"", ""SortOrder"" FROM ""Gardens"" WHERE ""Id"" = @id", connection);
            command.Parameters.AddWithValue("id", gardenId);
            await using var reader = await command.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync(), "Expected the garden to exist");
            return new Row(
                reader.IsDBNull(0) ? null : reader.GetFieldValue<DateTime>(0),
                reader.GetFieldValue<DateTime>(1),
                reader.IsDBNull(2) ? null : reader.GetInt32(2));
        }
        finally
        {
            await connection.CloseAsync();
        }
    }

    private async Task<Dictionary<Guid, Row>> ReadRowsAsync(string userId)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await connection.OpenAsync();
        try
        {
            var rows = new Dictionary<Guid, Row>();
            await using var command = new NpgsqlCommand(
                @"SELECT ""Id"", ""LastOpenedAt"", ""UpdatedAt"", ""SortOrder"" FROM ""Gardens"" WHERE ""UserId"" = @user", connection);
            command.Parameters.AddWithValue("user", userId);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                rows[reader.GetGuid(0)] = new Row(
                    reader.IsDBNull(1) ? null : reader.GetFieldValue<DateTime>(1),
                    reader.GetFieldValue<DateTime>(2),
                    reader.IsDBNull(3) ? null : reader.GetInt32(3));
            }
            return rows;
        }
        finally
        {
            await connection.CloseAsync();
        }
    }
}
