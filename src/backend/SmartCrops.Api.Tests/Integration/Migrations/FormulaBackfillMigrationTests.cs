using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using SmartCrops.Infrastructure.Data;
using Testcontainers.PostgreSql;

namespace SmartCrops.Api.Tests.Integration.Migrations;

/// <summary>
/// SMA-448, lot F1, step S1 — the formula backfill, proven on a REAL
/// PostgreSQL. The shared <c>PostgresFixture</c> migrates once, to the latest
/// migration, before any data exists; a backfill can only be proven by a
/// database stopped at the migration BEFORE <c>AddFormulas</c>, given the rows
/// an account can hold there, then migrated. Hence a container of its own, and
/// a fresh database per test, created on it.
///
/// <para>What is proven (pre-flight § C.6 a, decided on 26/09): an account
/// takes the EFFECTIVE level of its stored layout — the level the dashboard
/// reads today (<c>DashboardController.ToResponse</c>: schema version 1, a
/// document with a block list, one of the three levels) — and every other
/// account takes <c>gardener</c>, the level it has always read; no account has
/// CHOSEN (<c>FormulaChosenAt</c> null for all); replaying the backfill changes
/// nothing; and the image before the migration still reads ONE layout row per
/// account from the migrated schema — the rollback of the image is safe.</para>
/// </summary>
public sealed class FormulaBackfillMigrationTests : IClassFixture<FormulaBackfillMigrationTests.Container>
{
    private readonly Container _container;

    public FormulaBackfillMigrationTests(Container container) => _container = container;

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

    private const string AddFormulasSuffix = "_AddFormulas";

    [Fact]
    public async Task Backfill_TakesTheEffectiveLevel_ElseGardener_AndNobodyHasChosen()
    {
        await using var db = await NewDatabaseAsync();
        await MigrateToJustBeforeAddFormulasAsync(db);

        await SeedAccountAsync(db, "expert-layout", Layout(1, "expert"));
        await SeedAccountAsync(db, "novice-layout", Layout(1, "novice"));
        await SeedAccountAsync(db, "gardener-layout", Layout(1, "gardener"));
        await SeedAccountAsync(db, "no-layout", layoutJson: null, withRow: false);
        await SeedAccountAsync(db, "null-document", layoutJson: null, withRow: true);
        // Unreadable, each in the way `ToResponse` answers the default level for:
        // a version this server does not know, a level it does not know, and a
        // document without a block list (Parse returns null on it).
        await SeedAccountAsync(db, "future-version", Layout(42, "expert"), schemaVersion: 42);
        await SeedAccountAsync(db, "unknown-level", Layout(1, "archdruid"));
        await SeedAccountAsync(db, "no-blocks", """{"schemaVersion":1,"level":"expert"}""");

        await MigrateToAddFormulasAsync(db);

        var formulas = await ReadFormulasAsync(db);
        Assert.Equal("expert", formulas["expert-layout"].Formula);
        Assert.Equal("novice", formulas["novice-layout"].Formula);
        Assert.Equal("gardener", formulas["gardener-layout"].Formula);
        Assert.Equal("gardener", formulas["no-layout"].Formula);
        Assert.Equal("gardener", formulas["null-document"].Formula);
        Assert.Equal("gardener", formulas["future-version"].Formula);
        Assert.Equal("gardener", formulas["unknown-level"].Formula);
        Assert.Equal("gardener", formulas["no-blocks"].Formula);
        Assert.All(formulas.Values, account => Assert.Null(account.ChosenAt));
    }

    [Fact]
    public async Task Backfill_Replayed_ChangesNothing_AndNeverOverwritesADeliberateChoice()
    {
        await using var db = await NewDatabaseAsync();
        await MigrateToJustBeforeAddFormulasAsync(db);
        await SeedAccountAsync(db, "expert-layout", Layout(1, "expert"));
        await SeedAccountAsync(db, "no-layout", layoutJson: null, withRow: false);
        await SeedAccountAsync(db, "chose-novice", Layout(1, "expert"));
        await MigrateToAddFormulasAsync(db);

        // A deliberate choice made after the migration: the account chose
        // Novice while its stored layout still says expert.
        var chosenAt = new DateTime(2026, 9, 26, 12, 0, 0, DateTimeKind.Utc);
        await db.Database.ExecuteSqlRawAsync(
            @"UPDATE ""AspNetUsers"" SET ""Formula"" = 'novice', ""FormulaChosenAt"" = {0} WHERE ""Id"" = 'chose-novice';",
            chosenAt);
        var before = await ReadFormulasAsync(db);

        var affected = await db.Database.ExecuteSqlRawAsync(BackfillSql(db));

        Assert.Equal(0, affected);
        var after = await ReadFormulasAsync(db);
        Assert.Equal(before, after);
        Assert.Equal("novice", after["chose-novice"].Formula);
    }

