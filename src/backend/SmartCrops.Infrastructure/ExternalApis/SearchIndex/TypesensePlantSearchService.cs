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
///
/// <para>
/// Disjunctive faceting (SMA-274): selecting inside a facet must not
/// collapse its sibling counts — the mockups' "what-if" numbers (Facile
/// checked, Moyenne keeps 217). Assembly rule: when at least one COUNTED
/// facet (plant type, enums, tri-state booleans) carries a selection, ONE
/// multi_search call is sent — searches[0] is the exact main search
/// (unchanged), plus one per_page=0 sub-search per SELECTED facet with the
/// same q/query_by, a filter_by that excludes THAT facet's own fragment
/// (ranges and the other facets stay in), and facet_by restricted to that
/// facet. The main search feeds items/found/page and the counts of every
/// UNselected facet; each sub-search's counts REPLACE its facet's counts.
/// With no selection the single-search path runs unchanged. The response
/// contract is untouched, and the frontend's ghost-sizing invariant holds
/// (a disjunctive count can never exceed its catalogue count — the
/// sub-search context is the catalogue's narrowed-or-equal).
/// </para>
/// </summary>
public class TypesensePlantSearchService : IPlantSearchService
{
    /// <summary>
    /// Faceted fields returned with every response: the 4 enums, the 10
    /// tri-state booleans and the plant type — derived from the
    /// <see cref="PlantFacetFields"/> registry so this list can't drift from
    /// the builder's emit sites or the collection schema. Numeric fields are
    /// deliberately NOT facet-counted — their UI is slider-driven (T4),
    /// distributions would be wasted payload — and the *Known companions are
    /// an indexing detail.
    /// </summary>
    private static readonly string FacetBy =
        string.Join(",", PlantFacetFields.CountedFields);

    private const int MaxFacetValues = 20;

    // Common name is what people type; scientific name still matters;
    // description matches are a weak signal.
    private const string QueryByWeights = "4,2,1";

    /// <summary>
    /// The counted facets of <see cref="FacetBy"/> paired with "does this
    /// query select inside it" — the disjunctive roster (SMA-274). Ranges are
    /// deliberately absent: they have no counts, so they never get a
    /// sub-search, while their fragments stay in every sub-search's
    /// filter_by.
    /// </summary>
    private static readonly (string Field, Func<PlantSearchQuery, bool> HasSelection)[] CountedFacets =
    [
        (PlantFacetFields.PlantTypeId, q => q.PlantTypeIds is { Length: > 0 }),
        (PlantFacetFields.CareLevel, q => q.CareLevels is { Length: > 0 }),
        (PlantFacetFields.WateringNeedLevel, q => q.WateringNeedLevels is { Length: > 0 }),
        (PlantFacetFields.GrowthRate, q => q.GrowthRates is { Length: > 0 }),
        (PlantFacetFields.LifeCycle, q => q.LifeCycles is { Length: > 0 }),
        (PlantFacetFields.IsEdible, q => q.IsEdible is not null),
        (PlantFacetFields.IsToxicToHumans, q => q.IsToxicToHumans is not null),
        (PlantFacetFields.IsToxicToPets, q => q.IsToxicToPets is not null),
        (PlantFacetFields.IsIndoor, q => q.IsIndoor is not null),
        (PlantFacetFields.IsDroughtTolerant, q => q.IsDroughtTolerant is not null),
        (PlantFacetFields.IsMedicinal, q => q.IsMedicinal is not null),
        (PlantFacetFields.IsSaltTolerant, q => q.IsSaltTolerant is not null),
        (PlantFacetFields.IsThorny, q => q.IsThorny is not null),
        (PlantFacetFields.IsTropical, q => q.IsTropical is not null),
        (PlantFacetFields.IsInvasive, q => q.IsInvasive is not null),
    ];

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
        var text = string.IsNullOrWhiteSpace(query.Q) ? "*" : query.Q;

        var selectedFacets = CountedFacets
            .Where(facet => facet.HasSelection(query))
            .Select(facet => facet.Field)
            .ToList();

