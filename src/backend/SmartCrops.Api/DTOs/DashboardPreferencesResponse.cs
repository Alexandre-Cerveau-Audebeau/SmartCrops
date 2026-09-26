using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace SmartCrops.Api.DTOs;

/// <summary>
/// SMA-336 — one block of the dashboard layout as the API serves it. Position is
/// the index in <see cref="DashboardPreferencesResponse.Blocks"/>, not a field:
/// there is no number to renumber when a block moves.
/// </summary>
/// <param name="Key">Block identifier (<c>weather</c>, <c>gardens</c>, …).</param>
/// <param name="Size">Footprint: <c>small</c> (1×1), <c>medium</c> (2×1) or <c>large</c> (2×2).</param>
/// <param name="Hidden">True when the block sits in the Customize gallery instead of the grid.</param>
/// <param name="Options">Free-form per-block settings; empty in PR 1/5, filled by later PRs.</param>
public record DashboardBlockDto(
    string Key,
    string Size,
    bool Hidden,
    Dictionary<string, JsonElement>? Options);

/// <summary>
/// SMA-336 — the dashboard layout of the signed-in user.
/// </summary>
/// <param name="SchemaVersion">Shape version of the layout the server understands.</param>
/// <param name="Level">The account's formula — <c>novice</c>, <c>gardener</c> or <c>expert</c> — which decides the level a layout is read at since SMA-448 (lot F1), never the level its document names.</param>
/// <param name="IsPreset">
/// True when this layout is the level preset rather than something the user saved
/// — either they never saved one, or what they saved carries a schema version
/// this server does not know. The client uses it to show the level chip without
/// its « adjusted » suffix.
/// </param>
/// <param name="Blocks">Every block the level has — the eight widgets, and the Key figures band at the Expert level (SMA-437) — in display order, hidden ones included.</param>
/// <param name="UpdatedAt">When the stored layout was last written; null for a preset.</param>
/// <param name="Capabilities">
/// SMA-448, lot F1 — what the account's formula permits (its widgets, their
/// sizes, its preset, its limits, its weather mode, its compact bar), as
/// <c>GET /api/formulas</c> serves it: the client draws from this rather than
/// from a copy of its own, in the same read as the layout it applies it to.
/// </param>
public record DashboardPreferencesResponse(
    int SchemaVersion,
    string Level,
    bool IsPreset,
    List<DashboardBlockDto> Blocks,
    DateTime? UpdatedAt,
    FormulaDto Capabilities);

/// <summary>
/// SMA-336 — one block of a layout being saved.
/// </summary>
public record SaveDashboardBlockRequest(
    [Required][StringLength(40)] string Key,
    [Required][StringLength(10)] string Size,
    bool Hidden,
    Dictionary<string, JsonElement>? Options);

/// <summary>
/// SMA-336 — a full layout save. The document is replaced wholesale rather than
/// patched: the Edit mode commits one arrangement, and a per-block PATCH would
/// multiply round-trips during a drag.
/// </summary>
public record SaveDashboardPreferencesRequest(
    [Required][StringLength(20)] string Level,
    [Required] List<SaveDashboardBlockRequest> Blocks);
