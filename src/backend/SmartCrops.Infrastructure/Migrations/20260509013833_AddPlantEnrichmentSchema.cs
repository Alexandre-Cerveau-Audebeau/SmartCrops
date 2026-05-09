using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace SmartCrops.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlantEnrichmentSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<DateTime>(
                name: "UpdatedAt",
                table: "Plants",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "CreatedAt",
                table: "Plants",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone");

            migrationBuilder.AddColumn<bool>(
                name: "AttractsPollinators",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Author",
                table: "Plants",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CareLevel",
                table: "Plants",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EnrichmentStatus",
                table: "Plants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Family",
                table: "Plants",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "GbifTaxonKey",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Genus",
                table: "Plants",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GrowthRate",
                table: "Plants",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HardinessZoneMax",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HardinessZoneMin",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDroughtTolerant",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsEdible",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsIndoor",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsInvasive",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsMedicinal",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsSaltTolerant",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsThorny",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsToxicToHumans",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsToxicToPets",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsTropical",
                table: "Plants",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastEnrichmentAt",
                table: "Plants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LifeCycle",
                table: "Plants",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LightLevel",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxHeightCm",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxSpreadCm",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxTempC",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinHeightCm",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinSpreadCm",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinTempC",
                table: "Plants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SoilPhMax",
                table: "Plants",
                type: "numeric(4,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SoilPhMin",
                table: "Plants",
                type: "numeric(4,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SpeciesEpithet",
                table: "Plants",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WateringNeedLevel",
                table: "Plants",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PlantCommonNames",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    LanguageCode = table.Column<string>(type: "character varying(35)", maxLength: 35, nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    IsPrimary = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlantCommonNames", x => x.Id);
                    table.CheckConstraint("CK_PlantCommonName_LanguageCode_NotBlank", "btrim(\"LanguageCode\") <> ''");
                    table.CheckConstraint("CK_PlantCommonName_Name_NotBlank", "btrim(\"Name\") <> ''");
                    table.ForeignKey(
                        name: "FK_PlantCommonNames_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlantImages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ImageType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Url = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    ThumbnailUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Width = table.Column<int>(type: "integer", nullable: true),
                    Height = table.Column<int>(type: "integer", nullable: true),
                    LicenseName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    LicenseUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Credit = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SourceExternalId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    IsFlagged = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlantImages", x => x.Id);
                    table.CheckConstraint("CK_PlantImage_Url_NotBlank", "btrim(\"Url\") <> ''");
                    table.ForeignKey(
                        name: "FK_PlantImages_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlantLongDescriptions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Language = table.Column<string>(type: "character(2)", fixedLength: true, maxLength: 2, nullable: false),
                    LongDescription = table.Column<string>(type: "text", nullable: false),
                    SourceMethod = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlantLongDescriptions", x => x.Id);
                    table.CheckConstraint("CK_PlantLongDescription_Language", "\"Language\" ~ '^[a-z]{2}$'");
                    table.CheckConstraint("CK_PlantLongDescription_LongDescription_NotBlank", "btrim(\"LongDescription\") <> ''");
                    table.ForeignKey(
                        name: "FK_PlantLongDescriptions_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlantPerenualData",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PerenualId = table.Column<int>(type: "integer", nullable: false),
                    Cultivar = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    PerenualType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    OriginCountries = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PropagationMethods = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    WateringBenchmark = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    WateringBenchmarkUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    SunlightPreferences = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PruningMonths = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Maintenance = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    FloweringSeason = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HarvestSeason = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HasEdibleFruit = table.Column<bool>(type: "boolean", nullable: true),
                    HasEdibleLeaves = table.Column<bool>(type: "boolean", nullable: true),
                    IsCulinary = table.Column<bool>(type: "boolean", nullable: true),
                    PlantAnatomyJson = table.Column<string>(type: "jsonb", nullable: true),
                    RawResponseJson = table.Column<string>(type: "jsonb", nullable: true),
                    ApiVersion = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    HasSupremeData = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    LastSyncAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlantPerenualData", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlantPerenualData_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlantPhases",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PhaseType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StartMonth = table.Column<int>(type: "integer", nullable: false),
                    EndMonth = table.Column<int>(type: "integer", nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    NotesLanguage = table.Column<string>(type: "character(2)", fixedLength: true, maxLength: 2, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlantPhases", x => x.Id);
                    table.CheckConstraint("CK_PlantPhase_EndMonth", "\"EndMonth\" BETWEEN 1 AND 12");
                    table.CheckConstraint("CK_PlantPhase_StartMonth", "\"StartMonth\" BETWEEN 1 AND 12");
                    table.ForeignKey(
                        name: "FK_PlantPhases_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlantSources",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ExternalId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Url = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    LastFetchedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlantSources", x => x.Id);
                    table.CheckConstraint("CK_PlantSource_ExternalId_NotBlank", "btrim(\"ExternalId\") <> ''");
                    table.ForeignKey(
                        name: "FK_PlantSources_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlantSynonyms",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Synonym = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Authority = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlantSynonyms", x => x.Id);
                    table.CheckConstraint("CK_PlantSynonym_Synonym_NotBlank", "btrim(\"Synonym\") <> ''");
                    table.ForeignKey(
                        name: "FK_PlantSynonyms_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlantTrefleData",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PlantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TrefleSlug = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    WfoId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    GrowthHabit = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FlowerColors = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    FoliageColors = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    NativeRegionsJson = table.Column<string>(type: "jsonb", nullable: true),
                    IntroducedRegionsJson = table.Column<string>(type: "jsonb", nullable: true),
                    SoilNutrimentsLevel = table.Column<int>(type: "integer", nullable: true),
                    SoilSalinityLevel = table.Column<int>(type: "integer", nullable: true),
                    AtmosphericHumidityLevel = table.Column<int>(type: "integer", nullable: true),
                    RawResponseJson = table.Column<string>(type: "jsonb", nullable: true),
                    ApiVersion = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    LastSyncAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlantTrefleData", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlantTrefleData_Plants_PlantId",
                        column: x => x.PlantId,
                        principalTable: "Plants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Plants_EnrichmentStatus",
                table: "Plants",
                column: "EnrichmentStatus");

            migrationBuilder.CreateIndex(
                name: "IX_Plants_Family",
                table: "Plants",
                column: "Family");

            migrationBuilder.CreateIndex(
                name: "IX_Plants_GbifTaxonKey",
                table: "Plants",
                column: "GbifTaxonKey",
                unique: true,
                filter: "\"GbifTaxonKey\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Plants_Genus",
                table: "Plants",
                column: "Genus");

            migrationBuilder.CreateIndex(
                name: "IX_PlantCommonNames_Name",
                table: "PlantCommonNames",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_PlantCommonNames_PlantId_LanguageCode",
                table: "PlantCommonNames",
                columns: new[] { "PlantId", "LanguageCode" },
                unique: true,
                filter: "\"IsPrimary\" = TRUE");

            migrationBuilder.CreateIndex(
                name: "IX_PlantImages_PlantId_ImageType_DisplayOrder",
                table: "PlantImages",
                columns: new[] { "PlantId", "ImageType", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_PlantImages_PlantId_Source_SourceExternalId",
                table: "PlantImages",
                columns: new[] { "PlantId", "Source", "SourceExternalId" },
                unique: true,
                filter: "\"SourceExternalId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PlantLongDescriptions_PlantId_Language",
                table: "PlantLongDescriptions",
                columns: new[] { "PlantId", "Language" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlantPerenualData_PerenualId",
                table: "PlantPerenualData",
                column: "PerenualId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlantPerenualData_PlantId",
                table: "PlantPerenualData",
                column: "PlantId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlantPhases_PlantId_PhaseType",
                table: "PlantPhases",
                columns: new[] { "PlantId", "PhaseType" });

            migrationBuilder.CreateIndex(
                name: "IX_PlantSources_PlantId_SourceType",
                table: "PlantSources",
                columns: new[] { "PlantId", "SourceType" });

            migrationBuilder.CreateIndex(
                name: "IX_PlantSources_SourceType_ExternalId",
                table: "PlantSources",
                columns: new[] { "SourceType", "ExternalId" });

            migrationBuilder.CreateIndex(
                name: "IX_PlantSynonyms_PlantId_Synonym",
                table: "PlantSynonyms",
                columns: new[] { "PlantId", "Synonym" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlantSynonyms_Synonym",
                table: "PlantSynonyms",
                column: "Synonym");

            migrationBuilder.CreateIndex(
                name: "IX_PlantTrefleData_PlantId",
                table: "PlantTrefleData",
                column: "PlantId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlantTrefleData_TrefleSlug",
                table: "PlantTrefleData",
                column: "TrefleSlug",
                unique: true,
                filter: "\"TrefleSlug\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlantCommonNames");

            migrationBuilder.DropTable(
                name: "PlantImages");

            migrationBuilder.DropTable(
                name: "PlantLongDescriptions");

            migrationBuilder.DropTable(
                name: "PlantPerenualData");

            migrationBuilder.DropTable(
                name: "PlantPhases");

            migrationBuilder.DropTable(
                name: "PlantSources");

            migrationBuilder.DropTable(
                name: "PlantSynonyms");

            migrationBuilder.DropTable(
                name: "PlantTrefleData");

            migrationBuilder.DropIndex(
                name: "IX_Plants_EnrichmentStatus",
                table: "Plants");

            migrationBuilder.DropIndex(
                name: "IX_Plants_Family",
                table: "Plants");

            migrationBuilder.DropIndex(
                name: "IX_Plants_GbifTaxonKey",
                table: "Plants");

            migrationBuilder.DropIndex(
                name: "IX_Plants_Genus",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "AttractsPollinators",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "Author",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "CareLevel",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "EnrichmentStatus",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "Family",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "GbifTaxonKey",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "Genus",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "GrowthRate",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "HardinessZoneMax",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "HardinessZoneMin",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsDroughtTolerant",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsEdible",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsIndoor",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsInvasive",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsMedicinal",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsSaltTolerant",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsThorny",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsToxicToHumans",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsToxicToPets",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "IsTropical",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "LastEnrichmentAt",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "LifeCycle",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "LightLevel",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "MaxHeightCm",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "MaxSpreadCm",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "MaxTempC",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "MinHeightCm",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "MinSpreadCm",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "MinTempC",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "SoilPhMax",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "SoilPhMin",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "SpeciesEpithet",
                table: "Plants");

            migrationBuilder.DropColumn(
                name: "WateringNeedLevel",
                table: "Plants");

            migrationBuilder.AlterColumn<DateTime>(
                name: "UpdatedAt",
                table: "Plants",
                type: "timestamp with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "CreatedAt",
                table: "Plants",
                type: "timestamp with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");
        }
    }
}
