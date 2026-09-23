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
    /// The eight dashboard blocks, in their canonical order — the same order and
    /// the same keys the frozen design uses (<c>data-widget</c> in the artboards).
    /// A layout document may omit blocks; the reader fills the gaps from the
    /// preset and appends them in this order.
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

        public static readonly IReadOnlyList<string> All =
            [Weather, Gardens, Tips, Month, Todo, Counters, Stats, Harvest];
    }

    /// <summary>
    /// The block the user may reorder and resize but never hide: without the
    /// gardens list the page has no subject. Enforced server-side so a crafted
    /// PUT cannot hide it either.
    /// </summary>
    public const string NonHidableBlock = Blocks.Gardens;
}
