using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;
using Typesense;

namespace SmartCrops.Infrastructure.ExternalApis.SearchIndex;

/// <summary>
/// Typesense implementation of the public finder read path (SMA-255 T3).
/// Localized query_by (fr searches French common names/descriptions, both
/// languages always fall back on the scientific name), weights favoring
/// common name &gt; scientific name &gt; description, filter_by from
/// <see cref="PlantSearchFilterBuilder"/> (absence never excludes), facet
/// counts for the enum/boolean/type facets. Returns ids only — hydration
/// happens against Postgres in the API layer.
/// </summary>
public class TypesensePlantSearchService : IPlantSearchService
{
    /// <summary>
    /// Faceted fields returned with every response: the 4 enums, the 10
    /// tri-state booleans and the plant type. Numeric fields are deliberately
    /// NOT facet-counted — their UI is slider-driven (T4), distributions would
    /// be wasted payload — and the *Known companions are an indexing detail.
    /// </summary>
    private const string FacetBy =
        "plantTypeId,careLevel,wateringNeedLevel,growthRate,lifeCycle,"
        + "isEdible,isToxicToHumans,isToxicToPets,isIndoor,isDroughtTolerant,"
        + "isMedicinal,isSaltTolerant,isThorny,isTropical,isInvasive";

    private const int MaxFacetValues = 20;

    private readonly ITypesenseClient _typesense;
    private readonly ILogger<TypesensePlantSearchService> _logger;

    public TypesensePlantSearchService(
        ITypesenseClient typesense,
        ILogger<TypesensePlantSearchService> logger)
    {
        _typesense = typesense;
        _logger = logger;
    }

    public async Task<PlantSearchResult> SearchAsync(PlantSearchQuery query, CancellationToken ct = default)
    {
        // fr searches the French text fields; anything else defaults to en
        // (the controller has already 400-ed languages outside en/fr).
        var queryBy = query.Language == "fr"
            ? "commonNameFr,scientificName,descriptionFr"
            : "commonNameEn,scientificName,descriptionEn";

        var parameters = new SearchParameters(
            string.IsNullOrWhiteSpace(query.Q) ? "*" : query.Q, queryBy)
        {
            // Common name is what people type; scientific name still matters;
            // description matches are a weak signal.
            QueryByWeights = "4,2,1",
            FilterBy = PlantSearchFilterBuilder.Build(query),
            FacetBy = FacetBy,
            MaxFacetValues = MaxFacetValues,
            Page = query.Page,
            PerPage = query.PerPage,
            // No custom SortBy in this tranche: relevance (_text_match) when Q
            // is present, natural order for match-all.
        };

        var result = await _typesense.Search<PlantSearchHitDocument>(
            PlantsSearchCollection.Name, parameters, ct);

        var ids = new List<Guid>(result.Hits.Count);
        foreach (var hit in result.Hits)
        {
            if (Guid.TryParse(hit.Document.Id, out var id))
                ids.Add(id);
            else
                _logger.LogWarning(
                    "Finder: Typesense hit with non-Guid document id '{DocumentId}' skipped", hit.Document.Id);
        }

        var facetCounts = result.FacetCounts?
            .Select(f => new FacetFieldCounts(
                f.FieldName,
                f.Counts.Select(c => new FacetValueCount(c.Value, c.Count)).ToList()))
            .ToList() ?? [];

        return new PlantSearchResult(ids, result.Found, query.Page, query.PerPage, facetCounts);
    }

    /// <summary>
    /// Minimal hit projection — the finder only needs the document id; the
    /// full list item is hydrated from Postgres.
    /// </summary>
    private sealed record PlantSearchHitDocument
    {
        [JsonPropertyName("id")]
        public required string Id { get; init; }
    }
}
