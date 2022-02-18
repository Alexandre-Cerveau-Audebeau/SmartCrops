using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.WebApi.Migrations
{
    public partial class UpdatePlantTypeNameMigration : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PlantName",
                table: "PlantTypes",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PlantName",
                table: "PlantTypes");
        }
    }
}
