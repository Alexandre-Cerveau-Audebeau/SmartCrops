using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <summary>
    /// SMA-448, lot F5-a — the two data of the Gardens widget's settings, on the
    /// garden itself (pre-flight F5 § C.1 a, § C.2 b, § C.5; decided by Alexandre
    /// on 28/09 — contract v3 A-N5, A-N6): <c>LastOpenedAt</c>, ONE stamp per
    /// garden of the planner's last opening, no history; <c>SortOrder</c>, the
    /// garden's place in the account's custom order, with its CHECK.
    /// PURELY ADDITIVE: two NULLABLE columns without a default, one CHECK
    /// constraint, no index (the rows of an account are counted in tens and
    /// <c>IX_Gardens_UserId</c> already serves), no backfill — NULL IS the
    /// state every existing row is in: « never opened », « not yet ranked ».
    /// Nothing dropped, renamed or altered. Migrations apply at boot and a
    /// rollback of the image does not roll the schema back, so the image before
    /// this migration must keep reading the migrated schema: it does — EF Core
    /// selects, inserts and deletes by NAMED columns, and a nullable column an
    /// entity does not map is invisible to all three
    /// (<c>Integration.Migrations.GardenOrderAndLastOpenedMigrationTests</c>).
    /// </summary>
    public partial class AddGardenOrderAndLastOpened : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "LastOpenedAt",
                table: "Gardens",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "Gardens",
                type: "integer",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Gardens_SortOrder_NonNegative",
                table: "Gardens",
                sql: "\"SortOrder\" IS NULL OR \"SortOrder\" >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Gardens_SortOrder_NonNegative",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "LastOpenedAt",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "Gardens");
        }
    }
}
