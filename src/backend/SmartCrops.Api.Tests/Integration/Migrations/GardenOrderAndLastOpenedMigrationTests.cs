using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using SmartCrops.Infrastructure.Data;
using Testcontainers.PostgreSql;

namespace SmartCrops.Api.Tests.Integration.Migrations;

/// <summary>
/// SMA-448, lot F5-a — <c>AddGardenOrderAndLastOpened</c>, proven on a REAL
/// PostgreSQL, on the <see cref="FormulaBackfillMigrationTests"/> pattern: a
/// container of its own and a fresh database per test, stopped at the migration
/// BEFORE this one, given the rows the image before can hold, then migrated.
///
/// <para>What is proven (pre-flight F5 § C.5; contract v3 A-N5, A-N6): the
/// migration adds the two NULLABLE columns and the one CHECK, and touches
/// nothing else of <c>Gardens</c> — not a column, not an index; every existing
/// garden reads NULL on both (« never opened », « not yet ranked »); the CHECK
/// refuses a negative place and accepts zero and NULL; <b>the image before
/// still reads and creates a garden on the migrated schema</b> — a SELECT and
/// an INSERT naming its twenty-one columns and no other, the statements EF Core
/// 8 emits for the entity of <c>develop</c> at <c>e640de7</c> — so the
/// rollback of the image is safe; and <c>Down</c> gives the twenty-one columns
/// back, the CHECK gone.</para>
/// </summary>
public sealed class GardenOrderAndLastOpenedMigrationTests : IClassFixture<GardenOrderAndLastOpenedMigrationTests.Container>
{
    private readonly Container _container;

    public GardenOrderAndLastOpenedMigrationTests(Container container) => _container = container;

    /// <summary>One PostgreSQL 16 for the class — the engine of the dev compose and of production.</summary>
    public sealed class Container : IAsyncLifetime
    {
        private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine")
            .WithDatabase("smartcrops")
            .WithUsername("test")
            .WithPassword("test")
            .WithCleanUp(true)
            .Build();

        public string ConnectionString => _postgres.GetConnectionString();

        public Task InitializeAsync() => _postgres.StartAsync();

        public Task DisposeAsync() => _postgres.DisposeAsync().AsTask();
    }

    private const string MigrationSuffix = "_AddGardenOrderAndLastOpened";

    /// <summary>
    /// The twenty-one columns of <c>Gardens</c> as the image before maps them
    /// (<c>Garden.cs</c> at <c>e640de7</c>), in the snapshot's order — what its
    /// SELECT reads and its INSERT names.
    /// </summary>
    private static readonly string[] ColumnsBefore =
    [
        "Id", "CellSize", "CellsJson", "CreatedAt", "Description", "GardenType", "Hemisphere", "Latitude",
        "LatitudeBand", "LayoutHeight", "LayoutWidth", "LightScheduleJson", "LocationCountry", "LocationName",
        "LocationRegion", "LocationResolvedAt", "Longitude", "Name", "Orientation", "UpdatedAt", "UserId",
    ];

    [Fact]
    public async Task Migration_AddsTwoNullableColumnsAndTheCheck_AndTouchesNothingElseOfGardens()
    {
        await using var db = await NewDatabaseAsync();
        await MigrateToJustBeforeAsync(db);
        await SeedAccountAsync(db, "account");
        var gardenId = await SeedGardenBeforeAsync(db, "account", "Terrasse");
        var columnsBefore = await GardensColumnsAsync(db);
        var indexesBefore = await GardensIndexesAsync(db);
        var checksBefore = await GardensChecksAsync(db);
        Assert.Equal(21, columnsBefore.Count);

        await MigrateToThisAsync(db);

        // Two columns more, nullable, without a default — and the twenty-one of
        // before untouched, column for column.
        var columnsAfter = await GardensColumnsAsync(db);
        Assert.Equal(23, columnsAfter.Count);
        Assert.Equal(columnsBefore, columnsAfter.Where(column => !column.StartsWith("LastOpenedAt ") && !column.StartsWith("SortOrder ")).ToList());
        Assert.Contains("LastOpenedAt timestamp with time zone YES ", columnsAfter);
        Assert.Contains("SortOrder integer YES ", columnsAfter);

        // No index created, none touched.
        Assert.Equal(indexesBefore, await GardensIndexesAsync(db));

        // One CHECK more, the one of the order, and none other touched.
        var checksAfter = await GardensChecksAsync(db);
        Assert.Equal(checksBefore.Count + 1, checksAfter.Count);
        Assert.Contains(checksAfter, check => check.StartsWith("CK_Gardens_SortOrder_NonNegative "));
        Assert.All(checksBefore, check => Assert.Contains(check, checksAfter));

        // Every existing garden: never opened, not yet ranked.
        Assert.Equal((false, false), await ReadNewColumnsAsync(db, gardenId));
    }

