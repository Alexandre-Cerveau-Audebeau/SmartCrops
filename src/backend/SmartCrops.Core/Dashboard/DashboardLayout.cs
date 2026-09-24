namespace SmartCrops.Core.Dashboard;

/// <summary>
/// SMA-336 — the vocabulary of the gardens dashboard layout, shared by the
/// controller, its validation and the presets. Centralised so the whitelist the
/// API validates against and the presets it falls back to can never drift apart.
/// The client's twin (<c>types/Dashboard.ts</c>) and this class are both
/// checked against <c>src/frontend/src/constants/dashboardLayout.reference.json</c>
/// (PR #287, fix round 1, S2), so they cannot drift apart either.
/// </summary>
public static class DashboardLayout
{
    /// <summary>
    /// Shape version of the stored layout document. A row persisted under a
    /// different version is ignored in favour of the level preset — never an
    /// error. Bump this when the document shape changes incompatibly.
    /// </summary>
    public const int CurrentSchemaVersion = 1;

    /// <summary>Level applied when a user has never saved a layout.</summary>
    public const string DefaultLevel = Levels.Gardener;

    /// <summary>The three experience levels. Keys are stable; the labels are i18n.</summary>
    public static class Levels
    {
        public const string Novice = "novice";
        public const string Gardener = "gardener";
        public const string Expert = "expert";

        public static readonly IReadOnlyList<string> All = [Novice, Gardener, Expert];
    }

    /// <summary>
    /// The four block footprints: 1×1, 2×1 and 2×2 grid cells, and the Full
    /// width — « Pleine largeur », 4×1 as tall as its content (SMA-437, V8).
    /// A KNOWN size is not a PERMITTED one: which block may take which size at
    /// which level is <see cref="DashboardCapabilities.SizesFor"/>.
    /// </summary>
    public static class Sizes
    {
        public const string Small = "small";
        public const string Medium = "medium";
        public const string Large = "large";
        public const string Wide = "wide";

        public static readonly IReadOnlyList<string> All = [Small, Medium, Large, Wide];
    }

    /// <summary>
    /// The nine dashboard blocks, in their canonical order — the eight of the
    /// frozen design (<c>data-widget</c> in the artboards), then the Key figures
    /// band of the v3 (SMA-437 lot 1, PR B, step B1 — pre-flight D1), the
    /// Expert's alone: which level has which block is its preset's to say
    /// (<see cref="DashboardPresets.Permits"/>, D4). A layout document may omit
    /// blocks; the reader fills the gaps from the preset, each at its PRESET'S
    /// place (arbitrage 3 of the lot 1 pre-flight), so the band heads an Expert
    /// page saved before it existed.
    /// </summary>
    public static class Blocks
    {
        public const string Weather = "weather";
        public const string Gardens = "gardens";
        public const string Tips = "tips";
        public const string Month = "month";
        public const string Todo = "todo";
        public const string Counters = "counters";
        public const string Stats = "stats";
        public const string Harvest = "harvest";
        public const string KeyFigures = "keyfigures";

        public static readonly IReadOnlyList<string> All =
            [Weather, Gardens, Tips, Month, Todo, Counters, Stats, Harvest, KeyFigures];

        /// <summary>
        /// The length of <see cref="All"/>, as a constant (pre-flight D18): the
        /// request-body ceiling of <c>DashboardController</c> derives from it,
        /// and <c>[RequestSizeLimit]</c> takes a constant only. Pinned equal to
        /// <c>All.Count</c> by <c>DashboardPresetsTests</c>.
        /// </summary>
        public const int Count = 9;
    }

    /// <summary>
    /// The block the user may reorder and resize but never hide: without the
    /// gardens list the page has no subject. Enforced server-side so a crafted
    /// PUT cannot hide it either.
    /// </summary>
    public const string NonHidableBlock = Blocks.Gardens;
}
