using SmartCrops.Core.Dashboard;

namespace SmartCrops.Api.Tests.Dashboard;

/// <summary>
/// SMA-437 lot 1, PR B, step B2 (pre-flight D9, D10) — the figures the Key
/// figures band may show: the 22 of V3-04, and the four of 23/09. The twin of
/// the client's <c>keyFiguresOptions.test.ts</c>: the same lists, pinned
/// literally on both sides, and both compared to the shared reference file by
/// <see cref="DashboardLayoutReferenceTests"/>.
/// </summary>
public class DashboardKeyFiguresTests
{
    [Fact]
    public void All_IsTheTwentyTwoFiguresOfV304_InTheirOrder()
    {
        Assert.Equal(
            [
                "gardens", "plants", "varieties", "edible", "ornam",
                "surface", "active", "planted", "occupancy", "free", "freeSun", "sunShare",
                "prune", "sow", "harvest", "flower",
                "todo", "tips",
                "noplan", "noorient", "located", "cities",
            ],
            DashboardKeyFigures.All);
    }

    [Fact]
    public void Defaults_AreFreeCells_Occupancy_Varieties_Todo_InThatOrder()
    {
        Assert.Equal(["free", "occupancy", "varieties", "todo"], DashboardKeyFigures.Defaults);
    }

    [Fact]
    public void IsValidSelection_TakesFourDistinctKnownFigures()
    {
        Assert.True(DashboardKeyFigures.IsValidSelection(["cities", "free", "tips", "surface"]));
        Assert.True(DashboardKeyFigures.IsValidSelection(DashboardKeyFigures.Defaults));
    }

    public static TheoryData<string, string[]> InvalidSelections() => new()
    {
        { "three", ["free", "occupancy", "varieties"] },
        { "five", ["free", "occupancy", "varieties", "todo", "tips"] },
        { "a duplicate", ["free", "free", "varieties", "todo"] },
        { "an unknown figure", ["free", "occupancy", "compost", "todo"] },
        { "a figure in the wrong case", ["free", "occupancy", "Varieties", "todo"] },
        { "none", [] },
    };

    [Theory]
    [MemberData(nameof(InvalidSelections))]
    public void IsValidSelection_RefusesAnythingElse(string label, string[] figures)
    {
        Assert.False(DashboardKeyFigures.IsValidSelection(figures), label);
    }
}
