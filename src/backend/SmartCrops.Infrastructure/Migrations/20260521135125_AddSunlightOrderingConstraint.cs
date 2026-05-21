using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSunlightOrderingConstraint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XSunlightHours_Order",
                table: "PlantPerenualData",
                sql: "\"XSunlightHoursMin\" IS NULL OR \"XSunlightHoursMax\" IS NULL OR \"XSunlightHoursMin\" <= \"XSunlightHoursMax\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XSunlightHours_Order",
                table: "PlantPerenualData");
        }
    }
}
