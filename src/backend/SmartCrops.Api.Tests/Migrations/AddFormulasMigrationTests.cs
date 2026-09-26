using System.Text.RegularExpressions;

namespace SmartCrops.Api.Tests.Migrations;

/// <summary>
/// SMA-448, lot F1, step S1 — materialization test for <c>AddFormulas</c>, on
/// the <see cref="GardenAndUserLocationMigrationTests"/> pattern: the migration
/// source is read and the shape it MUST have is asserted, so an edit that turns
/// it into something other than a purely ADDITIVE migration fails here before
/// it reaches a database. The data it rewrites is proven on a real PostgreSQL
/// by <c>Integration.Migrations.FormulaBackfillMigrationTests</c>.
///
/// <para>What the shape is (pre-flight § C.1 a, § C.3 c, § C.6 a — decided by
/// Alexandre on 26/09): the formula on the ACCOUNT — <c>Formula</c>, never
/// null, <c>'gardener'</c> by default, one of three values — and the instant
/// of its deliberate choice, <c>FormulaChosenAt</c>, null; a NEW table,
/// <c>SavedDashboardLayouts</c>, one row per (account, formula), the archive
/// the current layout goes to when the formula changes; and the backfill of
/// the effective level. Nothing dropped, nothing renamed, no existing index
/// touched: the image before this migration must still read the migrated
/// schema, since migrations apply at boot and a rollback of the image does not
/// roll the schema back.</para>
/// </summary>
public class AddFormulasMigrationTests
{
    [Fact]
    public void Migration_AddsTheFormulaToTheAccount_NotNull_GardenerByDefault()
    {
        var up = ReadUp();

        Assert.Matches(
            new Regex(
                @"AddColumn<string>\(\s*name:\s*""Formula"",\s*table:\s*""AspNetUsers"",\s*type:\s*""character varying\(20\)"",\s*maxLength:\s*20,\s*nullable:\s*false,\s*defaultValue:\s*""gardener""\)",
                RegexOptions.Singleline),
            up);
        Assert.Matches(
            new Regex(
                @"AddColumn<DateTime>\(\s*name:\s*""FormulaChosenAt"",\s*table:\s*""AspNetUsers"",\s*type:\s*""timestamp with time zone"",\s*nullable:\s*true\)",
                RegexOptions.Singleline),
            up);

        // Two columns and nothing else rides along on an existing table.
        Assert.Equal(2, Regex.Matches(up, @"\.AddColumn<").Count);
    }

    [Fact]
    public void Migration_CreatesTheArchive_OneRowPerAccountAndFormula_DeletedWithTheAccount()
    {
        var up = ReadUp();

        Assert.Contains("name: \"SavedDashboardLayouts\"", up);
        Assert.Matches(new Regex(@"LayoutJson = table\.Column<string>\(type:\s*""jsonb"",\s*nullable:\s*false\)"), up);
        Assert.Matches(
            new Regex(
                @"CreateIndex\(\s*name:\s*""IX_SavedDashboardLayouts_UserId_Formula"",\s*table:\s*""SavedDashboardLayouts"",\s*columns:\s*new\[\]\s*\{\s*""UserId"",\s*""Formula""\s*\},\s*unique:\s*true\)",
                RegexOptions.Singleline),
            up);
        Assert.Matches(
            new Regex(
                @"principalTable:\s*""AspNetUsers"",\s*principalColumn:\s*""Id"",\s*onDelete:\s*ReferentialAction\.Cascade",
                RegexOptions.Singleline),
            up);

        // The one index this migration creates is the archive's own.
        Assert.Single(Regex.Matches(up, @"\.CreateIndex\("));
    }

