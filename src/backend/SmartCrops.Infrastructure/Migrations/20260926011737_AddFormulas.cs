using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <summary>
    /// SMA-448, lot F1, step S1 — the formula becomes a right on the account
    /// (pre-flight § C.1 a, § C.3 c, § C.6 a; decided by Alexandre on 26/09).
    /// PURELY ADDITIVE: two columns on <c>AspNetUsers</c>, one new table, their
    /// CHECK constraints and the new table's own index — nothing dropped,
    /// renamed or altered, no existing index touched. Migrations apply at boot
    /// and a rollback of the image does not roll the schema back, so the image
    /// before this migration must keep reading the migrated schema: it does,
    /// because <c>UserDashboardPreferences</c> is left exactly as it was.
    /// </summary>
    public partial class AddFormulas : Migration
    {
        /// <summary>
        /// The backfill: every account takes the EFFECTIVE level of its stored
        /// layout — the one <c>DashboardController.ToResponse</c> reads today:
        /// schema version 1, a document holding a block list, one of the three
        /// levels. Every other account keeps the column's default, 'gardener',
        /// the level it has always read. <c>FormulaChosenAt</c> stays null for
        /// all: nobody has CHOSEN yet (question 1 of the pre-flight).
        ///
        /// <para>ONE join-style UPDATE, never a sub-SELECT in the SET list, which
        /// could answer NULL for an account without a readable layout on a NOT
        /// NULL column. Idempotent: replayed, it touches no row — the
        /// <c>IS DISTINCT FROM</c> guard — and it never overwrites a deliberate
        /// choice (<c>FormulaChosenAt IS NULL</c>). Public so the backfill test
        /// can replay exactly this text.</para>
        /// </summary>
        public const string BackfillSql = @"
UPDATE ""AspNetUsers"" AS u
SET ""Formula"" = p.""LayoutJson"" ->> 'level'
FROM ""UserDashboardPreferences"" AS p
WHERE p.""UserId"" = u.""Id""
  AND u.""FormulaChosenAt"" IS NULL
  AND p.""SchemaVersion"" = 1
  AND jsonb_typeof(p.""LayoutJson"") = 'object'
  AND jsonb_typeof(p.""LayoutJson"" -> 'blocks') = 'array'
  AND p.""LayoutJson"" ->> 'level' IN ('novice', 'gardener', 'expert')
  AND u.""Formula"" IS DISTINCT FROM p.""LayoutJson"" ->> 'level';";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Formula",
                table: "AspNetUsers",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "gardener");

            migrationBuilder.AddColumn<DateTime>(
                name: "FormulaChosenAt",
                table: "AspNetUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SavedDashboardLayouts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: false),
                    Formula = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    LayoutJson = table.Column<string>(type: "jsonb", nullable: false),
                    SchemaVersion = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedDashboardLayouts", x => x.Id);
                    table.CheckConstraint("CK_SavedDashboardLayouts_Formula", "\"Formula\" IN ('novice', 'gardener', 'expert')");
                    table.ForeignKey(
                        name: "FK_SavedDashboardLayouts_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_AspNetUsers_Formula",
                table: "AspNetUsers",
                sql: "\"Formula\" IN ('novice', 'gardener', 'expert')");

            migrationBuilder.CreateIndex(
                name: "IX_SavedDashboardLayouts_UserId_Formula",
                table: "SavedDashboardLayouts",
                columns: new[] { "UserId", "Formula" },
                unique: true);

            // After the column and its CHECK exist: every row holds 'gardener'
            // from the default; the effective level replaces it where a
            // readable layout says otherwise.
            migrationBuilder.Sql(BackfillSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SavedDashboardLayouts");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AspNetUsers_Formula",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "Formula",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "FormulaChosenAt",
                table: "AspNetUsers");
        }
    }
}
