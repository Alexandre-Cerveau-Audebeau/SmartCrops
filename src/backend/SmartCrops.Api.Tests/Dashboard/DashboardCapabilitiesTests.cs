using SmartCrops.Core.Dashboard;

namespace SmartCrops.Api.Tests.Dashboard;

/// <summary>
/// The sizes a block may take, per level (<see cref="DashboardCapabilities.SizesFor"/>):
/// the Key figures band takes the Full width alone at the Expert level; the
/// Weather takes the three sizes and then the Full width there (SMA-448, lot
/// F4), and so does the Gardens widget (SMA-448, lot F5-b), and so do
/// Statistics, Counts and This month (SMA-437, lot V3-08); every other block,
/// at every level, takes Small, Medium and Large, in that order, and never the
/// Full width; every preset's size is one its block may take; an unknown block
/// takes none; the Full width is the fourth known size. The client pins the
/// same table
/// (<c>constants/dashboardCapabilities.test.ts</c>), and
/// <see cref="DashboardLayoutReferenceTests"/> checks it against the shared
/// reference file.
/// </summary>
public class DashboardCapabilitiesTests
{
    private static readonly string[] ThreeSizes =
        [DashboardLayout.Sizes.Small, DashboardLayout.Sizes.Medium, DashboardLayout.Sizes.Large];

    /// <summary>
    /// The widgets DRAWN in Full width besides the band, the Expert's alone:
    /// the Weather (SMA-448, lot F4), the Gardens (lot F5-b), and Statistics,
    /// Counts and This month (SMA-437, lot V3-08 — decided on 28/09). Literals
    /// on purpose: the keys are the wire contract.
    /// </summary>
    private static readonly string[] ExpertFullWidthWidgets = ["weather", "gardens", "month", "counters", "stats"];

    /// <summary>The band at the Expert level — the one row of the table that is not Small, Medium, Large.</summary>
    private static bool IsExpertBand(string key, string level) =>
        key == "keyfigures" && level == DashboardLayout.Levels.Expert;

    /// <summary>A widget drawn in Full width, at the Expert level — a row that is Small, Medium, Large AND the Full width.</summary>
    private static bool IsExpertFullWidth(string key, string level) =>
        ExpertFullWidthWidgets.Contains(key) && level == DashboardLayout.Levels.Expert;

    /// <summary>Every (block, level) of the table but the band and the five Full-width widgets at the Expert level.</summary>
    public static TheoryData<string, string> OtherBlocksAtEveryLevel()
    {
        var data = new TheoryData<string, string>();
        foreach (var level in DashboardLayout.Levels.All)
        {
            foreach (var key in DashboardLayout.Blocks.All.Where(key => !IsExpertBand(key, level) && !IsExpertFullWidth(key, level))) data.Add(key, level);
        }

        return data;
    }

    /// <summary>The three widgets of lot V3-08, each checked on its own row.</summary>
    public static TheoryData<string> V308Widgets() => ["stats", "counters", "month"];

    /// <summary>
    /// Every block a level's preset lists, with that level — what <c>Merge</c>
    /// can meet. The Novice contributes no row since SMA-448, lot F2: its
    /// preset is empty (<c>DashboardPresetsTests.For_Novice_IsEmpty_TheFormulaHasNoWidget</c>),
    /// so <c>Merge</c> meets no block of its own.
    /// </summary>
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

    /// <summary>
    /// SMA-448, lot F4 (V3-02; A-N11): the Expert's Weather is drawn in Full
    /// width — every city at once — so its row is the three sizes and then the
    /// Full width, the order the corner handle steps through (P → M → G → PL →
    /// P). The Gardener's row stays the three sizes: the Full width is the
    /// Expert's alone.
    /// </summary>
    [Fact]
    public void SizesFor_TheWeatherAtTheExpertLevel_IsTheThreeSizesThenTheFullWidth()
    {
        Assert.Equal(
            [DashboardLayout.Sizes.Small, DashboardLayout.Sizes.Medium, DashboardLayout.Sizes.Large, DashboardLayout.Sizes.Wide],
            DashboardCapabilities.SizesFor(DashboardLayout.Blocks.Weather, DashboardLayout.Levels.Expert));
        Assert.Equal(ThreeSizes, DashboardCapabilities.SizesFor(DashboardLayout.Blocks.Weather, DashboardLayout.Levels.Gardener));
    }

    /// <summary>
    /// SMA-448, lot F5-b (V3-03 § 1, V3-04 § 4; pre-flight F5 § C.4, retained
    /// on 28/09; A-N11): the Expert's Gardens is drawn in Full width — the
    /// seven-column table — so its row is the three sizes and then the Full
    /// width, the order the corner handle steps through (P → M → G → PL → P).
    /// The Gardener's and the Novice's rows stay the three sizes: the Full
    /// width is the Expert's alone, and a Gardener's cycle never reaches it.
    /// </summary>
    [Fact]
    public void SizesFor_TheGardensAtTheExpertLevel_IsTheThreeSizesThenTheFullWidth()
    {
        Assert.Equal(
            [DashboardLayout.Sizes.Small, DashboardLayout.Sizes.Medium, DashboardLayout.Sizes.Large, DashboardLayout.Sizes.Wide],
            DashboardCapabilities.SizesFor(DashboardLayout.Blocks.Gardens, DashboardLayout.Levels.Expert));
        Assert.Equal(ThreeSizes, DashboardCapabilities.SizesFor(DashboardLayout.Blocks.Gardens, DashboardLayout.Levels.Gardener));
        Assert.Equal(ThreeSizes, DashboardCapabilities.SizesFor(DashboardLayout.Blocks.Gardens, DashboardLayout.Levels.Novice));
    }

    /// <summary>
    /// SMA-437, lot V3-08 (A-14 — Alexandre, 28/09: « ok, parfait ça me va »):
    /// Statistics (one line per garden), Counts (four columns from 1 200 px)
    /// and This month (the grid alone) are drawn in Full width, so each Expert
    /// row is the three sizes and then the Full width — the corner handle's
    /// cycle P → M → G → PL → P (A-N11). The Gardener's and the Novice's rows
    /// stay the three sizes: the Full width is the Expert's alone.
    /// </summary>
    [Theory]
    [MemberData(nameof(V308Widgets))]
    public void SizesFor_AV308WidgetAtTheExpertLevel_IsTheThreeSizesThenTheFullWidth(string key)
    {
        Assert.Equal(
            [DashboardLayout.Sizes.Small, DashboardLayout.Sizes.Medium, DashboardLayout.Sizes.Large, DashboardLayout.Sizes.Wide],
            DashboardCapabilities.SizesFor(key, DashboardLayout.Levels.Expert));
        Assert.Equal(ThreeSizes, DashboardCapabilities.SizesFor(key, DashboardLayout.Levels.Gardener));
        Assert.Equal(ThreeSizes, DashboardCapabilities.SizesFor(key, DashboardLayout.Levels.Novice));
    }

    [Theory]
    [MemberData(nameof(OtherBlocksAtEveryLevel))]
    public void SizesFor_EveryOtherBlockAtEveryLevel_IsSmallMediumLarge_InThatOrder(string key, string level)
    {
        Assert.Equal(ThreeSizes, DashboardCapabilities.SizesFor(key, level));
    }

    /// <summary>
    /// Tips and To do never (A-N11: sentences a longer line makes harder to
    /// read), Harvest not yet (« plus tard »), and no widget at the Gardener's
    /// or the Novice's level.
    /// </summary>
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
