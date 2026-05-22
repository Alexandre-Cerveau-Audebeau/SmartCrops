using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DropPerenualIdUniqueConstraint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PlantPerenualData_PerenualId",
                table: "PlantPerenualData");

            migrationBuilder.CreateIndex(
                name: "IX_PlantPerenualData_PerenualId",
                table: "PlantPerenualData",
                column: "PerenualId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PlantPerenualData_PerenualId",
                table: "PlantPerenualData");

            migrationBuilder.CreateIndex(
                name: "IX_PlantPerenualData_PerenualId",
                table: "PlantPerenualData",
                column: "PerenualId",
                unique: true);
        }
    }
}
