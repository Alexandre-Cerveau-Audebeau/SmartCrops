using System.Text.RegularExpressions;

namespace SmartCrops.Api.Tests.Migrations;

/// <summary>
/// SMA-336 PR 3a/5 — materialization test for <c>AddGardenAndUserLocation</c>,
/// on the <see cref="Bcp47CheckConstraintMigrationTests"/> pattern: the
/// migration source is read and the shape it MUST have is asserted, so an edit
/// that drops a column, a constraint or the nullability fails here before it
/// reaches a database. The PostgreSQL enforcement itself is proven by
/// <c>Integration.Invariants.GardenLocationConstraintTests</c>.
///
/// <para>What the shape is: six columns on EACH of the two carriers — the
/// garden (override) and the account (default) — every one nullable with no
/// default, three CHECK constraints per table (two ranges and the pair), and
/// NO time zone column: the provider returns it with every forecast (pre-flight
/// § A.2-ter), so persisting it was ruled out.</para>
/// </summary>
public class GardenAndUserLocationMigrationTests
{
    private static readonly string[] Columns =
    [
        "LocationName",
        "LocationRegion",
        "LocationCountry",
        "Latitude",
        "Longitude",
        "LocationResolvedAt",
    ];

    private static readonly string[] Tables = ["Gardens", "AspNetUsers"];

    [Fact]
    public void Migration_AddsSixNullableColumns_OnBothCarriers()
    {
        var source = ReadMigrationSource();

        foreach (var table in Tables)
        {
            foreach (var column in Columns)
            {
                // One AddColumn per (column, table), and every one nullable —
                // NULL is the « not located » state, so a NOT NULL here would
                // break every existing row at migration time.
                var pattern =
                    $@"AddColumn<[^>]+>\(\s*name:\s*""{column}"",\s*table:\s*""{table}"",[^;]*nullable:\s*true";
                Assert.True(
                    Regex.IsMatch(source, pattern, RegexOptions.Singleline),
                    $"Expected a nullable AddColumn for {table}.{column}");
            }
        }

        // Exactly twelve AddColumn calls: six columns × two tables, nothing else
        // rides along in this migration.
        Assert.Equal(12, Regex.Matches(source, @"\.AddColumn<").Count);
    }

    [Fact]
    public void Migration_UsesDoublePrecision_ForCoordinates()
    {
        var source = ReadMigrationSource();

        foreach (var table in Tables)
        {
            foreach (var column in new[] { "Latitude", "Longitude" })
            {
                var pattern =
                    $@"AddColumn<double>\(\s*name:\s*""{column}"",\s*table:\s*""{table}"",\s*type:\s*""double precision""";
                Assert.True(
                    Regex.IsMatch(source, pattern, RegexOptions.Singleline),
                    $"Expected {table}.{column} as double precision");
            }
        }
    }

    [Fact]
    public void Migration_AddsSixNamedCheckConstraints_AndDropsThemOnDown()
    {
        var source = ReadMigrationSource();

        var expected = new[]
        {
            "CK_Gardens_Latitude_Range",
            "CK_Gardens_Longitude_Range",
            "CK_Gardens_Location_Pair",
            "CK_AspNetUsers_Latitude_Range",
            "CK_AspNetUsers_Longitude_Range",
            "CK_AspNetUsers_Location_Pair",
        };

        foreach (var name in expected)
        {
            Assert.Contains($"name: \"{name}\"", source);
        }

        Assert.Equal(6, Regex.Matches(source, @"\.AddCheckConstraint\(").Count);
        Assert.Equal(6, Regex.Matches(source, @"\.DropCheckConstraint\(").Count);
        Assert.Equal(12, Regex.Matches(source, @"\.DropColumn\(").Count);

        // The pair rule, verbatim: a latitude alone is not half a place.
        Assert.Contains("(\\\"Latitude\\\" IS NULL) = (\\\"Longitude\\\" IS NULL)", source);
    }

    [Fact]
    public void Migration_PersistsNoTimeZone()
    {
        // Decision T2: the forecast carries tz_id and the local time on every
        // call, so a stored copy would only be read when there is nothing to
        // show. A column named for it is the regression this guards.
        var source = ReadMigrationSource();

        Assert.DoesNotContain("TimeZone", source);
        Assert.DoesNotContain("tz_id", source);
    }

    private static string ReadMigrationSource()
    {
        var migrationDir = FindMigrationsDirectory();

        var migrationFile = Directory
            .GetFiles(migrationDir, "*AddGardenAndUserLocation*.cs")
            .FirstOrDefault(f => !f.EndsWith(".Designer.cs"));

        Assert.True(
            migrationFile is not null,
            $"Expected an AddGardenAndUserLocation migration under {migrationDir}");

        return File.ReadAllText(migrationFile!);
    }

    /// <summary>
    /// Locates <c>SmartCrops.Infrastructure/Migrations</c> by walking parent
    /// directories from the test assembly's output directory — the same walk
    /// <see cref="Bcp47CheckConstraintMigrationTests"/> does, so both stay
    /// robust to build configuration and runner layout.
    /// </summary>
    private static string FindMigrationsDirectory()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            var candidate = Path.Combine(
                current.FullName, "SmartCrops.Infrastructure", "Migrations");
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
