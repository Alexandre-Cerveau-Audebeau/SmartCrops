using SmartCrops.Core.Dashboard;

namespace SmartCrops.Api.Tests.Dashboard;

/// <summary>
/// SMA-437 lot 1, PR A, step A5 (pre-flight D3, D4) — the sizes a block may
/// take, per formula. The twin of the client's
/// <c>constants/dashboardCapabilities.test.ts</c>: the same table, pinned
/// literally on both sides, as the presets are — and cross-checked against the
/// shared reference file by <see cref="DashboardLayoutReferenceTests"/>
/// (PR #287, fix round 1, S2).
///
/// <para>Since PR B, step B1 (pre-flight D3), ONE row has <c>wide</c>: the Key
/// figures band at the Expert level, whose one size it is. Every other block is
/// offered the Full width the day its Full-width version is drawn (A-N11), by
/// adding it to that block's Expert row on both sides. Whether a level has a
/// block at all is its preset's to say (D4): the band's rows at the two other
/// levels are never read.</para>
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
