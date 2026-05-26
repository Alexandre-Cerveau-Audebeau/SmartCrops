using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class WidenPlantPerenualDataPruningMonthsToText : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "PruningMonths",
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
            // the display field is data-lossless at the audit level.
            migrationBuilder.Sql(@"UPDATE ""PlantPerenualData"" SET ""PruningMonths"" = LEFT(""PruningMonths"", 200) WHERE LENGTH(""PruningMonths"") > 200;");

            migrationBuilder.AlterColumn<string>(
                name: "PruningMonths",
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