    [Fact]
    public void Migration_ChecksTheThreeFormulas_OnBothCarriers()
    {
        var up = ReadUp();
        const string Rule = "IN ('novice', 'gardener', 'expert')";

        // On the existing table, an AddCheckConstraint; on the new one, the
        // CreateTable's own table.CheckConstraint — positional, no `name:`.
        Assert.Contains("name: \"CK_AspNetUsers_Formula\"", up);
        Assert.Contains("table.CheckConstraint(\"CK_SavedDashboardLayouts_Formula\"", up);
        Assert.Equal(2, Regex.Matches(up, Regex.Escape(Rule)).Count);
    }

    [Fact]
    public void Migration_IsPurelyAdditive_NothingDroppedRenamedOrAltered()
    {
        var up = ReadUp();

        foreach (var verb in new[]
                 {
                     "DropColumn", "DropTable", "DropIndex", "DropForeignKey", "DropPrimaryKey",
                     "DropCheckConstraint", "DropUniqueConstraint", "RenameColumn", "RenameTable",
                     "RenameIndex", "AlterColumn", "AlterTable",
                 })
        {
            Assert.DoesNotContain($".{verb}(", up);
        }

        // Nor a DROP hiding in raw SQL.
        Assert.DoesNotMatch(new Regex(@"\bDROP\b", RegexOptions.IgnoreCase), up);
    }

    [Fact]
    public void Migration_BackfillsTheEffectiveLevel_WithAJoinStyleUpdate_NeverASubSelect()
    {
        var source = ReadSource();

        // The backfill is ONE join-style UPDATE: a sub-SELECT in the SET list
        // can answer NULL for an account without a readable layout, and the
        // column is NOT NULL. A join simply leaves those accounts on the
        // column's default, 'gardener'.
        Assert.Contains("UPDATE \"\"AspNetUsers\"\" AS u", source);
        Assert.Contains("FROM \"\"UserDashboardPreferences\"\" AS p", source);
        Assert.DoesNotMatch(new Regex(@"\(\s*SELECT\b", RegexOptions.IgnoreCase), source);

        // Idempotent and never over a deliberate choice.
        Assert.Contains("u.\"\"FormulaChosenAt\"\" IS NULL", source);
        Assert.Contains("IS DISTINCT FROM", source);

        // It runs in Up, after the column exists.
        var up = ReadUp();
        Assert.Contains("migrationBuilder.Sql(BackfillSql)", up);
        Assert.True(
            up.IndexOf("migrationBuilder.Sql(BackfillSql)", StringComparison.Ordinal)
                > up.IndexOf("name: \"Formula\"", StringComparison.Ordinal),
            "The backfill must run after the Formula column is added");
    }

    /// <summary>The body of <c>Up</c> — from its signature to <c>Down</c>'s.</summary>
    private static string ReadUp()
    {
        var source = ReadSource();
        var up = source.IndexOf("protected override void Up", StringComparison.Ordinal);
        var down = source.IndexOf("protected override void Down", StringComparison.Ordinal);
        Assert.True(up > 0 && down > up, "Expected Up then Down in AddFormulas");
        return source[up..down];
    }

    private static string ReadSource()
    {
        var migrationDir = FindMigrationsDirectory();

        var migrationFile = Directory
            .GetFiles(migrationDir, "*_AddFormulas.cs")
            .FirstOrDefault(f => !f.EndsWith(".Designer.cs"));

        Assert.True(
            migrationFile is not null,
            $"Expected an AddFormulas migration under {migrationDir}");

        return File.ReadAllText(migrationFile!);
    }

    /// <summary>
    /// Locates <c>SmartCrops.Infrastructure/Migrations</c> by walking parent
    /// directories from the test assembly's output directory — the walk
    /// <see cref="GardenAndUserLocationMigrationTests"/> does.
    /// </summary>
    private static string FindMigrationsDirectory()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            var candidate = Path.Combine(current.FullName, "SmartCrops.Infrastructure", "Migrations");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
            current = current.Parent;
        }

        throw new DirectoryNotFoundException(
            "Could not locate SmartCrops.Infrastructure/Migrations from " + AppContext.BaseDirectory);
    }
}
