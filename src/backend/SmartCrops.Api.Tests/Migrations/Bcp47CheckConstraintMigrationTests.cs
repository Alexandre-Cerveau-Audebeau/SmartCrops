namespace SmartCrops.Api.Tests.Migrations;

/// <summary>
/// Lightweight materialization test for the BCP 47 CHECK constraint migration
/// (AddBcp47CheckOnPlantCommonNameLanguageCode).
///
/// EF Core's in-memory provider — used by the rest of this test suite — does not
/// enforce CHECK constraints, so it cannot verify that PostgreSQL actually rejects
/// a malformed LanguageCode at INSERT time. That functional enforcement test is
/// tracked by issue #39 (Testcontainers PostgreSQL integration tests).
///
/// What this test guards cheaply is the most likely regression: someone editing
/// the generated migration to drop the constraint or alter the regex. It asserts
/// the migration source still contains the expected DROP/ADD calls and the exact
/// regex pattern.
/// </summary>
public class Bcp47CheckConstraintMigrationTests
{
    [Fact]
    public void Migration_AddsBcp47Check_AndReplacesNotBlank_OnPlantCommonNameLanguageCode()
    {
        // Arrange: locate the migration .cs (not the .Designer.cs) by walking
        // parent directories from the test assembly's output directory.
        var migrationDir = FindMigrationsDirectory();

        var migrationFile = Directory
            .GetFiles(migrationDir, "*AddBcp47CheckOnPlantCommonNameLanguageCode*.cs")
            .FirstOrDefault(f => !f.EndsWith(".Designer.cs"));

        Assert.True(
            migrationFile is not null,
            $"Expected an AddBcp47CheckOnPlantCommonNameLanguageCode migration under {migrationDir}");

        // Act
        var source = File.ReadAllText(migrationFile!);

        // Assert: adds the BCP 47 structural CHECK with the exact regex...
        Assert.Contains("AddCheckConstraint", source);
        Assert.Contains("CK_PlantCommonName_LanguageCode_Bcp47", source);
        Assert.Contains("PlantCommonNames", source);
        Assert.Contains("^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?$", source);

        // ...and replaces (drops) the former non-blank CHECK, which the regex
        // strictly subsumes.
        Assert.Contains("DropCheckConstraint", source);
        Assert.Contains("CK_PlantCommonName_LanguageCode_NotBlank", source);
    }

    /// <summary>
    /// Locates <c>SmartCrops.Infrastructure/Migrations</c> by walking parent
    /// directories from the test assembly's output directory. Robust against
    /// different build configurations, CI/CD runner layouts, and developer IDE
    /// configurations — unlike a hardcoded relative <c>".."</c> traversal.
    /// </summary>
    private static string FindMigrationsDirectory()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            var candidate = Path.Combine(
                current.FullName,
                "src",
                "backend",
                "SmartCrops.Infrastructure",
                "Migrations");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }

            // Also handle the case where the test executes from inside src/backend already.
            var directCandidate = Path.Combine(
                current.FullName,
                "SmartCrops.Infrastructure",
                "Migrations");
            if (Directory.Exists(directCandidate))
            {
                return directCandidate;
            }

            current = current.Parent;
        }

        throw new DirectoryNotFoundException(
            "Could not locate SmartCrops.Infrastructure/Migrations by walking parents from " +
            AppContext.BaseDirectory);
    }
}
