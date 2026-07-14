namespace SmartCrops.Api.DTOs;

/// <summary>
/// Projection for <c>GET /api/gardens</c> (SMA-6 / SMA-155). Replaces the previous
/// raw-<c>Garden</c>-entity response, which leaked <c>UserId</c>/<c>CellsJson</c>
/// and serialised every <c>Plant</c> scalar while carrying NO localized common
/// name (its query never included <c>Translations</c>, so the cards always
/// degraded to <c>ScientificName</c>).
///
/// <para><see cref="Plants"/> holds the garden's DISTINCT placed plants — sourced
/// from <c>GardenPlacements</c>, the sole source of truth for a garden's plants
/// post SMA-6 Option A — projected through the same
/// <see cref="PlantListItemResponse"/> shape the Library endpoints expose, so the
/// client-side name resolver is shared verbatim across surfaces. The card counter
/// is <c>Plants.Count</c> (distinct plants actually placed), never the deprecated
/// <c>GardenPlants</c> link-table rows.</para>
/// </summary>
public record GardenListItemResponse(
    Guid Id,
    string Name,
    string? Description,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    List<PlantListItemResponse> Plants);
