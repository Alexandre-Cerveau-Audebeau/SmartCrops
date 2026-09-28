namespace SmartCrops.Core.Dashboard;

/// <summary>
/// SMA-448, lot F5-a — the settings of the Gardens widget (V3-04; decided by
/// Alexandre on 28/09 — contract v3 A-N3, A-N4, A-N5): how many gardens the
/// widget shows and in which order, stored on the widget's block as
/// <c>options: { count, sort }</c>. The COUNT is one of <see cref="Counts"/>
/// or <see cref="CountAll"/>; the SORT is one of <see cref="Sorts.All"/>, and
/// which of them a formula offers is the formula's to say
/// (<see cref="FormulaDefinition.GardenSorts"/>): three for the Gardener, five
/// for the Expert — the custom order is the Expert's alone, and it has a write
/// surface of its own (<c>PUT /api/gardens/order</c>), so the right is checked
/// on the server, never only in the interface (R8).
///
/// <para>The server refuses what is not of the list or not of the formula on
/// WRITE, and on READ brings a stored value the formula lacks back to the
/// default — the key dropped, never an error. The twin of the client's
/// <c>gardensOptions.ts</c>, pinned literally on both sides and compared to
/// <c>src/frontend/src/constants/dashboardLayout.reference.json</c> by both
/// suites (the S2 rule of PR #287).</para>
/// </summary>
public static class DashboardGardensSettings
{
    /// <summary>The sorts of the Gardens widget, by key — the vocabulary the wire is parsed with.</summary>
    public static class Sorts
    {
        /// <summary>The most recently OPENED first — the default; a garden never opened ranks by its last modification.</summary>
        public const string LastOpened = "lastOpened";

        /// <summary>A to Z, blind to case and accents.</summary>
        public const string Name = "name";

        /// <summary>The most recently CREATED first.</summary>
        public const string Created = "created";

        /// <summary>The most recently MODIFIED first.</summary>
        public const string Updated = "updated";

        /// <summary>The order the user set by hand (<c>Gardens.SortOrder</c>) — the Expert's alone.</summary>
        public const string Custom = "custom";

        /// <summary>Every sort, in the order the gear panel lists them.</summary>
        public static readonly IReadOnlyList<string> All = [LastOpened, Name, Created, Updated, Custom];
    }

    /// <summary>The default sort of every formula that has the widget (decision of 23/09, contract v3 § 4.7 d).</summary>
    public const string DefaultSort = Sorts.LastOpened;

    /// <summary>The numbers of gardens the widget may show — 5 · 8 · 10 — beside « Tous ».</summary>
    public static readonly IReadOnlyList<int> Counts = [5, 8, 10];

    /// <summary>« Tous »: every garden, no cap.</summary>
    public const string CountAll = "all";

    /// <summary>Whether <paramref name="count"/> is one of <see cref="Counts"/>.</summary>
    public static bool IsCount(int count) => Counts.Contains(count);

    /// <summary>Whether <paramref name="sort"/> is one of <see cref="Sorts.All"/> (ordinal).</summary>
    public static bool IsKnownSort(string? sort) => sort is not null && Sorts.All.Contains(sort, StringComparer.Ordinal);
}
