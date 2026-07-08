using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.ExternalApis.SearchIndex;
using Typesense;
using Typesense.Setup;

namespace SmartCrops.Api.Tests.ExternalApis.SearchIndex;

/// <summary>
/// Service-level tests for the finder search path, centered on disjunctive
/// faceting (SMA-274). Same transport-stub idiom as
/// <see cref="TypesenseSearchIndexingServiceTests"/>: the REAL
/// <see cref="TypesenseClient"/> runs over a programmable
/// <see cref="HttpMessageHandler"/> that captures the request BODIES, so the
/// assertions pin the actual multi_search wire shape ({"searches":[...]}),
/// not a hand-faked client. The contract under test: no counted-facet
/// selection → the original single search; any selection → ONE multi_search
/// whose searches[0] is the exact main search and searches[1..n] are
/// per-selected-facet per_page=0 sub-searches excluding their own filter
/// fragment, whose counts REPLACE that facet's counts.
/// </summary>
public class TypesensePlantSearchServiceTests
{
    private const string Guid1 = "11111111-1111-1111-1111-111111111111";
    private const string Guid2 = "22222222-2222-2222-2222-222222222222";

    private const string FullFacetBy =
        "plantTypeId,careLevel,wateringNeedLevel,growthRate,lifeCycle,"
        + "isEdible,isToxicToHumans,isToxicToPets,isIndoor,isDroughtTolerant,"
        + "isMedicinal,isSaltTolerant,isThorny,isTropical,isInvasive";

    private static TypesensePlantSearchService ServiceOver(StubTypesenseHttpHandler handler)
    {
        var config = new Config(
            new List<Node> { new("localhost", "8108", "http") },
            "test-typesense-key");
        var client = new TypesenseClient(Options.Create(config), new HttpClient(handler));
        return new TypesensePlantSearchService(
            client, NullLogger<TypesensePlantSearchService>.Instance);
    }

    // Engine responses are built as anonymous objects and serialized — the
    // property names ARE the Typesense wire names (field_name, facet_counts…).
    private static HttpResponseMessage Json(object body) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(
            JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
    };

    private static object Facet(string field, params (string Value, int Count)[] counts)
        => new
        {
            field_name = field,
            counts = counts.Select(c => new { value = c.Value, count = c.Count }).ToArray(),
        };

    private static object SearchResult(int found, string[] hitIds, params object[] facets)
        => new
        {
            found,
            page = 1,
            hits = hitIds.Select(id => new { document = new { id } }).ToArray(),
            facet_counts = facets,
        };

    private static Dictionary<string, int> CountsOf(PlantSearchResult result, string field)
        => result.FacetCounts.Single(f => f.Field == field)
            .Counts.ToDictionary(c => c.Value, c => c.Count);

    /// <summary>filter_by of one entry in the captured multi_search body —
    /// null when the sub-search carries no filter at all.</summary>
    private static string? FilterByOf(JsonElement search)
        => search.TryGetProperty("filter_by", out var filterBy)
            && filterBy.ValueKind is not JsonValueKind.Null
            ? filterBy.GetString()
            : null;

    // ── Roster/registry parity (SMA-274 round 2) ─────────────────────────────

    [Fact]
    public void CountedFacetRoster_StaysInParityWith_PlantFacetFieldsRegistry()
    {
        // Membership single-source invariant: the disjunctive roster derives
        // from PlantFacetFields.CountedFields with predicates looked up by
        // field name. A registry field WITHOUT a predicate already fails
        // fast at type load (KeyNotFoundException — every test in this class
        // would explode); the direction the derivation CANNOT crash on is an
        // ORPHAN predicate for a field removed from the registry. Ordered
        // sequence equality over unique keys pins both directions at once.
        Assert.Equal(
            PlantFacetFields.CountedFields.OrderBy(field => field),
            TypesensePlantSearchService.SelectionPredicates.Keys.OrderBy(field => field));
    }

    // ── No selection: the original single-search path ───────────────────────

