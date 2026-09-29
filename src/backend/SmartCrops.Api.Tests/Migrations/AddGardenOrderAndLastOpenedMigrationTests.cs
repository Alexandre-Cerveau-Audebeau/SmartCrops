using System.Text.RegularExpressions;

namespace SmartCrops.Api.Tests.Migrations;

/// <summary>
/// SMA-448, lot F5-a — materialization test for <c>AddGardenOrderAndLastOpened</c>,
/// on the <see cref="AddFormulasMigrationTests"/> pattern: the migration source
/// is read and the shape it MUST have is asserted, so an edit that turns it into
/// something other than the ONE purely additive migration of lot F5 fails here
/// before it reaches a database. Its effect on a real PostgreSQL — and the proof
/// that the image before still reads and creates a garden on the migrated
/// schema — is <c>Integration.Migrations.GardenOrderAndLastOpenedMigrationTests</c>.
///
/// <para>What the shape is (pre-flight F5 § C.5, decided by Alexandre on 28/09;
/// contract v3 A-N5, A-N6): two NULLABLE columns on <c>Gardens</c> —
/// <c>LastOpenedAt timestamptz</c>, <c>SortOrder integer</c> — with the one
/// CHECK a place in an order has (never negative), NO index, NO backfill, and a
/// <c>Down</c> that takes the three back. Nothing dropped, renamed or altered
/// in <c>Up</c>: migrations apply at boot and a rollback of the image does not
/// roll the schema back.</para>
/// </summary>
public class AddGardenOrderAndLastOpenedMigrationTests
{
    [Fact]
    public void Migration_AddsTwoNullableColumns_OnGardens_WithoutADefault()
    {
        var up = ReadUp();

        Assert.Matches(
            new Regex(
                @"AddColumn<DateTime>\(\s*name:\s*""LastOpenedAt"",\s*table:\s*""Gardens"",\s*type:\s*""timestamp with time zone"",\s*nullable:\s*true\)",
                RegexOptions.Singleline),
            up);
        Assert.Matches(
            new Regex(
                @"AddColumn<int>\(\s*name:\s*""SortOrder"",\s*table:\s*""Gardens"",\s*type:\s*""integer"",\s*nullable:\s*true\)",
                RegexOptions.Singleline),
            up);

        // Two columns and nothing else; no default on either — NULL is the
        // state of every existing row.
        Assert.Equal(2, Regex.Matches(up, @"\.AddColumn<").Count);
        Assert.DoesNotContain("defaultValue", up);
        Assert.DoesNotContain("defaultValueSql", up);
    }

    [Fact]
    public void Migration_ChecksThatAPlaceIsNeverNegative_AndNothingElse()
    {
        var up = ReadUp();

        Assert.Matches(
            new Regex(
                @"AddCheckConstraint\(\s*name:\s*""CK_Gardens_SortOrder_NonNegative"",\s*table:\s*""Gardens"",\s*sql:\s*""\\""SortOrder\\"" IS NULL OR \\""SortOrder\\"" >= 0""\)",
                RegexOptions.Singleline),
            up);
        Assert.Single(Regex.Matches(up, @"\.AddCheckConstraint\("));
    }

    [Fact]
    public void Migration_CreatesNoIndex_AndBackfillsNothing()
    {
        var up = ReadUp();

        Assert.DoesNotContain(".CreateIndex(", up);
        Assert.DoesNotContain(".CreateTable(", up);
        Assert.DoesNotContain("migrationBuilder.Sql(", up);
        Assert.DoesNotMatch(new Regex(@"\bUPDATE\b", RegexOptions.IgnoreCase), up);
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
    public void Down_TakesTheCheckAndTheTwoColumnsBack_AndNothingElse()
    {
        var down = ReadDown();

        Assert.Matches(
            new Regex(@"DropCheckConstraint\(\s*name:\s*""CK_Gardens_SortOrder_NonNegative"",\s*table:\s*""Gardens""\)", RegexOptions.Singleline),
            down);
        Assert.Matches(new Regex(@"DropColumn\(\s*name:\s*""LastOpenedAt"",\s*table:\s*""Gardens""\)", RegexOptions.Singleline), down);
        Assert.Matches(new Regex(@"DropColumn\(\s*name:\s*""SortOrder"",\s*table:\s*""Gardens""\)", RegexOptions.Singleline), down);
        Assert.Equal(2, Regex.Matches(down, @"\.DropColumn\(").Count);
        Assert.DoesNotContain(".DropTable(", down);
        Assert.DoesNotContain(".DropIndex(", down);
    }

    /// <summary>The body of <c>Up</c> — from its signature to <c>Down</c>'s.</summary>
    private static string ReadUp()
    {
        var source = ReadSource();
        var up = source.IndexOf("protected override void Up", StringComparison.Ordinal);
        var down = source.IndexOf("protected override void Down", StringComparison.Ordinal);
        Assert.True(up > 0 && down > up, "Expected Up then Down in AddGardenOrderAndLastOpened");
        return source[up..down];
    }

    /// <summary>The body of <c>Down</c> — from its signature to the end of the file.</summary>
    private static string ReadDown()
    {
        var source = ReadSource();
        var down = source.IndexOf("protected override void Down", StringComparison.Ordinal);
        Assert.True(down > 0, "Expected a Down in AddGardenOrderAndLastOpened");
        return source[down..];
    }

    private static string ReadSource()
    {
        var migrationDir = FindMigrationsDirectory();

        var migrationFile = Directory
            .GetFiles(migrationDir, "*_AddGardenOrderAndLastOpened.cs")
            .FirstOrDefault(f => !f.EndsWith(".Designer.cs"));

        Assert.True(
            migrationFile is not null,
            $"Expected an AddGardenOrderAndLastOpened migration under {migrationDir}");

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
