using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSuggestionConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_PlantSuggestions_Status",
                table: "PlantSuggestions",
                column: "Status");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantSuggestions_Status",
                table: "PlantSuggestions",
                sql: "\"Status\" IN ('Pending','Approved','Rejected')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PlantSuggestions_Status",
                table: "PlantSuggestions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantSuggestions_Status",
                table: "PlantSuggestions");
        }
    }
}
