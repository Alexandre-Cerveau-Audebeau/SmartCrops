using SmartCrops.Core.Dashboard;

namespace SmartCrops.Api.Tests.Dashboard;

/// <summary>
/// SMA-437 lot 1, PR A, step A5 (pre-flight D3, D4) — the sizes a block may
/// take, per formula. The twin of the client's
/// <c>constants/dashboardCapabilities.test.ts</c>: the same table, pinned
/// literally on both sides, as the presets are.
///
/// <para>In this PR NO block has <c>wide</c>: the Full width is offered to a
/// widget the day its Full-width version is drawn (A-N11), by adding it to that
/// widget's Expert row on both sides.</para>
/// </summary>
public class DashboardCapabilitiesTests
{
    private static readonly string[] ThreeSizes =
        [DashboardLayout.Sizes.Small, DashboardLayout.Sizes.Medium, DashboardLayout.Sizes.Large];

    public static TheoryData<string, string> BlocksAtEveryLevel()
    {
        var data = new TheoryData<string, string>();
        foreach (var level in DashboardLayout.Levels.All)
        {
            foreach (var key in DashboardLayout.Blocks.All) data.Add(key, level);
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(BlocksAtEveryLevel))]
    public void SizesFor_EveryBlockAtEveryLevel_IsSmallMediumLarge_InThatOrder(string key, string level)
    {
        Assert.Equal(ThreeSizes, DashboardCapabilities.SizesFor(key, level));
    }

    [Theory]
    [MemberData(nameof(BlocksAtEveryLevel))]
    public void SizesFor_NoBlockIsOfferedTheFullWidthYet(string key, string level)
    {
        Assert.DoesNotContain(DashboardLayout.Sizes.Wide, DashboardCapabilities.SizesFor(key, level));
    }

    /// <summary>
    /// The size <c>Merge</c> falls back to on read is the preset's: it must be
    /// one the block may take at that level, or the fallback would itself be a
    /// size the write path refuses.
    /// </summary>
    [Theory]
    [MemberData(nameof(BlocksAtEveryLevel))]
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
