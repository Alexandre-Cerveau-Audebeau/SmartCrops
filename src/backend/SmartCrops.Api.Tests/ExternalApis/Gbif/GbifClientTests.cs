using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using SmartCrops.Infrastructure.ExternalApis.Gbif;

namespace SmartCrops.Api.Tests.ExternalApis.Gbif;

/// <summary>
/// Unit tests for <see cref="GbifClient"/> using a hand-rolled
/// <see cref="HttpMessageHandler"/> stub — avoids the Moq dependency and gives
/// the test explicit control over the captured request URL + the canned response.
/// </summary>
public class GbifClientTests
{
    [Fact]
    public async Task MatchAsync_BuildsUrl_WithVerboseTrueAndEncodedName()
    {
        var handler = new RecordingHandler(StatusCode: HttpStatusCode.OK, JsonBody: "{\"matchType\":\"NONE\"}");
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        await client.MatchAsync("Solanum lycopersicum", CancellationToken.None);

        Assert.NotNull(handler.LastRequestUri);
        // Uri.ToString() returns a display form that re-decodes %20 to ' '. The
        // wire-format check goes through AbsoluteUri which preserves percent-encoding.
        Assert.Equal(
            "https://api.gbif.org/v1/species/match?verbose=true&name=Solanum%20lycopersicum",
            handler.LastRequestUri!.AbsoluteUri);
    }

    [Fact]
    public async Task MatchAsync_ParsesExactMatch()
    {
        const string body = """
            {
              "usageKey": 2930137,
              "acceptedUsageKey": 2930137,
              "speciesKey": 2930137,
              "canonicalName": "Solanum lycopersicum",
              "rank": "SPECIES",
              "matchType": "EXACT",
              "confidence": 99,
              "family": "Solanaceae",
              "genus": "Solanum",
              "species": "Solanum lycopersicum"
            }
            """;
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        var response = await client.MatchAsync("Solanum lycopersicum", CancellationToken.None);

        Assert.NotNull(response);
        Assert.Equal("EXACT", response!.MatchType);
        Assert.Equal(2930137, response.AcceptedUsageKey);
        Assert.Equal(99, response.Confidence);
        Assert.Equal("Solanaceae", response.Family);
        Assert.Equal("Solanum", response.Genus);
        Assert.Equal("Solanum lycopersicum", response.Species);
    }

    [Fact]
    public async Task MatchWithLiteralAsync_ReturnsParsedDto_AndVerbatimBody_PreservingUnboundFields()
    {
        // Body carries fields the DTO does NOT bind (kingdom, status) plus
        // scientificName-with-author — the literal must preserve ALL of it.
        const string body = """
            {"usageKey":2930137,"scientificName":"Solanum lycopersicum L.","canonicalName":"Solanum lycopersicum","status":"ACCEPTED","matchType":"EXACT","confidence":98,"kingdom":"Plantae","family":"Solanaceae","genus":"Solanum","species":"Solanum lycopersicum","speciesKey":2930137}
            """;
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        var fetch = await client.MatchWithLiteralAsync("Solanum lycopersicum", CancellationToken.None);

        // Parsed surface: bound fields incl. the new scientificName.
        Assert.NotNull(fetch.Match);
        Assert.Equal("EXACT", fetch.Match!.MatchType);
        Assert.Equal("Solanum lycopersicum L.", fetch.Match.ScientificName);
        // Verbatim literal: unbound fields (kingdom, status) survive for the audit row.
        Assert.Equal(body, fetch.LiteralJson);
        Assert.Contains("\"kingdom\":\"Plantae\"", fetch.LiteralJson!);
        Assert.Contains("\"status\":\"ACCEPTED\"", fetch.LiteralJson!);
    }

    [Fact]
    public async Task MatchAsync_ReturnsNull_OnTransportFailure()
    {
        // HttpClient surfaces transport problems as HttpRequestException; the
        // wrapper swallows them and returns null so callers can degrade gracefully.
        var handler = new ThrowingHandler(new HttpRequestException("connection refused"));
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        var response = await client.MatchAsync("Anything", CancellationToken.None);

        Assert.Null(response);
    }

    [Fact]
    public async Task MatchAsync_ReturnsNull_OnTimeout()
    {
        // HttpClient.Timeout surfaces as TaskCanceledException whose internal
        // token is the per-request timeout token — caller's token is not signalled.
        var handler = new ThrowingHandler(new TaskCanceledException("request timed out"));
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        var response = await client.MatchAsync("Anything", CancellationToken.None);

        Assert.Null(response);
    }

