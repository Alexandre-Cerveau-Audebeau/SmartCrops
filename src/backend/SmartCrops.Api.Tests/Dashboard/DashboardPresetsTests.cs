using SmartCrops.Core.Dashboard;

namespace SmartCrops.Api.Tests.Dashboard;

/// <summary>
/// SMA-336 round 1 (E4) — the invariant every preset must hold: it lists every
/// block its level PERMITS, exactly once. Until SMA-437 that was every block of
/// <see cref="DashboardLayout.Blocks.All"/>; since the Key figures band (lot 1,
/// PR B, step B1 — pre-flight D4), the blocks of a level ARE those of its
/// preset, and the band is the Expert's alone.
///
/// <para><c>DashboardController.Merge</c> resolves a stored block's fallback size
/// with <c>preset.First(p =&gt; p.Key == block.Key)</c>. That call is only safe
/// because <c>Merge</c> first drops every block the level does not permit
/// (<see cref="DashboardPresets.Permits"/>) — the band in a Gardener's layout
/// — and because each preset lists every block it permits: a block permitted
/// but missing from its preset would make <c>Merge</c> throw
/// <c>InvalidOperationException</c> on a read path the controller documents as
/// never failing.</para>
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

    /// <summary>
    /// The Expert lists all nine blocks (V3-01: « Les chiffres clés — Non · Non ·
    /// Oui »). The Gardener never has the band, and since the formulas (SMA-448,
    /// lot F1) never Statistics either — R1, V3-01: « Les statistiques — Non ·
    /// Non · Oui », « retiré au Jardinier » — while it keeps Récolte (Alexandre,
    /// 26/09, question 3). The Novice keeps today's eight until its own page
    /// (lot F2). Literals on purpose — the keys are the wire contract.
    /// </summary>
    [Theory]
    [InlineData(DashboardLayout.Levels.Novice, "keyfigures")]
    [InlineData(DashboardLayout.Levels.Gardener, "keyfigures,stats")]
    [InlineData(DashboardLayout.Levels.Expert, "")]
    public void For_EveryLevel_ListsExactlyTheBlocksItsLevelPermits_EachOnce(string level, string without)
    {
        var excluded = without.Split(',', StringSplitOptions.RemoveEmptyEntries);
        var preset = DashboardPresets.For(level);
        var expected = DashboardLayout.Blocks.All.Where(key => !excluded.Contains(key));

        Assert.Equal(
            expected.OrderBy(k => k, StringComparer.Ordinal),
            preset.Select(b => b.Key).OrderBy(k => k, StringComparer.Ordinal));
        Assert.Equal(preset.Count, preset.Select(b => b.Key).Distinct(StringComparer.Ordinal).Count());
    }

    /// <summary>
    /// « en tête du preset Expert » (contract § 3.3 [A], § 4.5): the band first,
    /// in the Full width — its one size — then the eight widgets in Large.
    /// </summary>
    [Fact]
    public void For_Expert_PutsTheKeyFiguresBandFirst_InFullWidth_ThenTheEightInLarge()
    {
        var expert = DashboardPresets.For(DashboardLayout.Levels.Expert);

        Assert.Equal(new DashboardPresetBlock("keyfigures", "wide", false), expert[0]);
        Assert.Equal(
            DashboardLayout.Blocks.All.Where(key => key != "keyfigures"),
            expert.Skip(1).Select(b => b.Key));
        Assert.All(expert.Skip(1), block => Assert.Equal(new DashboardPresetBlock(block.Key, "large", false), block));
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
    /// The exact call <c>Merge</c> makes, for every block a level permits: it
    /// must never be the one that throws. A block the level does not permit
    /// never reaches it — <c>Merge</c> drops it first (pre-flight D4).
    /// </summary>
    [Theory]
    [MemberData(nameof(Levels))]
    public void For_EveryLevel_ResolvesTheFallbackSizeOfEveryBlockItPermits(string level)
    {
        var preset = DashboardPresets.For(level);

        // `Assert.Contains`, not `Assert.NotNull(preset.First(...))` (round 2,
        // E'1): `First` throws when the key is missing and returns a reference
        // type when it is not, so the null check could never fail. This states
        // the property the test is named for.
        Assert.All(
            DashboardLayout.Blocks.All.Where(key => DashboardPresets.Permits(level, key)),
            key => Assert.Contains(preset, p => p.Key == key));
    }

    /// <summary>
    /// The blocks of a level are those of its preset (pre-flight D4) — the rule
    /// the controller refuses a write by and drops a stored block by.
    /// </summary>
    [Theory]
    [InlineData(DashboardLayout.Levels.Novice, "keyfigures", false)]
    [InlineData(DashboardLayout.Levels.Gardener, "keyfigures", false)]
    [InlineData(DashboardLayout.Levels.Expert, "keyfigures", true)]
    [InlineData(DashboardLayout.Levels.Gardener, "stats", false)]
    [InlineData(DashboardLayout.Levels.Expert, "stats", true)]
    [InlineData(DashboardLayout.Levels.Gardener, "harvest", true)]
    [InlineData(DashboardLayout.Levels.Novice, "stats", true)]
    [InlineData(DashboardLayout.Levels.Expert, "compost", false)]
    [InlineData("archdruid", "keyfigures", false)]
    public void Permits_IsWhetherTheLevelsPresetListsTheBlock(string level, string key, bool permitted)
    {
        Assert.Equal(permitted, DashboardPresets.Permits(level, key));
    }

    /// <summary>
    /// D18 — <c>DashboardController.MaxRequestBodyBytes</c> derives from the
    /// NUMBER of blocks, and <c>[RequestSizeLimit]</c> needs a constant: the
    /// constant must be the length of the list, or the ceiling lies.
    /// </summary>
    [Fact]
    public void Blocks_Count_IsTheNumberOfBlocks()
    {
        // The constant on the `expected` side (xUnit2000).
        Assert.Equal(DashboardLayout.Blocks.Count, DashboardLayout.Blocks.All.Count);
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
