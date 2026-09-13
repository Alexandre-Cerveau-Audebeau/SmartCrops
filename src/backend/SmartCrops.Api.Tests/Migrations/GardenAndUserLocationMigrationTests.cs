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
/// default, four CHECK constraints per table (two ranges, the pair, and the
/// non-blank name whenever there is a pair), and NO time zone column: the
/// provider returns it with every forecast (pre-flight § A.2-ter), so
/// persisting it was ruled out.</para>
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

    /// <summary>
    /// The name rule as PostgreSQL receives it (review round 2, K5): a pair
    /// never travels with a name that is NULL or made only of whitespace —
    /// whitespace in the .NET sense of <c>string.IsNullOrWhiteSpace</c>, the
    /// rule the endpoints and <c>GeoLocation.Create</c> apply, spelled out
    /// as an explicit character class so the database and the code agree
    /// character for character (<see cref="NameRule_WhitespaceClass_IsExactlyDotNetWhitespace"/>).
    /// </summary>
    private const string NameRule =
        "\"Latitude\" IS NULL OR (\"LocationName\" IS NOT NULL AND \"LocationName\" !~ '^[\\t\\n\\v\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]*$')";

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
    public void Migration_AddsEightNamedCheckConstraints_AndDropsThemOnDown()
    {
        var source = ReadMigrationSource();

        var expected = new[]
        {
            "CK_Gardens_Latitude_Range",
            "CK_Gardens_Longitude_Range",
            "CK_Gardens_Location_Pair",
            "CK_Gardens_Location_Name",
            "CK_AspNetUsers_Latitude_Range",
            "CK_AspNetUsers_Longitude_Range",
            "CK_AspNetUsers_Location_Pair",
            "CK_AspNetUsers_Location_Name",
        };

        foreach (var name in expected)
        {
            Assert.Contains($"name: \"{name}\"", source);
        }

        // Four per carrier (review round 1, K4 added the name rule to this
        // same migration while the lot was unmerged), every one dropped on Down.
        Assert.Equal(8, Regex.Matches(source, @"\.AddCheckConstraint\(").Count);
        Assert.Equal(8, Regex.Matches(source, @"\.DropCheckConstraint\(").Count);
        Assert.Equal(12, Regex.Matches(source, @"\.DropColumn\(").Count);

        // The pair rule, verbatim: a latitude alone is not half a place.
        Assert.Contains("(\\\"Latitude\\\" IS NULL) = (\\\"Longitude\\\" IS NULL)", source);
        // The name rule, verbatim, on both carriers: a pair never travels
        // without a name made of something other than whitespace.
        Assert.Equal(2, Regex.Matches(source, Regex.Escape(AsCSharpSourceText(NameRule))).Count);
        // And the round 1 spelling is gone: btrim only knew the space.
        Assert.DoesNotContain("btrim(\\\"LocationName\\\")", source);
    }

    [Fact]
    public void NameRule_WhitespaceClass_IsExactlyDotNetWhitespace()
    {
        // Review round 2 (K5): the SQL character class must cover the SAME
        // characters as char.IsWhiteSpace — no more (a real name refused), no
        // fewer (a blank name accepted, as btrim did for a tab). Every BMP code
        // point is checked against the class parsed out of the rule.
        var inClass = ParseBracketClass(NameRule);

        var dotNet = Enumerable.Range(0, 0x10000).Where(c => char.IsWhiteSpace((char)c)).ToHashSet();
        Assert.Equal(dotNet, inClass);

        // The documented .NET list, by name, so a drift in either direction
        // reads as a character: 0009–000D, 0020, 0085, 00A0, 1680, 2000–200A,
        // 2028, 2029, 202F, 205F, 3000 — twenty-five characters.
        Assert.Equal(25, inClass.Count);
        Assert.Contains(0x0009, inClass);
        Assert.Contains(0x000B, inClass);
        Assert.Contains(0x0085, inClass);
        Assert.Contains(0x00A0, inClass);
        Assert.Contains(0x2007, inClass);
        Assert.Contains(0x202F, inClass);
        Assert.Contains(0x3000, inClass);
        Assert.DoesNotContain(0x200B, inClass);
        Assert.DoesNotContain(0x180E, inClass);
    }

    /// <summary>The rule as it reads in the migration's C# source: quotes and backslashes escaped.</summary>
    private static string AsCSharpSourceText(string value) =>
        value.Replace("\\", "\\\\").Replace("\"", "\\\"");

    /// <summary>
    /// The code points of the <c>[...]</c> class of the rule: PostgreSQL ARE
    /// character-entry escapes (<c>\t \n \v \f \r \uXXXX</c>), literals, and
    /// <c>a-b</c> ranges.
    /// </summary>
    private static HashSet<int> ParseBracketClass(string rule)
    {
        var start = rule.IndexOf("'^[", StringComparison.Ordinal) + 3;
        var end = rule.IndexOf("]*$'", StringComparison.Ordinal);
        var body = rule[start..end];

        var atoms = new List<int>();
        var ranges = new List<(int From, int To)>();
        var i = 0;
        int? pendingFrom = null;
        while (i < body.Length)
        {
            int code;
            if (body[i] == '\\')
            {
                switch (body[i + 1])
                {
                    case 't': code = 0x09; i += 2; break;
                    case 'n': code = 0x0A; i += 2; break;
                    case 'v': code = 0x0B; i += 2; break;
                    case 'f': code = 0x0C; i += 2; break;
                    case 'r': code = 0x0D; i += 2; break;
                    case 'u':
                        code = Convert.ToInt32(body.Substring(i + 2, 4), 16);
                        i += 6;
                        break;
                    default:
                        throw new InvalidOperationException($"Unexpected escape \\{body[i + 1]} in the rule");
                }
            }
            else if (body[i] == '-' && pendingFrom is not null)
            {
                i++;
                var to = body[i] == '\\'
                    ? Convert.ToInt32(body.Substring(i + 2, 4), 16)
                    : body[i];
                i += body[i] == '\\' ? 6 : 1;
                ranges.Add((pendingFrom.Value, to));
                atoms.Remove(pendingFrom.Value);
                pendingFrom = null;
                continue;
            }
            else
            {
                code = body[i];
                i++;
            }

            atoms.Add(code);
            pendingFrom = code;
        }

        var set = atoms.ToHashSet();
        foreach (var (from, to) in ranges)
        {
            for (var c = from; c <= to; c++) set.Add(c);
        }

        return set;
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
