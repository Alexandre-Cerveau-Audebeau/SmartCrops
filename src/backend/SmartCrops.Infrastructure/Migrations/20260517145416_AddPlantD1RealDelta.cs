using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlantD1RealDelta : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EdibleParts",
                table: "Plants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FlowerColors",
                table: "Plants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GrowthHabit",
                table: "Plants",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IntroducedRegions",
                table: "Plants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsVegetable",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NativeRegions",
                table: "Plants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PropagationInstructions",
                table: "Plants",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SoilNutriments",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SowingInstructions",
                table: "Plants",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WfoId",
                table: "Plants",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Year",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PlantPests",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Symptoms = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Solutions = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ImageUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SourceExternalId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlantPests", x => x.Id);
                    table.CheckConstraint("CK_PlantPests_Name_NotBlank", "btrim(\"Name\") <> ''");
                    table.ForeignKey(
                        name: "FK_PlantPests_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_HardinessZone_Bounds",
                table: "Plants",
                sql: "(\"HardinessZoneMin\" IS NULL OR \"HardinessZoneMin\" BETWEEN 1 AND 13) AND (\"HardinessZoneMax\" IS NULL OR \"HardinessZoneMax\" BETWEEN 1 AND 13)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_SoilNutriments_Range",
                table: "Plants",
                sql: "\"SoilNutriments\" IS NULL OR \"SoilNutriments\" BETWEEN 0 AND 10");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_Temperature_Bounds",
                table: "Plants",
                sql: "(\"MinTempC\" IS NULL OR \"MinTempC\" BETWEEN -50 AND 60) AND (\"MaxTempC\" IS NULL OR \"MaxTempC\" BETWEEN -50 AND 60)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Plants_Year_Range",
                table: "Plants",
                sql: "\"Year\" IS NULL OR (\"Year\" BETWEEN 1700 AND EXTRACT(YEAR FROM CURRENT_DATE)::INT)");

            migrationBuilder.CreateIndex(
                name: "IX_PlantPests_PlantId",
                table: "PlantPests",
                column: "PlantId");

            migrationBuilder.CreateIndex(
                name: "IX_PlantPests_Source_SourceExternalId",
                table: "PlantPests",
                columns: new[] { "Source", "SourceExternalId" },
                unique: true,
                filter: "\"SourceExternalId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PlantPests_Type",
                table: "PlantPests",
                column: "Type");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlantPests");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_HardinessZone_Bounds",
                table: "Plants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_SoilNutriments_Range",
                table: "Plants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_Temperature_Bounds",
                table: "Plants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Plants_Year_Range",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "EdibleParts",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "FlowerColors",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "GrowthHabit",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IntroducedRegions",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsVegetable",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "NativeRegions",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "PropagationInstructions",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "SoilNutriments",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "SowingInstructions",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "WfoId",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "Year",
                table: "Plants");
        }
    }
}
