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
