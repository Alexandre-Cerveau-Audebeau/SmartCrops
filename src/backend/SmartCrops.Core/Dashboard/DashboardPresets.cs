using System.Diagnostics.CodeAnalysis;

namespace SmartCrops.Core.Dashboard;

/// <summary>
/// One block of a preset: its footprint and whether the level hides it by
/// default. Order comes from the enclosing list, not from a field.
/// </summary>
/// <param name="Key">One of <see cref="DashboardLayout.Blocks"/>.</param>
/// <param name="Size">One of <see cref="DashboardLayout.Sizes"/>.</param>
/// <param name="Hidden">True when the level does not show the block by default.</param>
public record DashboardPresetBlock(string Key, string Size, bool Hidden);

/// <summary>
/// SMA-336 — the three level presets, verbatim from the frozen design
/// (<c>_spec.md</c> § 8): « Novice : Météo Moyen, Jardins Moyen, Conseils Petit,
/// Ce mois-ci Petit », « Jardinier : Météo Moyen, Jardins Grand, Conseils Moyen,
/// Ce mois-ci Moyen, À faire Moyen, Compteurs Moyen », « Expert : les huit
/// widgets en Grand ».
///
/// <para>Every preset lists all eight blocks: a block a level does not show is
/// present and <c>Hidden</c>, so the Customize gallery can offer it back without
/// inventing an entry. This is also the fallback the API serves when a user has
/// no saved layout, or one stored under an unknown schema version.</para>
/// </summary>
public static class DashboardPresets
{
    private const string S = DashboardLayout.Sizes.Small;
    private const string M = DashboardLayout.Sizes.Medium;
    private const string L = DashboardLayout.Sizes.Large;

    private static readonly IReadOnlyList<DashboardPresetBlock> NovicePreset =
    [
        new(DashboardLayout.Blocks.Weather, M, false),
        new(DashboardLayout.Blocks.Gardens, M, false),
        new(DashboardLayout.Blocks.Tips, S, false),
        new(DashboardLayout.Blocks.Month, S, false),
        new(DashboardLayout.Blocks.Todo, M, true),
        new(DashboardLayout.Blocks.Counters, M, true),
        new(DashboardLayout.Blocks.Stats, L, true),
        new(DashboardLayout.Blocks.Harvest, L, true),
    ];

    private static readonly IReadOnlyList<DashboardPresetBlock> GardenerPreset =
    [
        new(DashboardLayout.Blocks.Weather, M, false),
        new(DashboardLayout.Blocks.Gardens, L, false),
        new(DashboardLayout.Blocks.Tips, M, false),
        new(DashboardLayout.Blocks.Month, M, false),
        new(DashboardLayout.Blocks.Todo, M, false),
        new(DashboardLayout.Blocks.Counters, M, false),
        new(DashboardLayout.Blocks.Stats, L, true),
        new(DashboardLayout.Blocks.Harvest, L, true),
    ];

    private static readonly IReadOnlyList<DashboardPresetBlock> ExpertPreset =
        [.. DashboardLayout.Blocks.All.Select(key => new DashboardPresetBlock(key, L, false))];

    /// <summary>
    /// The preset for a level. An unknown level falls back to
    /// <see cref="DashboardLayout.DefaultLevel"/> rather than throwing: a stored
    /// document must never be able to make a read fail.
    /// </summary>
    public static IReadOnlyList<DashboardPresetBlock> For(string? level) => level switch
    {
        DashboardLayout.Levels.Novice => NovicePreset,
        DashboardLayout.Levels.Expert => ExpertPreset,
        _ => GardenerPreset,
    };

    /// <summary>
    /// True when the level is one this server knows. Annotated so the compiler
    /// narrows <paramref name="level"/> to non-null at the call site.
    /// </summary>
    public static bool IsKnownLevel([NotNullWhen(true)] string? level) =>
        level is not null && DashboardLayout.Levels.All.Contains(level);
}
