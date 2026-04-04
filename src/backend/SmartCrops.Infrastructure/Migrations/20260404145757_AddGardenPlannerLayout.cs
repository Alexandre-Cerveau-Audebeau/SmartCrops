using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGardenPlannerLayout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CellSize",
                table: "Gardens",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CellsJson",
                table: "Gardens",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LayoutHeight",
                table: "Gardens",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LayoutWidth",
                table: "Gardens",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GardenPlacements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GardenId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartRow = table.Column<int>(type: "integer", nullable: false),
                    StartCol = table.Column<int>(type: "integer", nullable: false),
                    SpanRows = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    SpanCols = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PlacedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GardenPlacements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GardenPlacements_Gardens_GardenId",
                        column: x => x.GardenId,
                        principalTable: "Gardens",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GardenPlacements_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GardenPlacements_GardenId",
                table: "GardenPlacements",
                column: "GardenId");

            migrationBuilder.CreateIndex(
                name: "IX_GardenPlacements_PlantId",
                table: "GardenPlacements",
                column: "PlantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GardenPlacements");

            migrationBuilder.DropColumn(
                name: "CellSize",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "CellsJson",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "LayoutHeight",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "LayoutWidth",
                table: "Gardens");
        }
    }
}
