using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DropPerenualIdUniqueConstraint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PlantPerenualData_PerenualId",
                table: "PlantPerenualData");

            migrationBuilder.CreateIndex(
                name: "IX_PlantPerenualData_PerenualId",
                table: "PlantPerenualData",
                column: "PerenualId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PlantPerenualData_PerenualId",
                table: "PlantPerenualData");

            // Restoring the unique index is impossible if duplicate PerenualIds
            // exist (which the forward migration deliberately allows). Fail fast
            // with a clear operator message instead of a raw 23505 mid-rebuild.
            // See PR #79 CR round 1.
            migrationBuilder.Sql(@"
                DO $$
                DECLARE dup_count integer;
                BEGIN
                    SELECT COUNT(*) INTO dup_count FROM (
                        SELECT ""PerenualId""
                        FROM ""PlantPerenualData""
                        GROUP BY ""PerenualId""
                        HAVING COUNT(*) > 1
                    ) dups;
                    IF dup_count > 0 THEN
                        RAISE EXCEPTION 'Cannot restore unique index on PlantPerenualData.PerenualId: % duplicate PerenualId value(s) exist. Resolve duplicates before rolling back this migration.', dup_count;
                    END IF;
                END $$;");

            migrationBuilder.CreateIndex(
                name: "IX_PlantPerenualData_PerenualId",
                table: "PlantPerenualData",
                column: "PerenualId",
                unique: true);
        }
    }
}
