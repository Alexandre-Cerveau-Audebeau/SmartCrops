using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGardenAndUserLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "Latitude",
                table: "Gardens",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LocationCountry",
                table: "Gardens",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LocationName",
                table: "Gardens",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LocationRegion",
                table: "Gardens",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LocationResolvedAt",
                table: "Gardens",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Longitude",
                table: "Gardens",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Latitude",
                table: "AspNetUsers",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LocationCountry",
                table: "AspNetUsers",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LocationName",
                table: "AspNetUsers",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LocationRegion",
                table: "AspNetUsers",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LocationResolvedAt",
                table: "AspNetUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Longitude",
                table: "AspNetUsers",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Gardens_Latitude_Range",
                table: "Gardens",
                sql: "\"Latitude\" IS NULL OR (\"Latitude\" >= -90 AND \"Latitude\" <= 90)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Gardens_Location_Pair",
                table: "Gardens",
                sql: "(\"Latitude\" IS NULL) = (\"Longitude\" IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Gardens_Longitude_Range",
                table: "Gardens",
                sql: "\"Longitude\" IS NULL OR (\"Longitude\" >= -180 AND \"Longitude\" <= 180)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AspNetUsers_Latitude_Range",
                table: "AspNetUsers",
                sql: "\"Latitude\" IS NULL OR (\"Latitude\" >= -90 AND \"Latitude\" <= 90)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AspNetUsers_Location_Pair",
                table: "AspNetUsers",
                sql: "(\"Latitude\" IS NULL) = (\"Longitude\" IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AspNetUsers_Longitude_Range",
                table: "AspNetUsers",
                sql: "\"Longitude\" IS NULL OR (\"Longitude\" >= -180 AND \"Longitude\" <= 180)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Gardens_Latitude_Range",
                table: "Gardens");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Gardens_Location_Pair",
                table: "Gardens");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Gardens_Longitude_Range",
                table: "Gardens");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AspNetUsers_Latitude_Range",
                table: "AspNetUsers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AspNetUsers_Location_Pair",
                table: "AspNetUsers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AspNetUsers_Longitude_Range",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "LocationCountry",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "LocationName",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "LocationRegion",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "LocationResolvedAt",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "Gardens");

            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "LocationCountry",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "LocationName",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "LocationRegion",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "LocationResolvedAt",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "AspNetUsers");
        }
    }
}
