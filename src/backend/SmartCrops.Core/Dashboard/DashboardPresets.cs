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
/// widgets en Grand ». Since SMA-448 (lot F1) they are also the WIDGETS each
/// formula has, and <see cref="FormulaCatalog"/> serves them.
///
/// <para>Every preset lists every block its level permits: a block a level does
/// not show is present and <c>Hidden</c>, so the Customize gallery can offer it
/// back without inventing an entry. And ONLY those (SMA-437 lot 1, PR B, step
/// B1 — pre-flight D4): the blocks of a level ARE those of its preset
/// (<see cref="Permits"/>), and the Key figures band is the Expert's alone —
/// « en tête du preset Expert », in its one size, the Full width (D8). This is
/// also the fallback the API serves when a user has no saved layout, or one
/// stored under an unknown schema version.</para>
///
/// <para>Byte-identical to the client's <c>constants/dashboardPresets.ts</c>,
/// and checked so: both sides compare their presets to
/// <c>src/frontend/src/constants/dashboardLayout.reference.json</c> (PR #287,
/// fix round 1, S2).</para>
/// </summary>
public static class DashboardPresets
{
    private const string S = DashboardLayout.Sizes.Small;
    private const string M = DashboardLayout.Sizes.Medium;
    private const string L = DashboardLayout.Sizes.Large;
    private const string W = DashboardLayout.Sizes.Wide;

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

    /// <summary>
    /// Without Statistics since the formulas (SMA-448, lot F1 — R1, V3-01:
    /// « Les statistiques — Non · Non · Oui », « retiré au Jardinier »): a
    /// preset lists the blocks its formula HAS, so the Gardener cannot bring
    /// Statistics back from its gallery, nor save it. Récolte stays, hidden, as
    /// before (Alexandre, 26/09, question 3).
    /// </summary>
    private static readonly IReadOnlyList<DashboardPresetBlock> GardenerPreset =
    [
        new(DashboardLayout.Blocks.Weather, M, false),
        new(DashboardLayout.Blocks.Gardens, L, false),
        new(DashboardLayout.Blocks.Tips, M, false),
        new(DashboardLayout.Blocks.Month, M, false),
        new(DashboardLayout.Blocks.Todo, M, false),
        new(DashboardLayout.Blocks.Counters, M, false),
        new(DashboardLayout.Blocks.Harvest, L, true),
    ];

    /// <summary>
    /// Written by hand since the band (pre-flight D8), where it was derived from
    /// the keys: the band first, in the Full width, then the eight in Large.
    /// </summary>
    private static readonly IReadOnlyList<DashboardPresetBlock> ExpertPreset =
    [
        new(DashboardLayout.Blocks.KeyFigures, W, false),
        new(DashboardLayout.Blocks.Weather, L, false),
        new(DashboardLayout.Blocks.Gardens, L, false),
        new(DashboardLayout.Blocks.Tips, L, false),
        new(DashboardLayout.Blocks.Month, L, false),
        new(DashboardLayout.Blocks.Todo, L, false),
        new(DashboardLayout.Blocks.Counters, L, false),
        new(DashboardLayout.Blocks.Stats, L, false),
        new(DashboardLayout.Blocks.Harvest, L, false),
    ];

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
    /// Whether <paramref name="level"/> has the block <paramref name="key"/> at
    /// all — whether its preset lists it (pre-flight D4). The minimal right of a
    /// level the controller checks: a block it does not permit is refused on
    /// write and dropped on read. An unknown level reads as the default one, as
    /// <see cref="For"/> does. The client's twin is <c>permitsBlock</c>.
    /// </summary>
    public static bool Permits(string? level, string key) =>
        For(level).Any(block => block.Key == key);

    /// <summary>
    /// True when the level is one this server knows. Annotated so the compiler
    /// narrows <paramref name="level"/> to non-null at the call site.
    /// </summary>
    public static bool IsKnownLevel([NotNullWhen(true)] string? level) =>
        level is not null && DashboardLayout.Levels.All.Contains(level);
}
