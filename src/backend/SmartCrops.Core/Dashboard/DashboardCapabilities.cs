namespace SmartCrops.Core.Dashboard;

/// <summary>
/// SMA-437 lot 1, PR A, step A5 (pre-flight D3, D4) — the sizes a block may
/// take, per level. The controller refuses a size outside this table on write
/// and brings it back to the preset's on read — a right checked on the
/// server, never only in the interface (R8). Since SMA-448 (lot F1) it is also
/// what the client DRAWS by: <see cref="FormulaCatalog"/> serves it, and the
/// client keeps no twin of it any more.
///
/// <para>The rule it carries (A-N11): the Full width is an Expert capability,
/// and a block gets it only once its Full-width version is DRAWN — until then
/// a crafted request could show its Large stretched over the page's width. So
/// the table follows what is drawn, not only what is permitted. The Key
/// figures band arrived with it as its one size (PR B, step B1 — pre-flight
/// D3: « keyfigures@Expert = [wide] ; tout le reste = [P, M, G] »); Météo
/// followed with SMA-448, lot F4 (V3-02: every city at once), as its fourth
/// size; Jardins with SMA-448, lot F5-b (V3-03: the seven-column table), as
/// its fourth size too; Statistiques, Compteurs and Ce mois-ci with SMA-437,
/// lot V3-08 (A-14, decided by Alexandre on 28/09: one line per garden, four
/// columns from 1 200 px, the grid alone), as their fourth size. Conseils and
/// À faire never take it (A-N11), Récolte not yet.</para>
///
/// <para>Which level HAS a block is not this table's to say but its preset's
/// (<see cref="DashboardPresets.Permits"/>, D4): the band's rows at the Novice
/// and Gardener levels are the default three sizes and are never read — the
/// controller refuses the band there on write and drops it on read before any
/// size is looked up.</para>
///
/// <para>Checked against ONE file,
/// <c>src/frontend/src/constants/dashboardLayout.reference.json</c> (PR #287,
/// fix round 1, S2), the contract of the served catalogue: a row changed here
/// and not in the file fails a suite. Adding <c>wide</c> to a row is a change
/// in two places — here and in the file.</para>
/// </summary>
public static class DashboardCapabilities
{
    /// <summary>Small, Medium, Large — in the order the corner handle steps through them.</summary>
    private static readonly IReadOnlyList<string> ThreeSizes =
        [DashboardLayout.Sizes.Small, DashboardLayout.Sizes.Medium, DashboardLayout.Sizes.Large];

    /// <summary>The Full width alone — the Key figures band's one size (A-N11, C28).</summary>
    private static readonly IReadOnlyList<string> WideOnly = [DashboardLayout.Sizes.Wide];

    /// <summary>
    /// The three sizes, then the Full width — the Expert's cycle P → M → G →
    /// PL → P (A-N11) for a block whose Full-width version is drawn.
    /// </summary>
    private static readonly IReadOnlyList<string> ThreeSizesAndWide =
        [DashboardLayout.Sizes.Small, DashboardLayout.Sizes.Medium, DashboardLayout.Sizes.Large, DashboardLayout.Sizes.Wide];

    /// <summary>
    /// The Expert's row, block by block: the one level the Full width is ever
    /// offered to. A row here, not a rule, so the day a block is drawn in Full
    /// width is a one-line change that a review sees.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> ExpertSizes =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            // SMA-448, lot F4 (V3-02): the Expert's Weather is drawn in Full
            // width — every city at once, one column per city.
            [DashboardLayout.Blocks.Weather] = ThreeSizesAndWide,
            // SMA-448, lot F5-b (V3-03, V3-04; pre-flight F5 § C.4): the
            // Expert's Gardens is drawn in Full width — the seven-column table.
            [DashboardLayout.Blocks.Gardens] = ThreeSizesAndWide,
            [DashboardLayout.Blocks.Tips] = ThreeSizes,
            // SMA-437, lot V3-08 (A-14): the grid alone — the names' column
            // at 200 px and the months in full from 1 200 px.
            [DashboardLayout.Blocks.Month] = ThreeSizesAndWide,
            [DashboardLayout.Blocks.Todo] = ThreeSizes,
            // SMA-437, lot V3-08 (A-14): the Large's lines in four columns
            // from 1 200 px, three from 900.
            [DashboardLayout.Blocks.Counters] = ThreeSizesAndWide,
            // SMA-437, lot V3-08 (A-14): one line per garden — occupancy and
            // exposure side by side.
            [DashboardLayout.Blocks.Stats] = ThreeSizesAndWide,
            [DashboardLayout.Blocks.Harvest] = ThreeSizes,
            [DashboardLayout.Blocks.KeyFigures] = WideOnly,
        };

    /// <summary>
    /// The sizes <paramref name="key"/> may take at <paramref name="level"/>,
    /// in the order the corner handle steps through them. The Gardener never
    /// gets the Full width (A-N11); the Novice keeps the three sizes of today's
    /// grid; a block this server does not know takes none.
    /// </summary>
    public static IReadOnlyList<string> SizesFor(string key, string? level)
    {
        if (!DashboardLayout.Blocks.All.Contains(key)) return [];
        return level == DashboardLayout.Levels.Expert ? ExpertSizes[key] : ThreeSizes;
    }
}
