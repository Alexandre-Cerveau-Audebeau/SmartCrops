using SmartCrops.Core.Dashboard;

namespace SmartCrops.Api.Tests.Dashboard;

/// <summary>
/// The sizes a block may take, per level (<see cref="DashboardCapabilities.SizesFor"/>):
/// the Key figures band takes the Full width alone at the Expert level; every
/// other block, at every level, takes Small, Medium and Large, in that order,
/// and never the Full width; every preset's size is one its block may take; an
/// unknown block takes none; the Full width is the fourth known size. The client
/// pins the same table (<c>constants/dashboardCapabilities.test.ts</c>), and
/// <see cref="DashboardLayoutReferenceTests"/> checks it against the shared
/// reference file.
/// </summary>
public class DashboardCapabilitiesTests
{
    private static readonly string[] ThreeSizes =
        [DashboardLayout.Sizes.Small, DashboardLayout.Sizes.Medium, DashboardLayout.Sizes.Large];

    /// <summary>The band at the Expert level — the one row of the table that is not Small, Medium, Large.</summary>
    private static bool IsExpertBand(string key, string level) =>
        key == "keyfigures" && level == DashboardLayout.Levels.Expert;

    /// <summary>Every (block, level) of the table but the band at the Expert level.</summary>
    public static TheoryData<string, string> OtherBlocksAtEveryLevel()
    {
        var data = new TheoryData<string, string>();
        foreach (var level in DashboardLayout.Levels.All)
        {
            foreach (var key in DashboardLayout.Blocks.All.Where(key => !IsExpertBand(key, level))) data.Add(key, level);
        }

        return data;
    }

    /// <summary>Every block a level's preset lists, with that level — what <c>Merge</c> can meet.</summary>
    public static TheoryData<string, string> PresetBlocksAtEveryLevel()
    {
        var data = new TheoryData<string, string>();
        foreach (var level in DashboardLayout.Levels.All)
        {
            foreach (var block in DashboardPresets.For(level)) data.Add(block.Key, level);
        }

        return data;
    }

    [Fact]
    public void SizesFor_TheKeyFiguresBandAtTheExpertLevel_IsTheFullWidth_Alone()
    {
        Assert.Equal([DashboardLayout.Sizes.Wide], DashboardCapabilities.SizesFor("keyfigures", DashboardLayout.Levels.Expert));
    }

    [Theory]
    [MemberData(nameof(OtherBlocksAtEveryLevel))]
    public void SizesFor_EveryOtherBlockAtEveryLevel_IsSmallMediumLarge_InThatOrder(string key, string level)
    {
        Assert.Equal(ThreeSizes, DashboardCapabilities.SizesFor(key, level));
    }

    [Theory]
    [MemberData(nameof(OtherBlocksAtEveryLevel))]
    public void SizesFor_NoOtherBlockIsOfferedTheFullWidthYet(string key, string level)
    {
        Assert.DoesNotContain(DashboardLayout.Sizes.Wide, DashboardCapabilities.SizesFor(key, level));
    }

    /// <summary>
    /// The size <c>Merge</c> falls back to on read is the preset's: it must be
    /// one the block may take at that level, or the fallback would itself be a
    /// size the write path refuses.
    /// </summary>
    [Theory]
    [MemberData(nameof(PresetBlocksAtEveryLevel))]
    public void EveryPresetSize_IsOneItsBlockMayTake(string key, string level)
    {
        var preset = DashboardPresets.For(level).Single(block => block.Key == key);

        Assert.Contains(preset.Size, DashboardCapabilities.SizesFor(key, level));
    }

    [Fact]
    public void Wide_IsAKnownSize_TheFourth()
    {
        Assert.Equal(
            [DashboardLayout.Sizes.Small, DashboardLayout.Sizes.Medium, DashboardLayout.Sizes.Large, DashboardLayout.Sizes.Wide],
            DashboardLayout.Sizes.All);
        Assert.Equal("wide", DashboardLayout.Sizes.Wide);
    }

    [Fact]
    public void SizesFor_AnUnknownBlock_IsEmpty()
    {
        Assert.Empty(DashboardCapabilities.SizesFor("compost", DashboardLayout.Levels.Expert));
    }
}
