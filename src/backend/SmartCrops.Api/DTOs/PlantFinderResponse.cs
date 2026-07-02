using SmartCrops.Core.Models;

namespace SmartCrops.Api.DTOs;

/// <summary>
/// Finder page (SMA-255 T3): hydrated list items (Typesense relevance order,
/// same <see cref="PlantListItemResponse"/> contract as the Library list),
/// the total match count, echoed pagination, and the facet distributions of
/// the filtered result set (buckets include the "unknown" sentinel).
/// </summary>
public record PlantFinderResponse(
    List<PlantListItemResponse> Items,
    int Found,
    int Page,
    int PerPage,
    List<FacetFieldCounts> FacetCounts);