    [Fact]
    public async Task MatchAsync_PropagatesCancellation()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"matchType\":\"NONE\"}");
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => client.MatchAsync("Anything", cts.Token));
    }

    [Fact]
    public async Task GetVernacularNamesAsync_BuildsUrl_AndParsesResults()
    {
        const string body = """
            {"offset":0,"limit":100,"endOfRecords":true,"results":[
              {"vernacularName":"menthe poivrée","language":"fra","preferred":true,"source":"VASCAN"},
              {"vernacularName":"Peppermint","language":"eng"}
            ]}
            """;
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        var result = await client.GetVernacularNamesAsync(8707933, CancellationToken.None);

        Assert.Equal(
            "https://api.gbif.org/v1/species/8707933/vernacularNames?limit=100&offset=0",
            handler.LastRequestUri!.AbsoluteUri);
        Assert.Equal(2, result.Count);
        Assert.Equal("menthe poivrée", result[0].VernacularName);
        Assert.Equal("fra", result[0].Language);
        Assert.True(result[0].Preferred);
    }

    [Fact]
    public async Task GetVernacularNamesAsync_FollowsPagination_UntilEndOfRecords()
    {
        // Page 0 (endOfRecords:false) → page 1 (endOfRecords:true); results accumulate.
        var handler = new PagingHandler(new[]
        {
            "{\"offset\":0,\"limit\":100,\"endOfRecords\":false,\"results\":[{\"vernacularName\":\"un\",\"language\":\"fra\"}]}",
            "{\"offset\":100,\"limit\":100,\"endOfRecords\":true,\"results\":[{\"vernacularName\":\"deux\",\"language\":\"fra\"}]}",
        });
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        var result = await client.GetVernacularNamesAsync(123, CancellationToken.None);

        Assert.Equal(2, result.Count);
        Assert.Equal(new[] { "un", "deux" }, result.Select(r => r.VernacularName));
        // Two pages requested at offset 0 then 100.
        Assert.Equal(new[] { 0, 100 }, handler.RequestedOffsets);
    }

    [Fact]
    public async Task GetVernacularNamesAsync_ReturnsEmpty_WhenResultsNull()
    {
        // GBIF returns "results": [] in practice, but an explicit "results": null
        // must be treated as an empty page (not throw NRE on .Count).
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"endOfRecords\":true,\"results\":null}");
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        var result = await client.GetVernacularNamesAsync(123, CancellationToken.None);

        Assert.Empty(result);
    }

    [Fact]
    public async Task GetVernacularNamesAsync_ReturnsEmpty_OnTransportFailure()
    {
        var handler = new ThrowingHandler(new HttpRequestException("connection refused"));
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        var result = await client.GetVernacularNamesAsync(123, CancellationToken.None);

        Assert.Empty(result);
    }

    [Fact]
    public async Task GetVernacularNamesAsync_ReturnsEmpty_OnTimeout()
    {
        var handler = new ThrowingHandler(new TaskCanceledException("request timed out"));
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.gbif.org/") };
        var client = new GbifClient(http, NullLogger<GbifClient>.Instance);

        var result = await client.GetVernacularNamesAsync(123, CancellationToken.None);

        Assert.Empty(result);
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _status;
        private readonly string _json;
        public Uri? LastRequestUri { get; private set; }

        public RecordingHandler(HttpStatusCode StatusCode, string JsonBody)
        {
            _status = StatusCode;
            _json = JsonBody;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequestUri = request.RequestUri;
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(new HttpResponseMessage(_status)
            {
                Content = new StringContent(_json, Encoding.UTF8, "application/json"),
            });
        }
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        private readonly Exception _ex;
        public ThrowingHandler(Exception ex) => _ex = ex;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
            => throw _ex;
    }

    /// <summary>Returns canned bodies keyed by the request's <c>offset</c> query value,
    /// recording the offsets requested so the pagination loop can be asserted.</summary>
    private sealed class PagingHandler : HttpMessageHandler
    {
        private readonly string[] _pagesByOffsetIndex;
        public List<int> RequestedOffsets { get; } = [];

        public PagingHandler(string[] pagesByOffsetIndex) => _pagesByOffsetIndex = pagesByOffsetIndex;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var query = request.RequestUri!.Query;
            var offset = 0;
            foreach (var part in query.TrimStart('?').Split('&'))
            {
                var kv = part.Split('=', 2);
                if (kv.Length == 2 && kv[0] == "offset")
                {
                    offset = int.Parse(kv[1]);
                }
            }
            RequestedOffsets.Add(offset);
            var index = offset / 100;
            var body = _pagesByOffsetIndex[index];
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            });
        }
    }
}
