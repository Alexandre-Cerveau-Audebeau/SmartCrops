using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPerenualLiteralCapture : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CareGuideResponseJson",
                table: "PlantPerenualData",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LiteralResponseJson",
                table: "PlantPerenualData",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CareGuideResponseJson",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "LiteralResponseJson",
                table: "PlantPerenualData");
        }
    }
}