        return selectedFacets.Count == 0
            ? await SingleSearchAsync(query, text, queryBy, ct)
            : await DisjunctiveSearchAsync(query, text, queryBy, selectedFacets, ct);
    }

    /// <summary>
    /// The full main-search parameter shape, shared by the single-search path
    /// and searches[0] of the disjunctive path — "searches[0] is the EXACT
    /// main search" is guaranteed structurally by this single source instead
    /// of two hand-synced initializer blocks. No custom SortBy in this
    /// tranche: relevance (_text_match) when Q is present, natural order for
    /// match-all.
    /// </summary>
    private static T ApplyCommon<T>(T parameters, PlantSearchQuery query)
        where T : SearchParameters
    {
        parameters.QueryByWeights = QueryByWeights;
        parameters.FilterBy = PlantSearchFilterBuilder.Build(query);
        parameters.FacetBy = FacetBy;
        parameters.MaxFacetValues = MaxFacetValues;
        parameters.Page = query.Page;
        parameters.PerPage = query.PerPage;
        return parameters;
    }

    /// <summary>No counted facet selected: the original single-search path.</summary>
    private async Task<PlantSearchResult> SingleSearchAsync(
        PlantSearchQuery query, string text, string queryBy, CancellationToken ct)
    {
        var parameters = ApplyCommon(new SearchParameters(text, queryBy), query);

        var result = await _typesense.Search<PlantSearchHitDocument>(
            PlantsSearchCollection.Name, parameters, ct);

        return new PlantSearchResult(
            ExtractIds(result.Hits),
            result.Found,
            query.Page,
            query.PerPage,
            MapFacetCounts(result.FacetCounts));
    }

    /// <summary>
    /// At least one counted facet selected: one multi_search per the assembly
    /// rule documented on the class — main search first, then a per_page=0
    /// sub-search per selected facet excluding its own filter fragment.
    /// </summary>
    private async Task<PlantSearchResult> DisjunctiveSearchAsync(
        PlantSearchQuery query,
        string text,
        string queryBy,
        List<string> selectedFacets,
        CancellationToken ct)
    {
        var searches = new List<MultiSearchParameters>
        {
            // searches[0] — the EXACT main search: routed through the same
            // ApplyCommon as the single-search path, so the equivalence is
            // structural, not a convention between two initializer blocks.
            ApplyCommon(
                new MultiSearchParameters(PlantsSearchCollection.Name, text, queryBy),
                query),
        };
        foreach (var field in selectedFacets)
        {
            searches.Add(new MultiSearchParameters(PlantsSearchCollection.Name, text, queryBy)
            {
                QueryByWeights = QueryByWeights,
                FilterBy = PlantSearchFilterBuilder.Build(query, excludedFacetField: field),
                FacetBy = field,
                MaxFacetValues = MaxFacetValues,
                // Counts only — no hits payload for the sub-searches.
                PerPage = 0,
            });
        }

        var results = await _typesense.MultiSearch<PlantSearchHitDocument>(
            searches, limitMultiSearches: null, ct);

        // multi_search reports per-search failures inline in a 200 body; a
        // failed sub-search must surface as the same 503 contract as a failed
        // single search, never as silently-missing counts.
        foreach (var result in results)
        {
            if (result.ErrorCode is not null)
            {
                throw new TypesenseApiException(
                    $"multi_search sub-search failed ({result.ErrorCode}): {result.ErrorMessage}");
            }
        }

        var main = results[0];
        var facetCounts = MapFacetCounts(main.FacetCounts);

        // Each sub-search REPLACES its facet's counts (the main search's
        // version of that facet is the collapsed one). Unselected facets keep
        // the main search's counts untouched.
        for (var i = 0; i < selectedFacets.Count; i++)
        {
            var field = selectedFacets[i];
            var replacement =
                MapFacetCounts(results[i + 1].FacetCounts)
                    .FirstOrDefault(f => f.Field == field)
                // An empty sub-result (no documents at all in its context)
                // still replaces: stale collapsed counts must not leak.
                ?? new FacetFieldCounts(field, []);

            var index = facetCounts.FindIndex(f => f.Field == field);
            if (index >= 0)
                facetCounts[index] = replacement;
            else
                facetCounts.Add(replacement);
        }

        return new PlantSearchResult(
            ExtractIds(main.Hits),
            main.Found ?? 0,
            query.Page,
            query.PerPage,
            facetCounts);
    }

    private List<Guid> ExtractIds(IReadOnlyCollection<Hit<PlantSearchHitDocument>>? hits)
    {
        var ids = new List<Guid>(hits?.Count ?? 0);
        foreach (var hit in hits ?? [])
        {
            if (Guid.TryParse(hit.Document.Id, out var id))
                ids.Add(id);
            else
                _logger.LogWarning(
                    "Finder: Typesense hit with non-Guid document id '{DocumentId}' skipped", hit.Document.Id);
        }

        return ids;
    }

    private static List<FacetFieldCounts> MapFacetCounts(IEnumerable<FacetCount>? facetCounts)
        => facetCounts?
            .Select(f => new FacetFieldCounts(
                f.FieldName,
                f.Counts.Select(c => new FacetValueCount(c.Value, c.Count)).ToList()))
            .ToList() ?? [];

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
