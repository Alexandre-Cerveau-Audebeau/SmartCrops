namespace SmartCrops.Core.Models;

/// <summary>
/// Engine-side result of a finder search (SMA-255 T3): the matching plant ids
/// in relevance order (the API layer hydrates them from Postgres), the total
/// match count, the echoed pagination, and the facet distributions of the
/// FILTERED result set (values include the "unknown" sentinel bucket).
/// </summary>
public record PlantSearchResult(
    List<Guid> Ids,
    int Found,
    int Page,
    int PerPage,
    List<FacetFieldCounts> FacetCounts);

/// <summary>One faceted field's value distribution.</summary>
public record FacetFieldCounts(string Field, List<FacetValueCount> Counts);

/// <summary>One facet bucket (e.g. Value="Easy", Count=280).</summary>
public record FacetValueCount(string Value, int Count);