    [Fact]
    public async Task Search_NoCountedSelection_UsesTheSingleSearchEndpoint()
    {
        // A RANGE alone is not a counted selection (no counts to protect) —
        // the fast path must serve it unchanged.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(SearchResult(
                42, [Guid1], Facet("careLevel", ("Easy", 30)))),
        };
        var service = ServiceOver(handler);

        var result = await service.SearchAsync(new PlantSearchQuery
        {
            HeightCmMin = 50,
            HeightCmMax = 200,
        });

        var (method, path, _) = Assert.Single(handler.Received);
        Assert.Equal(HttpMethod.Get, method);
        Assert.Equal("/collections/plants/documents/search", path);
        Assert.Equal(42, result.Found);
        Assert.Equal([Guid.Parse(Guid1)], result.Ids);
        Assert.Equal(30, CountsOf(result, "careLevel")["Easy"]);
    }

    // ── Selections: one multi_search, disjunctive sub-searches ──────────────

    [Fact]
    public async Task Search_SingleEnumSelection_SendsMainPlusSelfExcludingSubSearch()
    {
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(new
            {
                results = new[]
                {
                    SearchResult(303, [Guid1, Guid2],
                        Facet("careLevel", ("Easy", 280), ("unknown", 23)),
                        Facet("wateringNeedLevel", ("Average", 185), ("Low", 57))),
                    SearchResult(536, [],
                        Facet("careLevel",
                            ("Easy", 280), ("Medium", 217), ("unknown", 23), ("Difficult", 16))),
                },
            }),
        };
        var service = ServiceOver(handler);

        var result = await service.SearchAsync(new PlantSearchQuery
        {
            CareLevels = ["Easy"],
            Page = 1,
            PerPage = 24,
        });

        // ONE call, to the multi_search endpoint.
        var (method, path, body) = Assert.Single(handler.Received);
        Assert.Equal(HttpMethod.Post, method);
        Assert.Equal("/multi_search", path);

        using var doc = JsonDocument.Parse(body!);
        var searches = doc.RootElement.GetProperty("searches");
        Assert.Equal(2, searches.GetArrayLength());

        // searches[0] — the exact main search.
        var main = searches[0];
        Assert.Equal("plants", main.GetProperty("collection").GetString());
        Assert.Equal("*", main.GetProperty("q").GetString());
        Assert.Equal("careLevel:=[Easy,unknown]", FilterByOf(main));
        Assert.Equal(FullFacetBy, main.GetProperty("facet_by").GetString());
        Assert.Equal(24, main.GetProperty("per_page").GetInt32());
        Assert.Equal(1, main.GetProperty("page").GetInt32());

        // searches[1] — careLevel's sub-search: its own fragment excluded
        // (nothing else selected → NO filter_by at all), counts only.
        var sub = searches[1];
        Assert.Null(FilterByOf(sub));
        Assert.Equal("careLevel", sub.GetProperty("facet_by").GetString());
        Assert.Equal(0, sub.GetProperty("per_page").GetInt32());
        Assert.Equal(20, sub.GetProperty("max_facet_values").GetInt32());

        // Parse: items/found from the main search; careLevel counts REPLACED
        // by the sub-search's full distribution; unselected facets keep the
        // main search's counts.
        Assert.Equal(303, result.Found);
        Assert.Equal([Guid.Parse(Guid1), Guid.Parse(Guid2)], result.Ids);
        Assert.Equal(
            new Dictionary<string, int>
            {
                ["Easy"] = 280,
                ["Medium"] = 217,
                ["unknown"] = 23,
                ["Difficult"] = 16,
            },
            CountsOf(result, "careLevel"));
        Assert.Equal(185, CountsOf(result, "wateringNeedLevel")["Average"]);
    }

    [Fact]
    public async Task Search_TwoSelections_EachSubSearchExcludesOnlyItsOwnFragment()
    {
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(new
            {
                results = new[]
                {
                    SearchResult(18, [Guid1],
                        Facet("plantTypeId", ("1", 18)),
                        Facet("careLevel", ("Easy", 17), ("unknown", 1)),
                        Facet("isMedicinal", ("true", 15), ("false", 2))),
                    SearchResult(303, [],
                        Facet("plantTypeId", ("4", 268), ("1", 18), ("3", 11))),
                    SearchResult(37, [],
                        Facet("careLevel", ("Easy", 18), ("Medium", 15), ("unknown", 2))),
                },
            }),
        };
        var service = ServiceOver(handler);

        var result = await service.SearchAsync(new PlantSearchQuery
        {
            PlantTypeIds = [1],
            CareLevels = ["Easy"],
        });

        var (_, _, body) = Assert.Single(handler.Received);
        using var doc = JsonDocument.Parse(body!);
        var searches = doc.RootElement.GetProperty("searches");
        Assert.Equal(3, searches.GetArrayLength());

        // Main search carries BOTH fragments.
        Assert.Equal(
            "plantTypeId:=[1] && careLevel:=[Easy,unknown]",
            FilterByOf(searches[0]));
        // plantTypeId's sub-search keeps careLevel, drops itself…
        Assert.Equal("careLevel:=[Easy,unknown]", FilterByOf(searches[1]));
        Assert.Equal("plantTypeId", searches[1].GetProperty("facet_by").GetString());
        // …and careLevel's sub-search keeps plantTypeId, drops itself.
        Assert.Equal("plantTypeId:=[1]", FilterByOf(searches[2]));
        Assert.Equal("careLevel", searches[2].GetProperty("facet_by").GetString());

        // Each facet's counts come from ITS sub-search; the unselected
        // boolean keeps the main (fully filtered) counts.
        Assert.Equal(268, CountsOf(result, "plantTypeId")["4"]);
        Assert.Equal(15, CountsOf(result, "careLevel")["Medium"]);
        Assert.Equal(15, CountsOf(result, "isMedicinal")["true"]);
        Assert.Equal(18, result.Found);
    }

    [Fact]
    public async Task Search_BooleanSelection_SubSearchDropsItsFragment()
    {
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(new
            {
                results = new[]
                {
                    SearchResult(383, [Guid1],
                        Facet("isMedicinal", ("true", 360), ("unknown", 23))),
                    SearchResult(536, [],
                        Facet("isMedicinal", ("true", 360), ("false", 153), ("unknown", 23))),
                },
            }),
        };
        var service = ServiceOver(handler);

        var result = await service.SearchAsync(new PlantSearchQuery { IsMedicinal = true });

        var (_, _, body) = Assert.Single(handler.Received);
        using var doc = JsonDocument.Parse(body!);
        var searches = doc.RootElement.GetProperty("searches");
        Assert.Equal(2, searches.GetArrayLength());
        Assert.Equal("isMedicinal:=[true,unknown]", FilterByOf(searches[0]));
        Assert.Null(FilterByOf(searches[1]));
        Assert.Equal("isMedicinal", searches[1].GetProperty("facet_by").GetString());

        // The what-if distribution: false=153 visible although true is selected.
        Assert.Equal(
            new Dictionary<string, int> { ["true"] = 360, ["false"] = 153, ["unknown"] = 23 },
            CountsOf(result, "isMedicinal"));
    }

    [Fact]
    public async Task Search_EmptySubResult_YieldsEmptyCounts_NeverTheCollapsedMainValues()
    {
        // A sub-search whose disjunctive context matches nothing returns no
        // facet_counts entry for its field. The facet's counts must come back
        // EMPTY — falling back to the main search's collapsed values would
        // leak exactly the stale numbers this feature removes.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(new
            {
                results = new[]
                {
                    SearchResult(303, [Guid1],
                        Facet("careLevel", ("Easy", 280), ("unknown", 23)),
                        Facet("wateringNeedLevel", ("Average", 185))),
                    // found 0, hits [], facet_counts [] — no careLevel entry.
                    SearchResult(0, []),
                },
            }),
        };
        var service = ServiceOver(handler);

        var result = await service.SearchAsync(new PlantSearchQuery
        {
            CareLevels = ["Easy"],
        });

        var careLevel = result.FacetCounts.Single(f => f.Field == "careLevel");
        Assert.Empty(careLevel.Counts);
        // The rest of the response is untouched: main items/found, and the
        // unselected facet keeps the main search's counts.
        Assert.Equal(303, result.Found);
        Assert.Equal(185, CountsOf(result, "wateringNeedLevel")["Average"]);
    }

    [Fact]
    public async Task Search_FacetMissingFromMainCounts_IsAddedFromItsSubSearch()
    {
        // Mirror case of the empty-sub-result pin: a fully-filtered MAIN
        // search that matches nothing returns no facet_counts at all, while
        // the self-excluding sub-search still carries the what-if
        // distribution — the selected facet must be ADDED to the response,
        // not silently dropped with the main's (absent) counts.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(new
            {
                results = new[]
                {
                    // found 0, hits [], facet_counts [] — a dead-end context.
                    SearchResult(0, []),
                    SearchResult(536, [],
                        Facet("careLevel", ("Easy", 280), ("Medium", 217))),
                },
            }),
        };
        var service = ServiceOver(handler);

        var result = await service.SearchAsync(new PlantSearchQuery
        {
            CareLevels = ["Easy"],
        });

        Assert.Equal(0, result.Found);
        Assert.Equal(
            new Dictionary<string, int> { ["Easy"] = 280, ["Medium"] = 217 },
            CountsOf(result, "careLevel"));
    }

    [Fact]
    public async Task Search_SelectionWithRangeAndQuery_ContextPropagatesToSubSearches()
    {
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(new
            {
                results = new[]
                {
                    SearchResult(5, [Guid1], Facet("careLevel", ("Easy", 5))),
                    SearchResult(9, [], Facet("careLevel", ("Easy", 5), ("Medium", 4))),
                },
            }),
        };
        var service = ServiceOver(handler);

        await service.SearchAsync(new PlantSearchQuery
        {
            Q = "lavande",
            Language = "fr",
            CareLevels = ["Easy"],
            HeightCmMin = 50,
            HeightCmMax = 200,
        });

        var (_, _, body) = Assert.Single(handler.Received);
        using var doc = JsonDocument.Parse(body!);
        var searches = doc.RootElement.GetProperty("searches");
        var sub = searches[1];

        // Text query and localized query_by ride along on every sub-search…
        Assert.Equal("lavande", sub.GetProperty("q").GetString());
        Assert.Equal(
            "commonNameFr,scientificName,descriptionFr",
            sub.GetProperty("query_by").GetString());
        // …and the RANGE fragment survives the exclusion (only the counted
        // facet's own fragment is dropped).
        var subFilter = FilterByOf(sub);
        Assert.NotNull(subFilter);
        Assert.Contains("maxHeightCm:>=50", subFilter);
        Assert.DoesNotContain("careLevel", subFilter);
        Assert.Equal(0, sub.GetProperty("per_page").GetInt32());
    }

    [Fact]
    public async Task Search_ShortResultsArray_SurfacesAsTypesenseApiException()
    {
        // Defensive branch gets its test: the replacement loop indexes
        // results positionally, so a malformed response with FEWER results
        // than searches (and no inline error to blame) must fail on the 503
        // contract — never as an IndexOutOfRangeException.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(new
            {
                // ONE result for a 2-search request (main + careLevel sub).
                results = new[]
                {
                    SearchResult(303, [Guid1], Facet("careLevel", ("Easy", 280))),
                },
            }),
        };
        var service = ServiceOver(handler);

        var ex = await Assert.ThrowsAsync<TypesenseApiException>(
            () => service.SearchAsync(new PlantSearchQuery { CareLevels = ["Easy"] }));
        Assert.Contains("1 results for 2 searches", ex.Message);
    }

    [Fact]
    public async Task Search_SubSearchError_SurfacesAsTypesenseApiException()
    {
        // multi_search reports per-search failures inline in a 200 body —
        // they must surface on the 503 contract, not as missing counts.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(new
            {
                results = new object[]
                {
                    SearchResult(303, [Guid1], Facet("careLevel", ("Easy", 280))),
                    new { code = 404, error = "Not found." },
                },
            }),
        };
        var service = ServiceOver(handler);

        await Assert.ThrowsAsync<TypesenseApiException>(
            () => service.SearchAsync(new PlantSearchQuery { CareLevels = ["Easy"] }));
    }

    /// <summary>
    /// Transport stub capturing method, path AND body (the multi_search
    /// payload under test). Same idiom as the indexing suite's stub, which
    /// stays private to its own file by design.
    /// </summary>
    private sealed class StubTypesenseHttpHandler : HttpMessageHandler
    {
        public List<(HttpMethod Method, string Path, string? Body)> Received { get; } = [];

        public Func<HttpRequestMessage, HttpResponseMessage>? OnSend { get; init; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null
                ? null
                : await request.Content.ReadAsStringAsync(cancellationToken);
            Received.Add((request.Method, request.RequestUri!.AbsolutePath, body));
            if (OnSend is null)
                throw new InvalidOperationException("No responder configured on StubTypesenseHttpHandler.");
            return OnSend(request);
        }
    }
}
