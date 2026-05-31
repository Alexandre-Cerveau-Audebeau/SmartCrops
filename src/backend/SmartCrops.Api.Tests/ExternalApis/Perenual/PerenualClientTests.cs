using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Polly.Timeout;
using SmartCrops.Infrastructure.ExternalApis.Perenual;

namespace SmartCrops.Api.Tests.ExternalApis.Perenual;

/// <summary>
/// Unit tests for <see cref="PerenualClient"/> using a hand-rolled
/// <see cref="HttpMessageHandler"/> stub — mirrors the pattern from
/// <c>TrefleClientTests</c> and avoids the Moq dependency. Verifies URL
/// composition (key + name percent-encoding), JSON parsing, and the four
/// defensive catches: HttpRequestException, JsonException, NotSupportedException,
/// and HttpClient.Timeout (TaskCanceledException without caller token).
/// </summary>
public class PerenualClientTests
{
    private const string TestKey = "secret-key";

    private static PerenualClient NewClient(HttpMessageHandler handler)
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://perenual.com/api/v2/") };
        var options = Options.Create(new PerenualOptions { ApiKey = TestKey });
        return new PerenualClient(http, options, NullLogger<PerenualClient>.Instance);
    }

    [Fact]
    public async Task SearchAsync_BuildsUrl_WithKeyAndEncodedQuery()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"data\":[]}");
        var client = NewClient(handler);

        await client.SearchAsync("Solanum lycopersicum", CancellationToken.None);

        Assert.Equal(
            $"https://perenual.com/api/v2/species-list?key={TestKey}&q=Solanum%20lycopersicum",
            handler.LastRequestUri!.AbsoluteUri);
    }

    [Fact]
    public async Task SearchAsync_ParsesData()
    {
        const string body = """
            {
              "data": [
                { "id": 728, "scientific_name": ["Aloe vera"], "common_name": "aloe vera" }
              ]
            }
            """;
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var response = await client.SearchAsync("Aloe vera", CancellationToken.None);

        Assert.NotNull(response);
        Assert.Single(response!.Data!);
        Assert.Equal(728, response.Data![0].Id);
        Assert.Equal("Aloe vera", response.Data[0].ScientificName!.Single());
    }

    [Fact]
    public async Task GetSpeciesDetailsAsync_BuildsUrl_WithIdAndKey()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"id\":728,\"scientific_name\":[\"Aloe vera\"]}");
        var client = NewClient(handler);

        await client.GetSpeciesDetailsAsync(728, CancellationToken.None);

        Assert.Equal(
            $"https://perenual.com/api/v2/species/details/728?key={TestKey}",
            handler.LastRequestUri!.AbsoluteUri);
    }

    [Fact]
    public async Task GetSpeciesDetailsAsync_ParsesData()
    {
        const string body = """
            {
              "id": 728,
              "scientific_name": ["Aloe vera"],
              "common_name": "aloe vera",
              "indoor": true
            }
            """;
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var response = await client.GetSpeciesDetailsAsync(728, CancellationToken.None);

        Assert.NotNull(response);
        Assert.Equal(728, response!.Id);
        Assert.True(response.Indoor);
    }

    // ── Defensive catches ─────────────────────────────────────────────────

    [Fact]
    public async Task SearchAsync_ReturnsNull_OnTransportFailure()
    {
        var handler = new ThrowingHandler(new HttpRequestException("dns failure"));
        var client = NewClient(handler);

        Assert.Null(await client.SearchAsync("Anything", CancellationToken.None));
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)] // Perenual rate-limit signal
    public async Task SearchAsync_ReturnsNull_OnHttpError(HttpStatusCode status)
    {
        var handler = new RecordingHandler(status, "{}");
        var client = NewClient(handler);

        Assert.Null(await client.SearchAsync("Anything", CancellationToken.None));
    }

    [Fact]
    public async Task SearchAsync_ReturnsNull_OnMalformedJson()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{ invalid json }");
        var client = NewClient(handler);

        Assert.Null(await client.SearchAsync("Anything", CancellationToken.None));
    }

    [Fact]
    public async Task SearchAsync_ReturnsNull_OnUnsupportedContentType()
    {
        // GetFromJsonAsync throws NotSupportedException when Content-Type is
        // not a JSON media type — observed when Perenual returns an HTML error
        // page from its CDN under load.
        var handler = new HtmlHandler("<html>error</html>");
        var client = NewClient(handler);

        Assert.Null(await client.SearchAsync("Anything", CancellationToken.None));
    }

    [Fact]
    public async Task SearchAsync_ReturnsNull_OnTimeout()
    {
        var handler = new ThrowingHandler(new TaskCanceledException("request timed out"));
        var client = NewClient(handler);

        Assert.Null(await client.SearchAsync("Anything", CancellationToken.None));
    }

    [Fact]
    public async Task SearchAsync_ReturnsNull_OnPollyTimeoutRejected()
    {
        // Phase 4 smoke discovery: when the standard resilience handler
        // exhausts its TotalRequestTimeout, Polly throws TimeoutRejectedException
        // (NOT OperationCanceledException). Without this catch the exception
        // surfaces as HTTP 500 to the controller. Regression test for the
        // round-1 fix added during live smoke.
        var handler = new ThrowingHandler(new TimeoutRejectedException("polly total timeout"));
        var client = NewClient(handler);

        Assert.Null(await client.SearchAsync("Anything", CancellationToken.None));
    }

    [Fact]
    public async Task GetSpeciesDetailsAsync_ReturnsNull_OnPollyTimeoutRejected()
    {
        var handler = new ThrowingHandler(new TimeoutRejectedException("polly total timeout"));
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesDetailsAsync(728, CancellationToken.None));
    }

    [Fact]
    public async Task SearchAsync_PropagatesCallerCancellation()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"data\":[]}");
        var client = NewClient(handler);

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => client.SearchAsync("Anything", cts.Token));
    }

    [Fact]
    public async Task GetSpeciesDetailsAsync_ReturnsNull_OnTransportFailure()
    {
        // Symmetry with SearchAsync_ReturnsNull_OnTransportFailure (CR
        // round 1 nitpick): ensure GetSpeciesDetailsAsync also degrades
        // gracefully on HttpRequestException so future refactors that
        // diverge the two methods do not silently lose the defensive contract.
        var handler = new ThrowingHandler(new HttpRequestException("server fault"));
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesDetailsAsync(728, CancellationToken.None));
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    public async Task GetSpeciesDetailsAsync_ReturnsNull_OnHttpError(HttpStatusCode status)
    {
        var handler = new RecordingHandler(status, "{}");
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesDetailsAsync(99999, CancellationToken.None));
    }

    [Fact]
    public async Task GetSpeciesDetailsAsync_ReturnsNull_OnMalformedJson()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{ invalid json }");
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesDetailsAsync(728, CancellationToken.None));
    }

    [Fact]
    public async Task GetSpeciesDetailsAsync_ReturnsNull_OnUnsupportedContentType()
    {
        var handler = new HtmlHandler("<html>error</html>");
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesDetailsAsync(728, CancellationToken.None));
    }

    [Fact]
    public async Task GetSpeciesDetailsAsync_ReturnsNull_OnTimeout()
    {
        var handler = new ThrowingHandler(new TaskCanceledException("request timed out"));
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesDetailsAsync(728, CancellationToken.None));
    }

    [Fact]
    public async Task GetSpeciesDetailsAsync_PropagatesCallerCancellation()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"id\":1,\"scientific_name\":[\"x\"]}");
        var client = NewClient(handler);

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => client.GetSpeciesDetailsAsync(728, cts.Token));
    }

    [Fact]
    public async Task GetSpeciesDetailsAsync_HtmlContentTypeOn200_TreatedAsNoMatch()
    {
        // D5 (Sprint 1.5 PR B): Perenual's bug at ids >=8574 returns 200 OK with
        // an HTML error body for deleted ids. The Content-Type pre-check must
        // short-circuit to null (NoMatch) rather than attempt JSON deserialise.
        var handler = new HtmlHandler("<html><body>Species not found</body></html>");
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesDetailsAsync(8600, CancellationToken.None));
    }

    // ── SMA-71 literal capture + key redaction ────────────────────────────

    [Fact]
    public async Task GetSpeciesDetailsWithLiteralAsync_CapturesLiteral_WithKeyRedacted()
    {
        // The body echoes the caller's key inside care_guides — the literal must
        // be captured but the key must NEVER survive to LiteralResponseJson.
        const string body =
            "{\"id\":728,\"scientific_name\":[\"Aloe vera\"],\"indoor\":true," +
            "\"care_guides\":\"http://perenual.com/api/species-care-guide-list?species_id=728&key=" + TestKey + "\"}";
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var fetch = await client.GetSpeciesDetailsWithLiteralAsync(728, CancellationToken.None);

        Assert.NotNull(fetch.Species);
        Assert.Equal(728, fetch.Species!.Id);
        Assert.NotNull(fetch.LiteralJson);
        Assert.DoesNotContain(TestKey, fetch.LiteralJson!);
        Assert.Contains("key=REDACTED", fetch.LiteralJson!);
    }

    [Fact]
    public async Task GetSpeciesDetailsWithLiteralAsync_OnHtmlBody_ReturnsNullSpeciesAndLiteral()
    {
        // A deleted-id HTML body (200 + text/html) must never be captured as the
        // literal — both halves of the tuple stay null.
        var handler = new HtmlHandler("<html>Species not found</html>");
        var client = NewClient(handler);

        var fetch = await client.GetSpeciesDetailsWithLiteralAsync(8600, CancellationToken.None);

        Assert.Null(fetch.Species);
        Assert.Null(fetch.LiteralJson);
    }

    [Fact]
    public async Task GetCareGuideLiteralAsync_BuildsV1Url_AndRedactsKey()
    {
        // The care-guide endpoint lives at /api/ (NOT /api/v2/) — verify the URL
        // is built one level above the base, and the key is redacted in the body.
        const string body =
            "{\"data\":[{\"id\":1,\"species_id\":728,\"section\":[]}]," +
            "\"self\":\"http://perenual.com/api/species-care-guide-list?species_id=728&key=" + TestKey + "\"}";
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var literal = await client.GetCareGuideLiteralAsync(728, CancellationToken.None);

        Assert.Equal(
            $"https://perenual.com/api/species-care-guide-list?key={TestKey}&species_id=728",
            handler.LastRequestUri!.AbsoluteUri);
        Assert.NotNull(literal);
        Assert.DoesNotContain(TestKey, literal!);
        Assert.Contains("REDACTED", literal!);
    }

    [Fact]
    public async Task GetCareGuideLiteralAsync_OnHtmlBody_ReturnsNull()
    {
        var handler = new HtmlHandler("<html>error</html>");
        var client = NewClient(handler);

        Assert.Null(await client.GetCareGuideLiteralAsync(728, CancellationToken.None));
    }

    // ── GetSpeciesListAsync (SMA-13 catalog enumeration) ──────────────────

    [Fact]
    public async Task GetSpeciesListAsync_BuildsUrl_WithKeyAndPage()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"data\":[],\"current_page\":42,\"per_page\":30,\"last_page\":337,\"total\":10102}");
        var client = NewClient(handler);

        await client.GetSpeciesListAsync(42, CancellationToken.None);

        Assert.Equal(
            $"https://perenual.com/api/v2/species-list?key={TestKey}&page=42",
            handler.LastRequestUri!.AbsoluteUri);
    }

    [Fact]
    public async Task GetSpeciesListAsync_ParsesPaginationMeta()
    {
        // Pin the catalog-fetcher contract: current_page/per_page/last_page/total
        // round-trip from the JSON envelope so the script can detect the tail.
        const string body = """
            {
              "data": [],
              "current_page": 1,
              "per_page": 30,
              "last_page": 337,
              "total": 10102,
              "from": 1,
              "to": 30
            }
            """;
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var response = await client.GetSpeciesListAsync(1, CancellationToken.None);

        Assert.NotNull(response);
        Assert.Equal(1, response!.CurrentPage);
        Assert.Equal(30, response.PerPage);
        Assert.Equal(337, response.LastPage);
        Assert.Equal(10102, response.Total);
        Assert.Equal(1, response.From);
        Assert.Equal(30, response.To);
    }

    [Fact]
    public async Task GetSpeciesListAsync_ParsesStrategyAFilterFields()
    {
        // Pin the Strategy A field bindings: cultivar / variety / hybrid /
        // subspecies must round-trip per entry so the SMA-13 catalog fetcher
        // can drop cultivar/hybrid/etc. entries client-side.
        const string body = """
            {
              "data": [
                {
                  "id": 1,
                  "scientific_name": ["Abies alba"],
                  "common_name": "European Silver Fir",
                  "other_name": ["Silver Fir"],
                  "family": "Pinaceae",
                  "cultivar": null,
                  "variety": null,
                  "hybrid": null,
                  "subspecies": null
                },
                {
                  "id": 2,
                  "scientific_name": ["Abies alba 'Pyramidalis'"],
                  "common_name": "Pyramidalis Silver Fir",
                  "family": "Pinaceae",
                  "cultivar": "Pyramidalis",
                  "variety": null,
                  "hybrid": null,
                  "subspecies": null
                }
              ],
              "current_page": 1,
              "last_page": 337
            }
            """;
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var response = await client.GetSpeciesListAsync(1, CancellationToken.None);

        Assert.NotNull(response);
        Assert.Equal(2, response!.Data!.Count);

        var keeper = response.Data[0];
        Assert.Null(keeper.Cultivar);
        Assert.Null(keeper.Variety);
        Assert.Null(keeper.Hybrid);
        Assert.Null(keeper.Subspecies);
        Assert.Equal("Pinaceae", keeper.Family);
        Assert.Equal(new[] { "Silver Fir" }, keeper.OtherName);

        var rejected = response.Data[1];
        Assert.Equal("Pyramidalis", rejected.Cultivar);
    }

    [Fact]
    public async Task GetSpeciesListAsync_ReturnsNull_OnTransportFailure()
    {
        var handler = new ThrowingHandler(new HttpRequestException("dns failure"));
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesListAsync(1, CancellationToken.None));
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    public async Task GetSpeciesListAsync_ReturnsNull_OnHttpError(HttpStatusCode status)
    {
        var handler = new RecordingHandler(status, "{}");
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesListAsync(1, CancellationToken.None));
    }

    [Fact]
    public async Task GetSpeciesListAsync_ReturnsNull_OnHtmlContentType()
    {
        // Symmetric to GetSpeciesDetailsAsync (PR #76 Content-Type guard).
        // The off-by-one ≥8574 bug was only observed on /species/details/{id}
        // in production, but applying the same guard here is cheap and
        // prevents a CDN-error HTML page from crashing the catalog fetcher.
        var handler = new HtmlHandler("<html>error</html>");
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesListAsync(1, CancellationToken.None));
    }

    [Fact]
    public async Task GetSpeciesListAsync_ReturnsNull_OnMalformedJson()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{ invalid json }");
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesListAsync(1, CancellationToken.None));
    }

    [Fact]
    public async Task GetSpeciesListAsync_ReturnsNull_OnPollyTimeoutRejected()
    {
        var handler = new ThrowingHandler(new TimeoutRejectedException("polly total timeout"));
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesListAsync(1, CancellationToken.None));
    }

    [Fact]
    public async Task GetSpeciesListAsync_ReturnsNull_OnTimeout()
    {
        // Parity with SearchAsync_ReturnsNull_OnTimeout and
        // GetSpeciesDetailsAsync_ReturnsNull_OnTimeout — host-side HttpClient
        // timeout surfaces as TaskCanceledException without caller-token
        // cancellation, must degrade gracefully to null. CR PR #92 R1 N1.
        var handler = new ThrowingHandler(new TaskCanceledException("request timed out"));
        var client = NewClient(handler);

        Assert.Null(await client.GetSpeciesListAsync(1, CancellationToken.None));
    }

    [Fact]
    public async Task GetSpeciesListAsync_PropagatesCallerCancellation()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"data\":[]}");
        var client = NewClient(handler);

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => client.GetSpeciesListAsync(1, cts.Token));
    }

    // ── SMA-71 PR2: pest-disease-list (catalogue) ─────────────────────────

    [Fact]
    public async Task GetPestDiseaseListAsync_BuildsV1Url_AndParsesPaginationAndItems()
    {
        const string body = """
            {
              "data": [
                { "id": 1, "common_name": "Fairy ring", "scientific_name": "Agrocybe", "host": ["all lawn grasses"] },
                { "id": 2, "common_name": "Aphids", "scientific_name": "Aphidoidea" }
              ],
              "current_page": 1, "per_page": 30, "last_page": 9, "total": 256
            }
            """;
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var page = await client.GetPestDiseaseListAsync(1, CancellationToken.None);

        // /api/ v1-level URL (one level above the /api/v2/ base), like the care guide.
        Assert.Equal(
            $"https://perenual.com/api/pest-disease-list?key={TestKey}&page=1",
            handler.LastRequestUri!.AbsoluteUri);
        Assert.NotNull(page);
        Assert.Equal(9, page!.LastPage);
        Assert.Equal(2, page.Items.Count);
        Assert.Equal(1, page.Items[0].PerenualPestId);
        Assert.Equal("Fairy ring", page.Items[0].CommonName);
        Assert.Equal("Agrocybe", page.Items[0].ScientificName);
        // The per-item literal is the verbatim entry object (preserves host[]).
        Assert.Contains("all lawn grasses", page.Items[0].LiteralJson);
    }

    [Fact]
    public async Task GetPestDiseaseListAsync_RedactsKeyInPerItemLiteral()
    {
        // A (hypothetical) key inside an item URL must be scrubbed from the literal.
        const string body =
            "{\"data\":[{\"id\":5,\"common_name\":\"X\",\"scientific_name\":\"Y\"," +
            "\"u\":\"http://h?key=" + TestKey + "\"}],\"last_page\":1}";
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var page = await client.GetPestDiseaseListAsync(1, CancellationToken.None);

        Assert.NotNull(page);
        Assert.Single(page!.Items);
        Assert.DoesNotContain(TestKey, page.Items[0].LiteralJson);
        Assert.Contains("key=REDACTED", page.Items[0].LiteralJson);
    }

    [Fact]
    public async Task GetPestDiseaseListAsync_ReturnsNull_OnHtmlContentType()
    {
        var handler = new HtmlHandler("<html>error</html>");
        var client = NewClient(handler);
        Assert.Null(await client.GetPestDiseaseListAsync(1, CancellationToken.None));
    }

    [Fact]
    public async Task GetPestDiseaseListAsync_ReturnsNull_OnTransportFailure()
    {
        var handler = new ThrowingHandler(new HttpRequestException("dns failure"));
        var client = NewClient(handler);
        Assert.Null(await client.GetPestDiseaseListAsync(1, CancellationToken.None));
    }

    // ── Handlers ──────────────────────────────────────────────────────────

    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _status;
        private readonly string _json;
        public Uri? LastRequestUri { get; private set; }

        public RecordingHandler(HttpStatusCode status, string json)
        {
            _status = status;
            _json = json;
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

    private sealed class HtmlHandler : HttpMessageHandler
    {
        private readonly string _content;

        public HtmlHandler(string content) => _content = content;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_content, Encoding.UTF8, "text/html"),
            });
        }
    }
}
