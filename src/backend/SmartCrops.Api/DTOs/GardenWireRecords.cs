namespace SmartCrops.Api.DTOs;

/// <summary>
/// The wire records SHARED by <c>GET /api/gardens/{id}/layout</c> and
/// <c>GET /api/dashboard</c>.
///
/// <para>Round 1, E5: they were declared in <c>GardensController.cs</c>, so
/// <see cref="DashboardResponse"/> — which lives here, in the contract layer —
/// had to <c>using SmartCrops.Api.Controllers</c> to reach them. The dependency
/// ran the wrong way: a contract that names its own controller cannot be reused
/// by a second one without dragging the first along, and a third consumer would
/// have repeated the import. Two endpoints already share these three records.</para>
///
/// <para>The move is name-preserving and namespace-only. No serialized shape
/// changes, and both controllers already import <c>SmartCrops.Api.DTOs</c>.</para>
/// </summary>
/// <param name="Orientation">Free-form orientation string, stored as-is.</param>
/// <param name="GardenType">Free-form garden type, stored as-is.</param>
/// <param name="LightSchedule">Indoor light slots, or null.</param>
/// <param name="Hemisphere">'N' / 'S', or null for the engine default.</param>
/// <param name="LatitudeBand">'low' / 'mid' / 'high', or null for the engine default.</param>
/// <remarks>
/// Exposure config block (SMA-285 / SMA-17): values are stored as-is, all
/// nullable — the app-level defaults (hemisphere null -> 'N', latitudeBand
/// null -> 'mid') belong to the READ-time exposure engine (5.3-C).
/// </remarks>
public record GardenConfigDto(
    string? Orientation,
    string? GardenType,
    List<LightSlotDto>? LightSchedule,
    string? Hemisphere,
    string? LatitudeBand);

/// <summary>One indoor light slot, zero-padded 24h <c>HH:mm</c> on both ends.</summary>
public record LightSlotDto(string? Start, string? End);

/// <summary>
/// One placed plant on a garden plan.
///
/// <para>PlantName was removed from the placement wire (SMA-285): the front
/// rebuilds every display name from its locale-keyed catalog via the shared
/// resolver (getPlantDisplayName, SMA-194) and never read the server field.</para>
/// </summary>
public record PlacementResponse(
    Guid Id,
    Guid PlantId,
    string? PlantScientificName,
    int StartRow,
    int StartCol,
    int SpanRows,
    int SpanCols,
    string? Notes);
