using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.ExternalApis.SearchIndex;

namespace SmartCrops.Api.Tests.ExternalApis.SearchIndex;

/// <summary>
/// Unit tests for the finder's filter_by grammar (SMA-255 T3) — the encoding
/// of the "absence never excludes" rule: unknown sentinel appended to every
/// enum/boolean facet, numeric ranges OR-ed with the Known companions, groups
/// joined with &amp;&amp;, and the injection guard (vocabulary/range
/// validation throws instead of passing raw values to the engine).
/// </summary>
public class PlantSearchFilterBuilderTests
{
    [Fact]
    public void Build_NoActiveFacet_ReturnsNull()
    {
        Assert.Null(PlantSearchFilterBuilder.Build(new PlantSearchQuery()));
    }

    [Fact]
    public void Build_PlantTypeIds_NoUnknownBranch()
    {
        var filter = PlantSearchFilterBuilder.Build(new PlantSearchQuery { PlantTypeIds = [1, 3] });

        Assert.Equal("plantTypeId:=[1,3]", filter);
    }

    [Fact]
    public void Build_EnumFacet_AppendsUnknownSentinel()
    {
        var filter = PlantSearchFilterBuilder.Build(new PlantSearchQuery
        {
            CareLevels = ["Easy", "Medium"],
        });

        Assert.Equal("careLevel:=[Easy,Medium,unknown]", filter);
    }

    [Fact]
    public void Build_EnumFacet_DeduplicatesSelections()
    {
        var filter = PlantSearchFilterBuilder.Build(new PlantSearchQuery
        {
            LifeCycles = ["Annual", "Annual"],
        });

        Assert.Equal("lifeCycle:=[Annual,unknown]", filter);
    }

    [Fact]
    public void Build_EnumFacet_UnknownValue_Throws()
    {
        var query = new PlantSearchQuery { CareLevels = ["Easy", "DROP TABLE"] };

        var ex = Assert.Throws<ArgumentException>(() => PlantSearchFilterBuilder.Build(query));

        Assert.Contains("DROP TABLE", ex.Message);
        Assert.Contains("careLevel", ex.Message);
    }

    [Theory]
    [InlineData(true, "isToxicToPets:=[true,unknown]")]
    [InlineData(false, "isToxicToPets:=[false,unknown]")]
    public void Build_TriStateBoolean_IncludesUnknown(bool value, string expected)
    {
        var filter = PlantSearchFilterBuilder.Build(new PlantSearchQuery { IsToxicToPets = value });

        Assert.Equal(expected, filter);
    }

    [Fact]
    public void Build_TriStateBoolean_NullMeansNoClause()
    {
        Assert.Null(PlantSearchFilterBuilder.Build(new PlantSearchQuery { IsEdible = null }));
    }

    [Fact]
    public void Build_PairedRange_OverlapPlusEitherKnownFalse()
    {
        var filter = PlantSearchFilterBuilder.Build(new PlantSearchQuery
        {
            HardinessZoneMin = 4,
            HardinessZoneMax = 9,
        });

        Assert.Equal(
            "((hardinessZoneMax:>=4 && hardinessZoneMin:<=9) "
            + "|| hardinessZoneMinKnown:=false || hardinessZoneMaxKnown:=false)",
            filter);
    }

    [Fact]
    public void Build_PairedRange_MinOnly_BoundsOnDocMax()
    {
        var filter = PlantSearchFilterBuilder.Build(new PlantSearchQuery { HeightCmMin = 50 });

        Assert.Equal(
            "((maxHeightCm:>=50) || minHeightCmKnown:=false || maxHeightCmKnown:=false)",
            filter);
    }

    [Fact]
    public void Build_PairedRange_MaxOnly_BoundsOnDocMin()
    {
        var filter = PlantSearchFilterBuilder.Build(new PlantSearchQuery { HeightCmMax = 200 });

        Assert.Equal(
            "((minHeightCm:<=200) || minHeightCmKnown:=false || maxHeightCmKnown:=false)",
            filter);
    }

    [Fact]
    public void Build_DecimalRange_InvariantCultureFormatting()
    {
        var filter = PlantSearchFilterBuilder.Build(new PlantSearchQuery
        {
            XWateringPhMin = 5.5m,
            XWateringPhMax = 7.2m,
        });

        Assert.Equal(
            "((xWateringPhMax:>=5.5 && xWateringPhMin:<=7.2) "
            + "|| xWateringPhMinKnown:=false || xWateringPhMaxKnown:=false)",
            filter);
    }

    [Fact]
    public void Build_SingleFieldRange_SingleKnownCompanion()
    {
        var filter = PlantSearchFilterBuilder.Build(new PlantSearchQuery
        {
            XPlantSpacingValueMin = 10,
            XPlantSpacingValueMax = 50,
        });

        Assert.Equal(
            "((xPlantSpacingValue:>=10 && xPlantSpacingValue:<=50) "
            + "|| xPlantSpacingValueKnown:=false)",
            filter);
    }

    [Fact]
    public void Build_RangeMinGreaterThanMax_Throws()
    {
        var query = new PlantSearchQuery { HardinessZoneMin = 9, HardinessZoneMax = 4 };

        Assert.Throws<ArgumentException>(() => PlantSearchFilterBuilder.Build(query));
    }

    [Fact]
    public void Build_MultipleFacets_JoinedWithAnd()
    {
        var filter = PlantSearchFilterBuilder.Build(new PlantSearchQuery
        {
            PlantTypeIds = [2],
            CareLevels = ["Easy"],
            IsEdible = true,
            HardinessZoneMin = 4,
            HardinessZoneMax = 9,
        });

        Assert.Equal(
            "plantTypeId:=[2] && careLevel:=[Easy,unknown] && isEdible:=[true,unknown] "
            + "&& ((hardinessZoneMax:>=4 && hardinessZoneMin:<=9) "
            + "|| hardinessZoneMinKnown:=false || hardinessZoneMaxKnown:=false)",
            filter);
    }
}