    [Fact]
    public async Task MigratedSchema_RefusesANegativePlace_AcceptsZeroAndNull()
    {
        await using var db = await NewDatabaseAsync();
        await MigrateToJustBeforeAsync(db);
        await SeedAccountAsync(db, "account");
        var gardenId = await SeedGardenBeforeAsync(db, "account", "Terrasse");
        await MigrateToThisAsync(db);

        var refused = await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlRawAsync(@"UPDATE ""Gardens"" SET ""SortOrder"" = -1 WHERE ""Id"" = {0};", gardenId));
        Assert.Equal("23514", refused.SqlState);
        Assert.Equal("CK_Gardens_SortOrder_NonNegative", refused.ConstraintName);

        Assert.Equal(1, await db.Database.ExecuteSqlRawAsync(@"UPDATE ""Gardens"" SET ""SortOrder"" = 0 WHERE ""Id"" = {0};", gardenId));
        Assert.Equal(1, await db.Database.ExecuteSqlRawAsync(@"UPDATE ""Gardens"" SET ""SortOrder"" = NULL WHERE ""Id"" = {0};", gardenId));
    }

    [Fact]
    public async Task MigratedSchema_TheImageBefore_StillReadsAndCreatesAGarden()
    {
        await using var db = await NewDatabaseAsync();
        await MigrateToJustBeforeAsync(db);
        await SeedAccountAsync(db, "account");
        var existing = await SeedGardenBeforeAsync(db, "account", "Terrasse");

        await MigrateToThisAsync(db);

        // The image before READS its twenty-one columns by name — the SELECT
        // EF Core emits for its entity — and finds the garden of before…
        var names = await SelectBeforeAsync(db, "account");
        Assert.Equal(["Terrasse"], names);

        // …and CREATES a garden naming its twenty-one columns and no other —
        // the INSERT it emits — on the migrated schema, the two new columns
        // taking their NULL.
        var created = await SeedGardenBeforeAsync(db, "account", "Balcon sud");
        Assert.Equal(["Balcon sud", "Terrasse"], await SelectBeforeAsync(db, "account"));
        Assert.Equal((false, false), await ReadNewColumnsAsync(db, created));
        Assert.Equal((false, false), await ReadNewColumnsAsync(db, existing));
    }

    [Fact]
    public async Task Down_GivesTheTwentyOneColumnsBack_TheCheckGone_TheGardensKept()
    {
        await using var db = await NewDatabaseAsync();
        await MigrateToJustBeforeAsync(db);
        await SeedAccountAsync(db, "account");
        var gardenId = await SeedGardenBeforeAsync(db, "account", "Terrasse");
        var columnsBefore = await GardensColumnsAsync(db);
        var checksBefore = await GardensChecksAsync(db);
        await MigrateToThisAsync(db);
        await db.Database.ExecuteSqlRawAsync(@"UPDATE ""Gardens"" SET ""SortOrder"" = 3, ""LastOpenedAt"" = CURRENT_TIMESTAMP WHERE ""Id"" = {0};", gardenId);

        await db.GetService<IMigrator>().MigrateAsync(JustBeforeId(db));

        Assert.Equal(columnsBefore, await GardensColumnsAsync(db));
        Assert.Equal(checksBefore, await GardensChecksAsync(db));
        Assert.Equal(["Terrasse"], await SelectBeforeAsync(db, "account"));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>A database of its own on the class's container, and a context on it.</summary>
    private async Task<SmartCropsDbContext> NewDatabaseAsync()
    {
        var name = "gardens_" + Guid.NewGuid().ToString("N");
        await using (var admin = new NpgsqlConnection(_container.ConnectionString))
        {
            await admin.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", admin);
            await create.ExecuteNonQueryAsync();
        }

        var connectionString = new NpgsqlConnectionStringBuilder(_container.ConnectionString) { Database = name }.ConnectionString;
        var options = new DbContextOptionsBuilder<SmartCropsDbContext>().UseNpgsql(connectionString).Options;
        return new SmartCropsDbContext(options);
    }

    /// <summary>The id of this migration — asserted to exist, so its absence reads as a red, not a crash.</summary>
    private static string ThisId(SmartCropsDbContext db)
    {
        var id = db.Database.GetMigrations().SingleOrDefault(m => m.EndsWith(MigrationSuffix, StringComparison.Ordinal));
        Assert.True(id is not null, "Expected an AddGardenOrderAndLastOpened migration in the assembly");
        return id!;
    }

    /// <summary>The id of the migration just before this one — the schema of the image before.</summary>
    private static string JustBeforeId(SmartCropsDbContext db)
    {
        var all = db.Database.GetMigrations().ToList();
        var index = all.IndexOf(ThisId(db));
        Assert.True(index > 0, "AddGardenOrderAndLastOpened cannot be the first migration");
        return all[index - 1];
    }

    private static Task MigrateToJustBeforeAsync(SmartCropsDbContext db) =>
        db.GetService<IMigrator>().MigrateAsync(JustBeforeId(db));

    private static Task MigrateToThisAsync(SmartCropsDbContext db) =>
        db.GetService<IMigrator>().MigrateAsync(ThisId(db));

    /// <summary>An account — the columns Identity requires, the rest null; the formula takes the column's default.</summary>
    private static Task SeedAccountAsync(SmartCropsDbContext db, string userId) =>
        db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0);",
            userId);

    /// <summary>
    /// A garden CREATED AS THE IMAGE BEFORE CREATES ONE: an INSERT naming its
    /// twenty-one columns and no other — <see cref="ColumnsBefore"/> — the
    /// statement EF Core 8 emits for the entity of <c>e640de7</c>.
    /// </summary>
    private static async Task<Guid> SeedGardenBeforeAsync(SmartCropsDbContext db, string userId, string name)
    {
        var id = Guid.NewGuid();
        // The column list is a constant of this file, concatenated rather than
        // interpolated: EF1002 flags an interpolated string handed to a raw
        // statement, and the three values are bound as parameters below.
        var columns = string.Join(", ", ColumnsBefore.Select(column => "\"" + column + "\""));
        var sql =
            "INSERT INTO \"Gardens\" (" + columns + ") VALUES ("
            + "{0}, NULL, NULL, CURRENT_TIMESTAMP, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, {1}, NULL, CURRENT_TIMESTAMP, {2});";
        await db.Database.ExecuteSqlRawAsync(sql, id, name, userId);
        return id;
    }

    /// <summary>
    /// The gardens of an account READ AS THE IMAGE BEFORE READS THEM: a SELECT
    /// naming its twenty-one columns and no other, newest first then by id —
    /// the statement of <c>GET /api/gardens</c> at <c>e640de7</c>. Their names.
    /// </summary>
    private static async Task<List<string>> SelectBeforeAsync(SmartCropsDbContext db, string userId)
    {
        var columns = string.Join(", ", ColumnsBefore.Select(column => "g.\"" + column + "\""));
        var names = new List<string>();
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await connection.OpenAsync();
        try
        {
            await using var command = new NpgsqlCommand(
                "SELECT " + columns + " FROM \"Gardens\" AS g WHERE g.\"UserId\" = @user ORDER BY g.\"CreatedAt\" DESC, g.\"Id\"",
                connection);
            command.Parameters.AddWithValue("user", userId);
            await using var reader = await command.ExecuteReaderAsync();
            Assert.Equal(ColumnsBefore.Length, reader.FieldCount);
            while (await reader.ReadAsync()) names.Add(reader.GetString(reader.GetOrdinal("Name")));
        }
        finally
        {
            await connection.CloseAsync();
        }

        return names.Order(StringComparer.Ordinal).ToList();
    }

    /// <summary>Whether the garden has a last opening and a place — both false on every garden the migration finds.</summary>
    private static async Task<(bool Opened, bool Ranked)> ReadNewColumnsAsync(SmartCropsDbContext db, Guid gardenId)
    {
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await connection.OpenAsync();
        try
        {
            await using var command = new NpgsqlCommand(
                @"SELECT ""LastOpenedAt"" IS NOT NULL, ""SortOrder"" IS NOT NULL FROM ""Gardens"" WHERE ""Id"" = @id",
                connection);
            command.Parameters.AddWithValue("id", gardenId);
            await using var reader = await command.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync(), "Expected the garden to exist");
            return (reader.GetBoolean(0), reader.GetBoolean(1));
        }
        finally
        {
            await connection.CloseAsync();
        }
    }

    /// <summary>The columns of <c>Gardens</c>, in order, with their types, nullability and default.</summary>
    private static Task<List<string>> GardensColumnsAsync(SmartCropsDbContext db) =>
        StringsAsync(
            db,
            @"SELECT column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
              FROM information_schema.columns
              WHERE table_name = 'Gardens'
              ORDER BY ordinal_position");

    /// <summary>The indexes of <c>Gardens</c>, by definition.</summary>
    private static Task<List<string>> GardensIndexesAsync(SmartCropsDbContext db) =>
        StringsAsync(db, @"SELECT indexdef FROM pg_indexes WHERE tablename = 'Gardens' ORDER BY indexname");

    /// <summary>The CHECK constraints of <c>Gardens</c>: name and definition.</summary>
    private static Task<List<string>> GardensChecksAsync(SmartCropsDbContext db) =>
        StringsAsync(
            db,
            @"SELECT c.conname || ' ' || pg_get_constraintdef(c.oid)
              FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
              WHERE t.relname = 'Gardens' AND c.contype = 'c'
              ORDER BY c.conname");

    private static async Task<List<string>> StringsAsync(SmartCropsDbContext db, string sql)
    {
        var values = new List<string>();
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await connection.OpenAsync();
        try
        {
            await using var command = new NpgsqlCommand(sql, connection);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) values.Add(reader.GetString(0));
        }
        finally
        {
            await connection.CloseAsync();
        }

        return values;
    }
}
