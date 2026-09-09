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
/// <param name="Level">Experience level: <c>novice</c>, <c>gardener</c> or <c>expert</c>.</param>
/// <param name="IsPreset">
/// True when this layout is the level preset rather than something the user saved
/// — either they never saved one, or what they saved carries a schema version
/// this server does not know. The client uses it to show the level chip without
/// its « adjusted » suffix.
/// </param>
/// <param name="Blocks">All eight blocks, in display order, hidden ones included.</param>
/// <param name="UpdatedAt">When the stored layout was last written; null for a preset.</param>
public record DashboardPreferencesResponse(
    int SchemaVersion,
    string Level,
    bool IsPreset,
    List<DashboardBlockDto> Blocks,
    DateTime? UpdatedAt);

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
