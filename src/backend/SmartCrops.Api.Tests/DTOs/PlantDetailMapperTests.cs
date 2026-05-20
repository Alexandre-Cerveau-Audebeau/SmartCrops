using SmartCrops.Api.DTOs;
using SmartCrops.Core.Entities;

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
        Assert.Null(pd.XWateringPhMin);
        Assert.Null(pd.XSunlightHoursMax);
        Assert.Null(pd.XPlantSpacingUnit);
        Assert.Null(pd.XWateringQualityJson);
        Assert.Null(pd.XWateringPeriodJson);
    }
}
