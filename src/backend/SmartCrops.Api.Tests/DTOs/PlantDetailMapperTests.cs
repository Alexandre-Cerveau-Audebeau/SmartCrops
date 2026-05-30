using SmartCrops.Api.DTOs;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;

namespace SmartCrops.Api.Tests.DTOs;

/// <summary>
/// Unit tests for <see cref="PlantDetailMapper"/> focused on the Perenual
/// Supreme xData projection (Sprint 1.5 PR B Phase 2d). The mapper builds
/// <see cref="PlantPerenualDataDto"/> with POSITIONAL arguments, so distinct
/// per-field values are used to catch any silent slot misalignment between the
/// entity and the DTO record (the 8 nullable-int fields are otherwise
/// indistinguishable to the compiler).
/// </summary>
public class PlantDetailMapperTests
{
    [Fact]
    public void ToDto_MapsAllTwelveXDataFields_ByCorrectSlot()
    {
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = "Aloe vera",
            PerenualData = new PlantPerenualData
            {
                PerenualId = 728,
                // Distinct values per field so a swapped positional slot fails.
                XWateringBasedTempMinC = 11,
                XWateringBasedTempMaxC = 24,
                XWateringPhMin = 6.0m,
                XWateringPhMax = 8.0m,
                XSunlightHoursMin = 4,
                XSunlightHoursMax = 7,
                XTemperatureToleranceMinC = -10,
                XTemperatureToleranceMaxC = 38,
                XPlantSpacingValue = 18,
                XPlantSpacingUnit = "inches",
                XWateringQualityJson = "[\"Rainwater\"]",
                XWateringPeriodJson = "[\"Morning\"]",
                LastSyncAt = DateTime.UtcNow,
            },
        };

        var dto = PlantDetailMapper.ToDto(plant);

