using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCaseInsensitiveScientificNameIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop the case-sensitive unique index (subsumed by the functional one below).
            migrationBuilder.DropIndex(
                name: "IX_Plants_ScientificName",
                table: "Plants");

            // Guard: if case-variant duplicates already exist in Plants, the
            // functional unique index below would fail with a cryptic "could not
            // create unique index" error. Surface a clear message instead so the
            // operator can resolve the duplicates first. Same fail-fast pattern as
            // the PerenualId dedup guard in #79.
            migrationBuilder.Sql(@"
                DO $$
                DECLARE dup_count integer;
                BEGIN
                    SELECT COUNT(*) INTO dup_count FROM (
                        SELECT LOWER(""ScientificName"")
                        FROM ""Plants""
                        GROUP BY LOWER(""ScientificName"")
                        HAVING COUNT(*) > 1
                    ) dups;
                    IF dup_count > 0 THEN
                        RAISE EXCEPTION 'Cannot create case-insensitive unique index on Plants.ScientificName: % case-variant duplicate group(s) exist. Resolve duplicates first.', dup_count;
                    END IF;
                END $$;");

            // Enforce case-insensitive uniqueness on ScientificName via a functional
            // unique index on LOWER("ScientificName"). Two binomial names differing
            // only by case are the same species, so they must not coexist. The
            // matching dedup query in BulkImportService uses LOWER(...) so it picks
            // up this index. EF can't model a functional index via the fluent API,
            // hence the raw SQL — the index is invisible to the model snapshot, and
            // that's expected (probe-sync stays empty).
            migrationBuilder.Sql(@"
                CREATE UNIQUE INDEX ""IX_Plants_ScientificName_Lower""
                ON ""Plants"" (LOWER(""ScientificName""));");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop the functional index before restoring the plain unique one,
            // mirroring the Up order in reverse.
            migrationBuilder.Sql(@"DROP INDEX IF EXISTS ""IX_Plants_ScientificName_Lower"";");

            migrationBuilder.CreateIndex(
                name: "IX_Plants_ScientificName",
                table: "Plants",
                column: "ScientificName",
                unique: true);
        }
    }
}
