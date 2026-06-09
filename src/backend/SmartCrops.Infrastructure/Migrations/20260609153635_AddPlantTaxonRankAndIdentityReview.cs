using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlantTaxonRankAndIdentityReview : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IdentityNeedsReview",
                table: "Plants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "TaxonRank",
                table: "Plants",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Species");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IdentityNeedsReview",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "TaxonRank",
                table: "Plants");
        }
    }
}
