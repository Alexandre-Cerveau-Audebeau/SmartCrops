using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTrefleAverageHeightAndGrowthRate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AverageHeightCm",
                table: "PlantTrefleData",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GrowthRate",
                table: "PlantTrefleData",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AverageHeightCm",
                table: "PlantTrefleData");

            migrationBuilder.DropColumn(
                name: "GrowthRate",
                table: "PlantTrefleData");
        }
    }
}
