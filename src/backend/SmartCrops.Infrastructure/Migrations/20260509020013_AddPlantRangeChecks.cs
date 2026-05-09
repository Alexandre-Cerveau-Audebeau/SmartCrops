using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlantRangeChecks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "EnrichmentStatus",
                table: "Plants",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_HardinessZone_Range",
                table: "Plants",
                sql: "\"HardinessZoneMin\" IS NULL OR \"HardinessZoneMax\" IS NULL OR \"HardinessZoneMin\" <= \"HardinessZoneMax\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_Height_Range",
                table: "Plants",
                sql: "\"MinHeightCm\" IS NULL OR \"MaxHeightCm\" IS NULL OR \"MinHeightCm\" <= \"MaxHeightCm\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_LightLevel_Range",
                table: "Plants",
                sql: "\"LightLevel\" IS NULL OR \"LightLevel\" BETWEEN 1 AND 10");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_SoilPh_Range",
                table: "Plants",
                sql: "(\"SoilPhMin\" IS NULL OR \"SoilPhMin\" BETWEEN 0 AND 14) AND (\"SoilPhMax\" IS NULL OR \"SoilPhMax\" BETWEEN 0 AND 14) AND (\"SoilPhMin\" IS NULL OR \"SoilPhMax\" IS NULL OR \"SoilPhMin\" <= \"SoilPhMax\")");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_Spread_Range",
                table: "Plants",
                sql: "\"MinSpreadCm\" IS NULL OR \"MaxSpreadCm\" IS NULL OR \"MinSpreadCm\" <= \"MaxSpreadCm\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_Temperature_Range",
                table: "Plants",
                sql: "\"MinTempC\" IS NULL OR \"MaxTempC\" IS NULL OR \"MinTempC\" <= \"MaxTempC\"");

            migrationBuilder.CreateIndex(
                name: "IX_PlantCommonNames_PlantId",
                table: "PlantCommonNames",
                column: "PlantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_HardinessZone_Range",
                table: "Plants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_Height_Range",
                table: "Plants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_LightLevel_Range",
                table: "Plants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_SoilPh_Range",
                table: "Plants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_Spread_Range",
                table: "Plants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_Temperature_Range",
                table: "Plants");

            migrationBuilder.DropIndex(
                name: "IX_PlantCommonNames_PlantId",
                table: "PlantCommonNames");

            migrationBuilder.AlterColumn<int>(
                name: "EnrichmentStatus",
                table: "Plants",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValue: 0);
        }
    }
}
