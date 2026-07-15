using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGardenConfigAndDropGardenPlants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GardenPlants");

            migrationBuilder.AddColumn<string>(
                name: "GardenType",
                table: "Gardens",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Hemisphere",
                table: "Gardens",
                type: "character varying(1)",
                maxLength: 1,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LatitudeBand",
                table: "Gardens",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LightScheduleJson",
                table: "Gardens",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Orientation",
                table: "Gardens",
                type: "character varying(1)",
                maxLength: 1,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GardenType",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "Hemisphere",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "LatitudeBand",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "LightScheduleJson",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "Orientation",
                table: "Gardens");

            migrationBuilder.CreateTable(
                name: "GardenPlants",
                columns: table => new
                {
                    GardenId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GardenPlants", x => new { x.GardenId, x.PlantId });
                    table.ForeignKey(
                        name: "FK_GardenPlants_Gardens_GardenId",
                        column: x => x.GardenId,
                        principalTable: "Gardens",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GardenPlants_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GardenPlants_PlantId",
                table: "GardenPlants",
                column: "PlantId");
        }
    }
}
