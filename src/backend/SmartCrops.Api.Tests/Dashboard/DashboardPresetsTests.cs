using SmartCrops.Core.Dashboard;

namespace SmartCrops.Api.Tests.Dashboard;

/// <summary>
/// SMA-336 round 1 (E4) — the invariant every preset must hold: it lists EVERY
/// block of <see cref="DashboardLayout.Blocks.All"/>, exactly once.
///
/// <para><c>DashboardController.Merge</c> resolves a stored block's fallback size
/// with <c>preset.First(p =&gt; p.Key == block.Key)</c>. That call is only safe
/// because of this invariant. <c>ExpertPreset</c> derives from <c>Blocks.All</c>
/// and is safe by construction; <c>NovicePreset</c> and <c>GardenerPreset</c> are
/// hand-written literals, so a ninth block added to <c>Blocks.All</c> without a
/// matching entry would make <c>Merge</c> throw <c>InvalidOperationException</c>
/// on a read path the controller documents as never failing.</para>
///
/// <para>A TEST rather than a static-constructor guard, deliberately: a throwing
/// type initializer turns the same mistake into a <c>TypeInitializationException</c>
/// raised at request time, in production, on that very read path — the failure
/// mode the invariant exists to prevent. Here it is a red build instead.</para>
/// </summary>
public class DashboardPresetsTests
{
    public static TheoryData<string> Levels()
    {
        var data = new TheoryData<string>();
        foreach (var level in DashboardLayout.Levels.All) data.Add(level);
        return data;
    }

    [Theory]
    [MemberData(nameof(Levels))]
    public void For_EveryLevel_ListsEveryBlockExactlyOnce(string level)
    {
        var preset = DashboardPresets.For(level);

        Assert.Equal(DashboardLayout.Blocks.All.Count, preset.Count);
        Assert.Equal(
            DashboardLayout.Blocks.All.OrderBy(k => k, StringComparer.Ordinal),
            preset.Select(b => b.Key).OrderBy(k => k, StringComparer.Ordinal));
        Assert.Equal(preset.Count, preset.Select(b => b.Key).Distinct(StringComparer.Ordinal).Count());
    }

    [Theory]
    [MemberData(nameof(Levels))]
    public void For_EveryLevel_UsesOnlyKnownSizes(string level)
    {
        Assert.All(
            DashboardPresets.For(level),
            block => Assert.Contains(block.Size, DashboardLayout.Sizes.All));
    }

    [Theory]
    [MemberData(nameof(Levels))]
    public void For_EveryLevel_NeverHidesTheNonHidableBlock(string level)
    {
        var gardens = DashboardPresets.For(level)
            .Single(b => b.Key == DashboardLayout.NonHidableBlock);

        Assert.False(gardens.Hidden);
    }

    /// <summary>
    /// The exact call <c>Merge</c> makes, for every block of every level: it must
    /// never be the one that throws.
    /// </summary>
    [Theory]
    [MemberData(nameof(Levels))]
    public void For_EveryLevel_ResolvesTheFallbackSizeOfEveryKnownBlock(string level)
    {
        var preset = DashboardPresets.For(level);

        // `Assert.Contains`, not `Assert.NotNull(preset.First(...))` (round 2,
        // E'1): `First` throws when the key is missing and returns a reference
        // type when it is not, so the null check could never fail. This states
        // the property the test is named for.
        Assert.All(
            DashboardLayout.Blocks.All,
            key => Assert.Contains(preset, p => p.Key == key));
    }

    [Fact]
    public void For_UnknownLevel_FallsBackToTheDefaultPreset()
    {
        Assert.Equal(
            DashboardPresets.For(DashboardLayout.DefaultLevel),
            DashboardPresets.For("archdruid"));
        Assert.Equal(
            DashboardPresets.For(DashboardLayout.DefaultLevel),
            DashboardPresets.For(null));
    }
}