        Assert.NotNull(dto.PerenualData);
        var pd = dto.PerenualData!;
        Assert.Equal(11, pd.XWateringBasedTempMinC);
        Assert.Equal(24, pd.XWateringBasedTempMaxC);
        Assert.Equal(6.0m, pd.XWateringPhMin);
        Assert.Equal(8.0m, pd.XWateringPhMax);
        Assert.Equal(4, pd.XSunlightHoursMin);
        Assert.Equal(7, pd.XSunlightHoursMax);
        Assert.Equal(-10, pd.XTemperatureToleranceMinC);
        Assert.Equal(38, pd.XTemperatureToleranceMaxC);
        Assert.Equal(18, pd.XPlantSpacingValue);
        Assert.Equal("inches", pd.XPlantSpacingUnit);
        Assert.Equal("[\"Rainwater\"]", pd.XWateringQualityJson);
        Assert.Equal("[\"Morning\"]", pd.XWateringPeriodJson);
    }

    [Fact]
    public void ToDto_NullXData_PreservesNulls()
    {
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = "Aloe vera",
            PerenualData = new PlantPerenualData { PerenualId = 728, LastSyncAt = DateTime.UtcNow },
        };

        var dto = PlantDetailMapper.ToDto(plant);

        Assert.NotNull(dto.PerenualData);
        var pd = dto.PerenualData!;
        Assert.Null(pd.XWateringBasedTempMinC);
        Assert.Null(pd.XWateringBasedTempMaxC);
        Assert.Null(pd.XWateringPhMin);
        Assert.Null(pd.XWateringPhMax);
        Assert.Null(pd.XSunlightHoursMin);
        Assert.Null(pd.XSunlightHoursMax);
        Assert.Null(pd.XTemperatureToleranceMinC);
        Assert.Null(pd.XTemperatureToleranceMaxC);
        Assert.Null(pd.XPlantSpacingValue);
        Assert.Null(pd.XPlantSpacingUnit);
        Assert.Null(pd.XWateringQualityJson);
        Assert.Null(pd.XWateringPeriodJson);
    }

    // ── SMA-70: ExposeSourceText gating ─────────────────────────────────────

    private static Plant BuildPlantWithSourceText() => new()
    {
        Id = Guid.NewGuid(),
        ScientificName = "Abelia chinensis",
        // Gated source text:
        EdibleParts = "[\"leaf\"]",
        SowingInstructions = "Sow in spring.",
        PropagationInstructions = "Division; Root Cutting.",
        LongDescriptions = new List<PlantLongDescription>
        {
            new() { Id = 1, Language = "en", LongDescription = "Chinese Abelia is a flowering shrub.", SourceMethod = "perenual" },
        },
        // Factual data that must always survive:
        HardinessZoneMin = 6,
        HardinessZoneMax = 9,
        PerenualData = new PlantPerenualData
        {
            PerenualId = 398,
            // Gated free-text care fields:
            SunlightPreferences = "full sun, part shade",
            PruningMonths = "March,April",
            Maintenance = "Low",
            FloweringSeason = "spring",
            HarvestSeason = "summer",
            PropagationMethods = "Division",
            OriginCountries = "China",
            // Factual xData that must always survive:
            XSunlightHoursMin = 6,
            LastSyncAt = DateTime.UtcNow,
        },
    };

    [Fact]
    public void ToDto_ExposeSourceTextFalse_GatesPerenualSourceText()
    {
        var dto = PlantDetailMapper.ToDto(BuildPlantWithSourceText(), exposeSourceText: false);

        // Source text gated out.
        Assert.Null(dto.EdibleParts);
        Assert.Null(dto.SowingInstructions);
        Assert.Null(dto.PropagationInstructions);
        Assert.Empty(dto.LongDescriptions);
        Assert.NotNull(dto.PerenualData);
        Assert.Null(dto.PerenualData!.SunlightPreferences);
        Assert.Null(dto.PerenualData.PruningMonths);
        Assert.Null(dto.PerenualData.Maintenance);
        Assert.Null(dto.PerenualData.FloweringSeason);
        Assert.Null(dto.PerenualData.HarvestSeason);
        Assert.Null(dto.PerenualData.PropagationMethods);
        Assert.Null(dto.PerenualData.OriginCountries);

        // Factual data preserved.
        Assert.Equal(6, dto.HardinessZoneMin);
        Assert.Equal(9, dto.HardinessZoneMax);
        Assert.Equal(6, dto.PerenualData.XSunlightHoursMin);
    }

    [Fact]
    public void ToDto_ExposeSourceTextTrue_KeepsPerenualSourceText()
    {
        var dto = PlantDetailMapper.ToDto(BuildPlantWithSourceText(), exposeSourceText: true);

        Assert.Equal("[\"leaf\"]", dto.EdibleParts);
        Assert.Equal("Sow in spring.", dto.SowingInstructions);
        Assert.Equal("Division; Root Cutting.", dto.PropagationInstructions);
        Assert.Single(dto.LongDescriptions);
        Assert.NotNull(dto.PerenualData);
        // All seven gated PerenualData free-text fields survive on the expose
        // path — mirrors the full set the false-path test pins, so a one-sided
        // regression on either branch of the gating ternary fails the suite.
        Assert.Equal("full sun, part shade", dto.PerenualData!.SunlightPreferences);
        Assert.Equal("March,April", dto.PerenualData.PruningMonths);
        Assert.Equal("Low", dto.PerenualData.Maintenance);
        Assert.Equal("spring", dto.PerenualData.FloweringSeason);
        Assert.Equal("summer", dto.PerenualData.HarvestSeason);
        Assert.Equal("Division", dto.PerenualData.PropagationMethods);
        Assert.Equal("China", dto.PerenualData.OriginCountries);
        // Factual data survives on both paths.
        Assert.Equal(6, dto.PerenualData.XSunlightHoursMin);
    }

    [Fact]
    public void ToDto_Default_GatesSourceText()
    {
        // The parameterless-default overload must default to the safe (gated) path.
        var dto = PlantDetailMapper.ToDto(BuildPlantWithSourceText());
        Assert.Null(dto.PropagationInstructions);
        Assert.Empty(dto.LongDescriptions);
    }

    // ── SMA-70: image attribution always non-null ───────────────────────────

    [Fact]
    public void ToDto_Image_AlwaysHasAttribution()
    {
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = "Achillea millefolium",
            Images = new List<PlantImage>
            {
                // Trefle: credit present, no structured license.
                new() { Id = 1, ImageType = PlantImageType.Main, Url = "https://t/1.jpg",
                        Credit = "Taken 2018 by Dieter Wagner (cc-by-sa)", Source = PlantSourceType.Trefle },
                // Perenual: license present, no credit.
                new() { Id = 2, ImageType = PlantImageType.Flower, Url = "https://p/2.jpg",
                        LicenseName = "Attribution-ShareAlike License", Source = PlantSourceType.Perenual },
            },
        };

        var dto = PlantDetailMapper.ToDto(plant);

        Assert.All(dto.Images, img => Assert.False(string.IsNullOrWhiteSpace(img.Attribution)));
        var trefle = dto.Images.Single(i => i.Source == "Trefle");
        var perenual = dto.Images.Single(i => i.Source == "Perenual");
        Assert.Equal("Taken 2018 by Dieter Wagner (cc-by-sa)", trefle.Attribution);
        Assert.Equal("© Perenual — Attribution-ShareAlike License", perenual.Attribution);
        // LicenseUrl falls back to the per-source terms URL when the row has none.
        Assert.False(string.IsNullOrWhiteSpace(perenual.LicenseUrl));
        Assert.False(string.IsNullOrWhiteSpace(trefle.LicenseUrl));
    }
}
