using System.Text.Json.Serialization;
using SmartCrops.Core.Dashboard;

namespace SmartCrops.Api.DTOs;

/// <summary>SMA-448 — a garden size, in cells.</summary>
public record GardenSizeDto(int Width, int Height);

/// <summary>
/// SMA-448, lot F1 — one formula and what it grants, as the API serves it: the
/// capabilities the client draws from instead of a copy of its own (pre-flight
/// § C.2 a). Built by <see cref="FormulaDtos.From"/>, from the same tables the
/// server refuses by.
/// </summary>
/// <param name="Key">The formula: <c>novice</c>, <c>gardener</c> or <c>expert</c>.</param>
/// <param name="GardenLimit">How many gardens it allows; null for no limit.</param>
/// <param name="MaxGardenSize">The largest garden it allows, in cells.</param>
/// <param name="Widgets">The widgets it has, in its preset's order.</param>
/// <param name="Sizes">For each of its widgets, the sizes that widget may take, in the order the corner handle steps through them.</param>
/// <param name="Preset">Its default layout, block by block — no options.</param>
/// <param name="Weather">How it shows the weather: <c>gardenCards</c>, <c>singleCity</c> or <c>allCities</c>.</param>
/// <param name="CompactBar">Whether the page draws the compact action bar.</param>
public record FormulaDto(
    string Key,
    int? GardenLimit,
    GardenSizeDto MaxGardenSize,
    List<string> Widgets,
    Dictionary<string, List<string>> Sizes,
    List<DashboardBlockDto> Preset,
    string Weather,
    bool CompactBar);

/// <summary>
/// SMA-448 — one reason a formula is too small for the caller's gardens: kind
/// <c>gardens</c> (<see cref="Have"/> and <see cref="Limit"/>) or kind
/// <c>size</c> (the garden, its size and the formula's largest). The fields of
/// the other kind are not written.
/// </summary>
public record FormulaReasonDto(
    string Kind,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Have,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Limit,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Guid? GardenId,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Width,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Height,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? MaxWidth,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? MaxHeight);

/// <summary>
/// SMA-448 — whether the caller may choose a formula. The formula it is
/// already on is always available, even beyond its limits (« Votre formule —
/// conservée »); its reasons are still listed, for the screen to say.
/// </summary>
public record FormulaAvailabilityDto(
    string Formula,
    bool Current,
    bool Available,
    List<FormulaReasonDto> Reasons);

/// <summary>SMA-448 — the caller's own state against the catalogue.</summary>
/// <param name="Formula">The account's formula.</param>
/// <param name="Chosen">Whether the account has ever CHOSEN it — false until its first deliberate choice.</param>
/// <param name="ChosenAt">When, UTC; null until then.</param>
/// <param name="GardenCount">How many gardens the account has.</param>
/// <param name="LargestGardenSize">The widest width and the tallest height among its gardens with a plan — possibly two gardens; null when none has a plan.</param>
/// <param name="Availability">Each formula, in the catalogue's order.</param>
public record FormulaAccountDto(
    string Formula,
    bool Chosen,
    DateTime? ChosenAt,
    int GardenCount,
    GardenSizeDto? LargestGardenSize,
    List<FormulaAvailabilityDto> Availability);

/// <summary>SMA-448 — <c>GET /api/formulas</c>: the catalogue, and the caller against it.</summary>
public record FormulasResponse(List<FormulaDto> Formulas, FormulaAccountDto Account);

/// <summary>SMA-448 — the ONE projection of the catalogue onto the wire.</summary>
public static class FormulaDtos
{
    /// <summary>A formula as served: its capabilities, read from the tables the server refuses by.</summary>
    public static FormulaDto From(FormulaDefinition formula) => new(
        formula.Key,
        formula.GardenLimit,
        new GardenSizeDto(formula.MaxGardenSize.Width, formula.MaxGardenSize.Height),
        [.. formula.Widgets],
        formula.Widgets.ToDictionary(key => key, key => formula.SizesFor(key).ToList(), StringComparer.Ordinal),
        [.. formula.Preset.Select(block => new DashboardBlockDto(block.Key, block.Size, block.Hidden, null))],
        formula.Weather,
        formula.CompactBar);

    /// <summary>A shortfall as served.</summary>
    public static FormulaReasonDto From(FormulaShortfall shortfall) => new(
        shortfall.Kind,
        shortfall.Have,
        shortfall.Limit,
        shortfall.GardenId,
        shortfall.Width,
        shortfall.Height,
        shortfall.MaxWidth,
        shortfall.MaxHeight);
}
