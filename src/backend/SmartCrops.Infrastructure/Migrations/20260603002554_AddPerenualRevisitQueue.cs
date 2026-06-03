using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPerenualRevisitQueue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PerenualRevisitQueue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Endpoint = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ResourceId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    LastHttpStatus = table.Column<int>(type: "integer", nullable: true),
                    LastError = table.Column<string>(type: "text", nullable: true),
                    FirstSeenAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastAttemptAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PerenualRevisitQueue", x => x.Id);
                    table.CheckConstraint("CK_PerenualRevisitQueue_Attempts_NonNegative", "\"Attempts\" >= 0");
                });

            migrationBuilder.CreateIndex(
                name: "IX_PerenualRevisitQueue_Endpoint_ResourceId",
                table: "PerenualRevisitQueue",
                columns: new[] { "Endpoint", "ResourceId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PerenualRevisitQueue");
        }
    }
}
