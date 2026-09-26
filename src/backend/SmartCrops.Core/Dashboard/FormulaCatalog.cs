namespace SmartCrops.Core.Dashboard;

/// <summary>A garden's size, in grid cells.</summary>
/// <param name="Width">Columns.</param>
/// <param name="Height">Rows.</param>
public sealed record GardenSize(int Width, int Height);

/// <summary>
/// What an account's garden weighs against a formula: its identity and its
/// plan's size, both null until the garden has a plan.
/// </summary>
public sealed record GardenDimensions(Guid Id, int? Width, int? Height);

/// <summary>
/// One reason a formula is too small for an account's gardens. Two kinds:
/// <see cref="FormulaCatalog.ShortfallKinds.Gardens"/> (<see cref="Have"/>
/// gardens, the formula allows <see cref="Limit"/>) and
/// <see cref="FormulaCatalog.ShortfallKinds.Size"/> (garden
/// <see cref="GardenId"/> measures <see cref="Width"/> × <see cref="Height"/>
/// cells, the formula allows <see cref="MaxWidth"/> × <see cref="MaxHeight"/>).
/// The fields of the other kind are null.
/// </summary>
public sealed record FormulaShortfall(
    string Kind,
    int? Have = null,
    int? Limit = null,
    Guid? GardenId = null,
    int? Width = null,
    int? Height = null,
    int? MaxWidth = null,
    int? MaxHeight = null);

/// <summary>
/// One formula and the capabilities it grants — SMA-448, lot F1, step S2.
/// The widgets, their sizes and the preset are not repeated here: they are the
/// ones the controller already refuses by (<see cref="DashboardPresets"/>,
/// <see cref="DashboardCapabilities"/>), read through this record, so what is
/// SERVED is what is ENFORCED (pre-flight § C.2 a).
/// </summary>
/// <param name="Key">The formula: <c>novice</c>, <c>gardener</c> or <c>expert</c>.</param>
/// <param name="GardenLimit">How many gardens the formula allows; null for no limit.</param>
/// <param name="MaxGardenSize">The largest garden the formula allows, in cells.</param>
/// <param name="Weather">How the formula shows the weather (<see cref="FormulaCatalog.WeatherModes"/>).</param>
/// <param name="CompactBar">Whether the page draws the compact action bar (A-9).</param>
public sealed record FormulaDefinition(
    string Key,
    int? GardenLimit,
    GardenSize MaxGardenSize,
    string Weather,
    bool CompactBar)
{
    /// <summary>The formula's default layout — and the list of the widgets it has.</summary>
    public IReadOnlyList<DashboardPresetBlock> Preset => DashboardPresets.For(Key);

    /// <summary>The widgets the formula has: its preset's blocks, in the preset's order.</summary>
    public IReadOnlyList<string> Widgets => [.. Preset.Select(block => block.Key)];

    /// <summary>The sizes a widget of this formula may take, in the order the corner handle steps through them.</summary>
    public IReadOnlyList<string> SizesFor(string key) => DashboardCapabilities.SizesFor(key, Key);
}

/// <summary>
/// SMA-448, lot F1, step S2 — the three formulas, the ONE source of what each
/// permits. <c>GET /api/formulas</c> serves this catalogue; the dashboard
/// preferences refuse by it; the formula switch checks an account's gardens
/// against it. Its twin on the client is gone: the client reads what the API
/// serves (pre-flight § C.2 a, decided by Alexandre on 26/09), and
/// <c>src/frontend/src/constants/dashboardLayout.reference.json</c> is the
/// contract the served catalogue is tested against.
///
/// <para>The limits are Alexandre's: Novice 3 gardens up to 20 × 20 cells,
/// Gardener 10 up to 50 × 50 (22/09 16:39 and 18:02), Expert no limit on the
/// number and up to 100 × 100 cells — the size the layout endpoint accepts
/// (26/09, question 2: « Jusqu'à 100 × 100 cases par jardin »). They are
/// served now and APPLIED to the creation and the resizing of a garden in lot
/// F3, the lot that also shows them (V3: a limit shown is a limit applied, the
/// same day).</para>
/// </summary>
public static class FormulaCatalog
{
    /// <summary>How a formula shows the weather (V3-02, decided 22/09 18:52 and its complement).</summary>
    public static class WeatherModes
    {
        /// <summary>No widget: the weather of each garden's own city, on its card (the Novice page, lot F2).</summary>
        public const string GardenCards = "gardenCards";

        /// <summary>The Weather widget for one city, fixed.</summary>
        public const string SingleCity = "singleCity";

        /// <summary>Every city: one at a time up to Large, all together in the Full width.</summary>
        public const string AllCities = "allCities";
    }

    /// <summary>The kinds of <see cref="FormulaShortfall"/>.</summary>
    public static class ShortfallKinds
    {
        /// <summary>More gardens than the formula allows.</summary>
        public const string Gardens = "gardens";

        /// <summary>A garden larger than the formula allows.</summary>
        public const string Size = "size";
    }

    public static readonly FormulaDefinition Novice = new(
        DashboardLayout.Levels.Novice, 3, new GardenSize(20, 20), WeatherModes.GardenCards, CompactBar: false);

    public static readonly FormulaDefinition Gardener = new(
        DashboardLayout.Levels.Gardener, 10, new GardenSize(50, 50), WeatherModes.SingleCity, CompactBar: true);

    public static readonly FormulaDefinition Expert = new(
        DashboardLayout.Levels.Expert, null, new GardenSize(100, 100), WeatherModes.AllCities, CompactBar: true);

    /// <summary>The three formulas, in the order of <see cref="DashboardLayout.Levels.All"/>.</summary>
    public static readonly IReadOnlyList<FormulaDefinition> All = [Novice, Gardener, Expert];

    /// <summary>
    /// The formula of a key. An unknown key reads as the default level, as
    /// <see cref="DashboardPresets.For"/> does: a stored value must never be
    /// able to make a read fail.
    /// </summary>
    public static FormulaDefinition For(string? key) => key switch
    {
        DashboardLayout.Levels.Novice => Novice,
        DashboardLayout.Levels.Expert => Expert,
        _ => Gardener,
    };

    /// <summary>
    /// Why <paramref name="formula"/> is too small for these gardens — empty
    /// when it holds them all. More gardens than its limit is one reason; each
    /// garden wider or taller than its largest size is one more, naming the
    /// garden. A garden without a plan has no size to weigh. The formula an
    /// account is ALREADY on stays its own whatever this says (« Votre formule
    /// — conservée », Alexandre 22/09 18:02): the caller decides that.
    /// </summary>
    public static IReadOnlyList<FormulaShortfall> ShortfallsFor(
        FormulaDefinition formula,
        IReadOnlyCollection<GardenDimensions> gardens)
    {
        var shortfalls = new List<FormulaShortfall>();

        if (formula.GardenLimit is { } limit && gardens.Count > limit)
        {
            shortfalls.Add(new FormulaShortfall(ShortfallKinds.Gardens, Have: gardens.Count, Limit: limit));
        }

        foreach (var garden in gardens)
        {
            if (garden.Width is not { } width || garden.Height is not { } height) continue;
            if (width <= formula.MaxGardenSize.Width && height <= formula.MaxGardenSize.Height) continue;

            shortfalls.Add(new FormulaShortfall(
                ShortfallKinds.Size,
                GardenId: garden.Id,
                Width: width,
                Height: height,
                MaxWidth: formula.MaxGardenSize.Width,
                MaxHeight: formula.MaxGardenSize.Height));
        }

        return shortfalls;
    }
}
