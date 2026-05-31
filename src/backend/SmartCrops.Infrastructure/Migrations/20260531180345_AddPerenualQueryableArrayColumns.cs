using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPerenualQueryableArrayColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttractsJson",
                table: "PlantPerenualData",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OtherNamesJson",
                table: "PlantPerenualData",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SoilJson",
                table: "PlantPerenualData",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttractsJson",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "OtherNamesJson",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "SoilJson",
                table: "PlantPerenualData");
        }
    }
}
