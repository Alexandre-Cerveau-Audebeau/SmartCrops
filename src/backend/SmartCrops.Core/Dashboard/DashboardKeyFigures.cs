namespace SmartCrops.Core.Dashboard;

/// <summary>
/// SMA-437 lot 1, PR B, step B2 (pre-flight D9, D10) — the figures the Key
/// figures band may show. Always FOUR, chosen and ordered by the user from the
/// gear (contract § 4.5, A-N23), stored on the band's block as
/// <c>options: { figures: [...] }</c>.
///
/// <para>The server does not compute them — the 22 are derived in the browser
/// from the two aggregates it already sends (pre-flight C.5) — it only refuses
/// a selection that is not four DISTINCT keys of <see cref="All"/>: strict on
/// write. On read the stored document passes as it is, and the client falls
/// back to <see cref="Defaults"/> on anything it cannot read.</para>
///
/// <para>The twin of the client's <c>keyFiguresOptions.ts</c>, pinned literally
/// on both sides and compared to
/// <c>src/frontend/src/constants/dashboardLayout.reference.json</c> by both
/// suites (the S2 rule of PR #287).</para>
/// </summary>
public static class DashboardKeyFigures
{
    /// <summary>The number of figures the band shows — never three, never five.</summary>
    public const int Shown = 4;

    /// <summary>
    /// The 22 figures of V3-04, in its catalogue's order (<c>K_ORDER</c>) and
    /// with its keys, for traceability with the artboard: « Vos jardins », « La
    /// place », « Ce mois-ci », « Aujourd'hui », « À compléter ».
    /// </summary>
    public static readonly IReadOnlyList<string> All =
    [
        "gardens", "plants", "varieties", "edible", "ornam",
        "surface", "active", "planted", "occupancy", "free", "freeSun", "sunShare",
        "prune", "sow", "harvest", "flower",
        "todo", "tips",
        "noplan", "noorient", "located", "cities",
    ];

    /// <summary>
    /// The four of 23/09 (contract § 4.5, point 3 [A]): cases libres,
    /// occupation, variétés distinctes, à faire aujourd'hui — none repeats the
    /// header's own line.
    /// </summary>
    public static readonly IReadOnlyList<string> Defaults = ["free", "occupancy", "varieties", "todo"];

    /// <summary>Whether <paramref name="figures"/> is exactly four distinct keys of <see cref="All"/> (ordinal).</summary>
    public static bool IsValidSelection(IReadOnlyList<string> figures) =>
        figures.Count == Shown
        && figures.All(figure => All.Contains(figure, StringComparer.Ordinal))
        && figures.Distinct(StringComparer.Ordinal).Count() == Shown;
}
