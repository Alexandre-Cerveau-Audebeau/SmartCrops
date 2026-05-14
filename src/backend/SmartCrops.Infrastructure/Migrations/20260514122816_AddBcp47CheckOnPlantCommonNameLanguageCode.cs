using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBcp47CheckOnPlantCommonNameLanguageCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantCommonName_LanguageCode_NotBlank",
                table: "PlantCommonNames");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantCommonName_LanguageCode_Bcp47",
                table: "PlantCommonNames",
                sql: "\"LanguageCode\" ~ '^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?$'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantCommonName_LanguageCode_Bcp47",
                table: "PlantCommonNames");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantCommonName_LanguageCode_NotBlank",
                table: "PlantCommonNames",
                sql: "btrim(\"LanguageCode\") <> ''");
        }
    }
}