    [Fact]
    public async Task MigratedSchema_TheImageBefore_StillReadsOneLayoutRowPerAccount()
    {
        await using var db = await NewDatabaseAsync();
        await MigrateToJustBeforeAddFormulasAsync(db);
        await SeedAccountAsync(db, "expert-layout", Layout(1, "expert"));
        var columnsBefore = await LayoutTableColumnsAsync(db);

        await MigrateToAddFormulasAsync(db);

        // The table the image before reads is untouched, column for column…
        Assert.Equal(columnsBefore, await LayoutTableColumnsAsync(db));

        // …its unique index on UserId is still there, so it can never hold two
        // rows for one account — what `SingleOrDefaultAsync` requires…
        var indexDefinition = await ScalarAsync<string>(
            db,
            @"SELECT indexdef FROM pg_indexes WHERE tablename = 'UserDashboardPreferences' AND indexname = 'IX_UserDashboardPreferences_UserId'");
        Assert.Equal(
            "CREATE UNIQUE INDEX \"IX_UserDashboardPreferences_UserId\" ON public.\"UserDashboardPreferences\" USING btree (\"UserId\")",
            indexDefinition);

        // …and its read — `DashboardController.GetPreferences` on develop,
        // l. 585-587, verbatim — still answers the one row, with its document.
        var row = await db.UserDashboardPreferences
            .AsNoTracking()
            .SingleOrDefaultAsync(p => p.UserId == "expert-layout");
        Assert.NotNull(row);
        Assert.Equal(1, row.SchemaVersion);
        Assert.Contains("\"level\": \"expert\"", row.LayoutJson);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>A stored layout of the given version and level, with a block list.</summary>
    private static string Layout(int schemaVersion, string level) =>
        $$"""{"schemaVersion":{{schemaVersion}},"level":"{{level}}","blocks":[{"key":"gardens","size":"large","hidden":false,"options":null}]}""";

    /// <summary>A database of its own on the class's container, and a context on it.</summary>
    private async Task<SmartCropsDbContext> NewDatabaseAsync()
    {
        var name = "formulas_" + Guid.NewGuid().ToString("N");
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

    /// <summary>The id of <c>AddFormulas</c> — asserted to exist, so its absence reads as a red, not a crash.</summary>
    private static string AddFormulasId(SmartCropsDbContext db)
    {
        var id = db.Database.GetMigrations().SingleOrDefault(m => m.EndsWith(AddFormulasSuffix, StringComparison.Ordinal));
        Assert.True(id is not null, "Expected an AddFormulas migration in the assembly");
        return id!;
    }

    private static async Task MigrateToJustBeforeAddFormulasAsync(SmartCropsDbContext db)
    {
        var all = db.Database.GetMigrations().ToList();
        var index = all.IndexOf(AddFormulasId(db));
        Assert.True(index > 0, "AddFormulas cannot be the first migration");
        await db.GetService<IMigrator>().MigrateAsync(all[index - 1]);
    }

    private static Task MigrateToAddFormulasAsync(SmartCropsDbContext db) =>
        db.GetService<IMigrator>().MigrateAsync(AddFormulasId(db));

    /// <summary>The backfill as the migration carries it (<c>AddFormulas.BackfillSql</c>).</summary>
    private static string BackfillSql(SmartCropsDbContext db)
    {
        var type = db.GetService<IMigrationsAssembly>().Migrations[AddFormulasId(db)];
        var field = type.AsType().GetField("BackfillSql");
        Assert.True(field is not null, "Expected AddFormulas to expose its BackfillSql");
        return (string)field!.GetValue(null)!;
    }

    /// <summary>
    /// An account, at the schema before <c>AddFormulas</c> — the columns
    /// Identity requires, the rest null — and, when asked, its layout row.
    /// </summary>
    private static async Task SeedAccountAsync(
        SmartCropsDbContext db,
        string userId,
        string? layoutJson,
        bool withRow = true,
        int schemaVersion = 1)
    {
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0);",
            userId);

        if (!withRow) return;

        // A null document is written as the SQL literal: EF Core maps no store
        // type for a DBNull parameter.
        if (layoutJson is null)
        {
            await db.Database.ExecuteSqlRawAsync(
                @"INSERT INTO ""UserDashboardPreferences"" (""Id"", ""UserId"", ""LayoutJson"", ""SchemaVersion"", ""UpdatedAt"")
                  VALUES ({0}, {1}, NULL, {2}, CURRENT_TIMESTAMP);",
                Guid.NewGuid(), userId, schemaVersion);
            return;
        }

        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""UserDashboardPreferences"" (""Id"", ""UserId"", ""LayoutJson"", ""SchemaVersion"", ""UpdatedAt"")
              VALUES ({0}, {1}, CAST({2} AS jsonb), {3}, CURRENT_TIMESTAMP);",
            Guid.NewGuid(), userId, layoutJson, schemaVersion);
    }

    private sealed record AccountFormula(string Formula, DateTime? ChosenAt);

    private static async Task<Dictionary<string, AccountFormula>> ReadFormulasAsync(SmartCropsDbContext db)
    {
        var result = new Dictionary<string, AccountFormula>(StringComparer.Ordinal);
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await connection.OpenAsync();
        try
        {
            await using var command = new NpgsqlCommand(
                @"SELECT ""Id"", ""Formula"", ""FormulaChosenAt"" FROM ""AspNetUsers"" ORDER BY ""Id""", connection);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                result[reader.GetString(0)] = new AccountFormula(
                    reader.GetString(1),
                    reader.IsDBNull(2) ? null : reader.GetFieldValue<DateTime>(2));
            }
        }
        finally
        {
            await connection.CloseAsync();
        }

        return result;
    }

    /// <summary>The columns of the table the image before reads, in order, with their types and nullability.</summary>
    private static async Task<List<string>> LayoutTableColumnsAsync(SmartCropsDbContext db)
    {
        var columns = new List<string>();
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await connection.OpenAsync();
        try
        {
            await using var command = new NpgsqlCommand(
                @"SELECT column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
                  FROM information_schema.columns
                  WHERE table_name = 'UserDashboardPreferences'
                  ORDER BY ordinal_position",
                connection);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) columns.Add(reader.GetString(0));
        }
        finally
        {
            await connection.CloseAsync();
        }

        return columns;
    }

    private static async Task<T> ScalarAsync<T>(SmartCropsDbContext db, string sql)
    {
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        await connection.OpenAsync();
        try
        {
            await using var command = new NpgsqlCommand(sql, connection);
            return (T)(await command.ExecuteScalarAsync())!;
        }
        finally
        {
            await connection.CloseAsync();
        }
    }
}
