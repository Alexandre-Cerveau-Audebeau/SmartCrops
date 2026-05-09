using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlantInvariantsHardening : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_Height_Range",
                table: "Plants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_Spread_Range",
                table: "Plants");

            // Normalize plants whose EnrichmentStatus was backfilled with the previous
            // (incorrect) default of 0 (None). Any plant without explicit enrichment
            // provenance was authored manually — promote them to Manual (1) before
            // flipping the column default. This is a one-way data migration.
            migrationBuilder.Sql("UPDATE \"Plants\" SET \"EnrichmentStatus\" = 1 WHERE \"EnrichmentStatus\" = 0;");

            migrationBuilder.AlterColumn<int>(
                name: "EnrichmentStatus",
                table: "Plants",
                type: "integer",
                nullable: false,
                defaultValue: 1,
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValue: 0);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_Height_Range",
                table: "Plants",
                sql: "(\"MinHeightCm\" IS NULL OR \"MinHeightCm\" >= 0) AND (\"MaxHeightCm\" IS NULL OR \"MaxHeightCm\" >= 0) AND (\"MinHeightCm\" IS NULL OR \"MaxHeightCm\" IS NULL OR \"MinHeightCm\" <= \"MaxHeightCm\")");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_Spread_Range",
                table: "Plants",
                sql: "(\"MinSpreadCm\" IS NULL OR \"MinSpreadCm\" >= 0) AND (\"MaxSpreadCm\" IS NULL OR \"MaxSpreadCm\" >= 0) AND (\"MinSpreadCm\" IS NULL OR \"MaxSpreadCm\" IS NULL OR \"MinSpreadCm\" <= \"MaxSpreadCm\")");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_Height_Range",
                table: "Plants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_Spread_Range",
                table: "Plants");

            migrationBuilder.AlterColumn<int>(
                name: "EnrichmentStatus",
                table: "Plants",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValue: 1);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_Height_Range",
                table: "Plants",
                sql: "\"MinHeightCm\" IS NULL OR \"MaxHeightCm\" IS NULL OR \"MinHeightCm\" <= \"MaxHeightCm\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_Spread_Range",
                table: "Plants",
                sql: "\"MinSpreadCm\" IS NULL OR \"MaxSpreadCm\" IS NULL OR \"MinSpreadCm\" <= \"MaxSpreadCm\"");
        }
    }
}
