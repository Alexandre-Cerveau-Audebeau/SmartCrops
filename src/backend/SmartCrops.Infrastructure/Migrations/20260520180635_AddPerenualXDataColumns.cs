using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPerenualXDataColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "XPlantSpacingUnit",
                table: "PlantPerenualData",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "XPlantSpacingValue",
                table: "PlantPerenualData",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "XSunlightHoursMax",
                table: "PlantPerenualData",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "XSunlightHoursMin",
                table: "PlantPerenualData",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "XTemperatureToleranceMaxC",
                table: "PlantPerenualData",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "XTemperatureToleranceMinC",
                table: "PlantPerenualData",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "XWateringBasedTempMaxC",
                table: "PlantPerenualData",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "XWateringBasedTempMinC",
                table: "PlantPerenualData",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "XWateringPeriodJson",
                table: "PlantPerenualData",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "XWateringPhMax",
                table: "PlantPerenualData",
                type: "numeric(4,2)",
                precision: 4,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "XWateringPhMin",
                table: "PlantPerenualData",
                type: "numeric(4,2)",
                precision: 4,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "XWateringQualityJson",
                table: "PlantPerenualData",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XPlantSpacing_Positive",
                table: "PlantPerenualData",
                sql: "\"XPlantSpacingValue\" IS NULL OR \"XPlantSpacingValue\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XSunlightHours_Range",
                table: "PlantPerenualData",
                sql: "\"XSunlightHoursMin\" IS NULL OR \"XSunlightHoursMin\" BETWEEN 0 AND 24");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XSunlightHoursMax_Range",
                table: "PlantPerenualData",
                sql: "\"XSunlightHoursMax\" IS NULL OR \"XSunlightHoursMax\" BETWEEN 0 AND 24");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XTemperatureTolerance_Order",
                table: "PlantPerenualData",
                sql: "\"XTemperatureToleranceMinC\" IS NULL OR \"XTemperatureToleranceMaxC\" IS NULL OR \"XTemperatureToleranceMinC\" <= \"XTemperatureToleranceMaxC\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XTemperatureTolerance_Range",
                table: "PlantPerenualData",
                sql: "\"XTemperatureToleranceMinC\" IS NULL OR \"XTemperatureToleranceMinC\" BETWEEN -50 AND 60");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XTemperatureToleranceMax_Range",
                table: "PlantPerenualData",
                sql: "\"XTemperatureToleranceMaxC\" IS NULL OR \"XTemperatureToleranceMaxC\" BETWEEN -50 AND 60");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XWateringBasedTemp_Order",
                table: "PlantPerenualData",
                sql: "\"XWateringBasedTempMinC\" IS NULL OR \"XWateringBasedTempMaxC\" IS NULL OR \"XWateringBasedTempMinC\" <= \"XWateringBasedTempMaxC\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XWateringBasedTemp_Range",
                table: "PlantPerenualData",
                sql: "\"XWateringBasedTempMinC\" IS NULL OR \"XWateringBasedTempMinC\" BETWEEN -50 AND 60");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XWateringBasedTempMax_Range",
                table: "PlantPerenualData",
                sql: "\"XWateringBasedTempMaxC\" IS NULL OR \"XWateringBasedTempMaxC\" BETWEEN -50 AND 60");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XWateringPh_Order",
                table: "PlantPerenualData",
                sql: "\"XWateringPhMin\" IS NULL OR \"XWateringPhMax\" IS NULL OR \"XWateringPhMin\" <= \"XWateringPhMax\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XWateringPh_Range",
                table: "PlantPerenualData",
                sql: "\"XWateringPhMin\" IS NULL OR (\"XWateringPhMin\" >= 0 AND \"XWateringPhMin\" <= 14)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlantPerenualData_XWateringPhMax_Range",
                table: "PlantPerenualData",
                sql: "\"XWateringPhMax\" IS NULL OR (\"XWateringPhMax\" >= 0 AND \"XWateringPhMax\" <= 14)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XPlantSpacing_Positive",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XSunlightHours_Range",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XSunlightHoursMax_Range",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XTemperatureTolerance_Order",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XTemperatureTolerance_Range",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XTemperatureToleranceMax_Range",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XWateringBasedTemp_Order",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XWateringBasedTemp_Range",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XWateringBasedTempMax_Range",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XWateringPh_Order",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XWateringPh_Range",
                table: "PlantPerenualData");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlantPerenualData_XWateringPhMax_Range",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XPlantSpacingUnit",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XPlantSpacingValue",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XSunlightHoursMax",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XSunlightHoursMin",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XTemperatureToleranceMaxC",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XTemperatureToleranceMinC",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XWateringBasedTempMaxC",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XWateringBasedTempMinC",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XWateringPeriodJson",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XWateringPhMax",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XWateringPhMin",
                table: "PlantPerenualData");

            migrationBuilder.DropColumn(
                name: "XWateringQualityJson",
                table: "PlantPerenualData");
        }
    }
}
