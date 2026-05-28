using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class WidenPlantPerenualDataSunlightPreferencesToText : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "SunlightPreferences",
                table: "PlantPerenualData",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Truncate any rows already past the old bound before re-narrowing
            // the column — otherwise the AlterColumn itself 22001s on rollback.
            // The full raw payload is preserved in RawResponseJson, so trimming
            // the display field is data-lossless at the audit level. Mirrors
            // PR #87 (PruningMonths widening) Down() pattern.
            migrationBuilder.Sql(@"UPDATE ""PlantPerenualData"" SET ""SunlightPreferences"" = LEFT(""SunlightPreferences"", 200) WHERE LENGTH(""SunlightPreferences"") > 200;");

            migrationBuilder.AlterColumn<string>(
                name: "SunlightPreferences",
                table: "PlantPerenualData",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);
        }
    }
}
