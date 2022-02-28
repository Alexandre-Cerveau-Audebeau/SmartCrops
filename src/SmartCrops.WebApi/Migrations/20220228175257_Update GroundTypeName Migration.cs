using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.WebApi.Migrations
{
    public partial class UpdateGroundTypeNameMigration : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GroundName",
                table: "GroundTypes",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GroundName",
                table: "GroundTypes");
        }
    }
}
