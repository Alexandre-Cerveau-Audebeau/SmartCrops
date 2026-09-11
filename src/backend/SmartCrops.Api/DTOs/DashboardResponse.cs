namespace SmartCrops.Api.DTOs;

/// <summary>
/// SMA-336 PR 2/5 — one garden of the dashboard aggregate: its plan, verbatim,
/// plus the counters SQL can produce on its own.
///
/// <para>The server TRANSPORTS, the browser CALCULATES (orchestrator decision
/// D9). <see cref="CellsJson"/> and <see cref="Placements"/> travel as they are
/// stored, and the client derives active cells, surface, occupancy, dominant
/// exposure and the plan thumbnail from them with the pure functions the planner
/// already owns (<c>parseCellsJson</c>, <c>infrastructureBlockers</c>,
/// <c>computeExposureView</c>, <c>cellSizeToMeters</c>). Nothing here parses
/// <see cref="CellsJson"/>: to this server it is an opaque string, exactly as it
/// is to <see cref="Controllers.GardensController"/>.</para>
///
/// <para>What it deliberately does NOT carry: the <see cref="PlantListItemResponse"/>
/// graph the gardens list serves per garden. Those 42 fields — free-text
/// <c>Description</c> included — are the bulk of that response and no widget of
/// this lot reads them.</para>
/// </summary>
/// <param name="Id">Garden identifier; also the key of the per-garden filter chips.</param>
/// <param name="Name">Garden name, as the user typed it.</param>
/// <param name="Description">
/// The garden's own description (≤ 500 chars), as the user typed it. Carried
/// because the widget OWNS the rename dialog and <c>PUT /api/gardens/{id}</c>
/// replaces name and description together: without it here, every rename would
/// silently erase the description. Not to be confused with the plant catalog's
/// free text, which this response deliberately never carries.
/// </param>
/// <param name="Width">Grid width in cells; null on a garden whose layout was never saved.</param>
/// <param name="Height">Grid height in cells; null likewise.</param>
/// <param name="CellSize">Cell edge as a stored token (« 50cm »), for <c>cellSizeToMeters</c>.</param>
/// <param name="CellsJson">
/// The sparse cell document, verbatim. Null when the garden has no painted cell —
/// the client then reads a full grid of active cells, which is what
/// <c>parseCellsJson(null, …)</c> already returns.
/// </param>
/// <param name="Config">Orientation, type, hemisphere, latitude band and indoor light slots — the exposure engine's inputs.</param>
/// <param name="UpdatedAt">Last write to the garden, for the « modified 2 h ago » line.</param>
/// <param name="Placements">
/// Every placement of the garden, in a STABLE order (see
/// <see cref="Controllers.DashboardController"/>): row, then column, then plant.
/// </param>
/// <param name="PlacementCount">Number of placements — the « 50 » of the PLANTS column.</param>
/// <param name="VarietyCount">Number of distinct plants — the « 12 var. » sub-line.</param>
/// <param name="OccupiedCells">Sum of <c>SpanRows × SpanCols</c>: cells the plants take.</param>
/// <param name="IsEdible">
/// True when at least one placed variety is edible by the R4 rule (plant type in
/// {Vegetable, Fruit, Herb} OR <c>IsEdible</c>), false when the garden holds
/// placements and none is, null when the garden is EMPTY — an unplanted garden is
/// neither ornamental nor edible, and calling it ornamental would apply the
/// « never shows a harvest » product rule to a garden nobody has planted yet.
/// </param>
public record DashboardGardenDto(
    Guid Id,
    string Name,
    string? Description,
    int? Width,
    int? Height,
    string? CellSize,
    string? CellsJson,
    GardenConfigDto Config,
    DateTime UpdatedAt,
    IReadOnlyList<PlacementResponse> Placements,
    int PlacementCount,
    int VarietyCount,
    int OccupiedCells,
    bool? IsEdible);

/// <summary>
/// SMA-336 PR 2/5 — one row of the « Counts by variety » widget: a plant, and how
/// many times it is placed across every garden of the caller.
///
/// <para>Computed by SQL alone (<c>GROUP BY PlantId</c>), because none of it
/// depends on <c>CellsJson</c>. It is the lean counterpart of
/// <see cref="PlantListItemResponse"/>: same identity and the two flags the
/// ornamental split needs, without the free text, the dimensions, the pH or the
/// eleven booleans no counter reads.</para>
/// </summary>
/// <param name="PlantId">Catalog identifier — also the hash key of the variety pastille.</param>
/// <param name="ScientificName">Botanical name; the display fallback when no translation exists.</param>
/// <param name="CommonName">Localised name for the requested language, English otherwise, null when neither exists.</param>
/// <param name="PlantType">Catalog type name (<c>Vegetable</c>, <c>Herb</c>, <c>Ornamental</c>, …).</param>
/// <param name="IsEdible">The plant's own edible flag; pairs with <paramref name="PlantType"/> in the R4 rule.</param>
/// <param name="ImageUrl">
/// A STABLE-source image (Trefle/PlantNet), chosen by the same cover-type priority
/// the library uses, or null when the plant has none. Perenual images are excluded:
/// their signed URLs expire (SMA-118).
/// </param>
/// <param name="ImageAttribution">
/// Attribution for <paramref name="ImageUrl"/>; null exactly when it is. The two
/// travel together everywhere else in this API and they do here too — the widget
/// can show the photo, so it must be able to credit it.
/// </param>
/// <param name="Count">Number of placements of this variety across the caller's gardens.</param>
/// <param name="Cells">Sum of <c>SpanRows × SpanCols</c> over those placements.</param>
/// <param name="GardenIds">Which gardens hold it — the per-garden filter of the widget.</param>
public record VarietyCountDto(
    Guid PlantId,
    string ScientificName,
    string? CommonName,
    string? PlantType,
    bool? IsEdible,
    string? ImageUrl,
    string? ImageAttribution,
    int Count,
    int Cells,
    IReadOnlyList<Guid> GardenIds);

/// <summary>
/// SMA-336 PR 2/5 — the page-level counters, so the header chips do not have to
/// re-derive them from the arrays.
/// </summary>
/// <param name="GardenCount">Gardens the caller owns.</param>
/// <param name="PlacementCount">Placements across all of them.</param>
/// <param name="VarietyCount">
/// DISTINCT varieties across all gardens (decision D11) — NOT the sum of the
/// per-garden counts. A variety planted in two gardens is one variety; summing
/// <see cref="DashboardGardenDto.VarietyCount"/> would count it twice.
/// </param>
/// <param name="CatalogPlantCount">Size of the plant catalog, for « … of 536 in the catalog ».</param>
public record DashboardTotalsDto(
    int GardenCount,
    int PlacementCount,
    int VarietyCount,
    int CatalogPlantCount);

/// <summary>
/// SMA-336 PR 2/5 — <c>GET /api/dashboard</c>: everything the Gardens, Counters
/// and Statistics widgets need, in ONE call.
///
/// <para>It replaces seven round-trips (a list, then a garden and a layout per
/// garden) and weighs less than the list alone: 10 277 bytes against the 27 597
/// <c>GET /api/gardens</c> already ships for the same two gardens, because it
/// carries plans instead of plant catalog rows.</para>
/// </summary>
/// <param name="Gardens">The caller's gardens, newest first, each with its plan.</param>
/// <param name="Varieties">Counts by variety across all of them, busiest first.</param>
/// <param name="Totals">Page-level counters.</param>
public record DashboardResponse(
    IReadOnlyList<DashboardGardenDto> Gardens,
    IReadOnlyList<VarietyCountDto> Varieties,
    DashboardTotalsDto Totals);
