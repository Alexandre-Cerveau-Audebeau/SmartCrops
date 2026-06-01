using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SmartCrops.Infrastructure.ExternalApis.Trefle;

namespace SmartCrops.Api.Tests.ExternalApis.Trefle;

/// <summary>
/// Unit tests for <see cref="TrefleClient"/> using a hand-rolled
/// <see cref="HttpMessageHandler"/> stub — mirrors the pattern from
/// <c>GbifClientTests</c> and avoids the Moq dependency. Verifies URL
/// composition (including token + name percent-encoding), JSON parsing,
/// transport-failure → null contract, timeout → null contract, and that
/// caller cancellation propagates.
/// </summary>
public class TrefleClientTests
{
    private const string TestToken = "secret-token";

    private static TrefleClient NewClient(HttpMessageHandler handler)
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://trefle.io/api/v1/") };
        var options = Options.Create(new TrefleOptions { Token = TestToken });
        return new TrefleClient(http, options, NullLogger<TrefleClient>.Instance);
    }

    [Fact]
    public async Task SearchAsync_BuildsUrl_WithTokenAndEncodedQuery()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"data\":[]}");
        var client = NewClient(handler);

        await client.SearchAsync("Solanum lycopersicum", CancellationToken.None);

        Assert.NotNull(handler.LastRequestUri);
        Assert.Equal(
            $"https://trefle.io/api/v1/species/search?token={TestToken}&q=Solanum%20lycopersicum",
            handler.LastRequestUri!.AbsoluteUri);
    }

    [Fact]
    public async Task SearchAsync_ParsesData()
    {
        const string body = """
            {
              "data": [
                { "id": 12345, "scientific_name": "Solanum lycopersicum", "slug": "solanum-lycopersicum" }
              ]
            }
            """;
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var response = await client.SearchAsync("Solanum lycopersicum", CancellationToken.None);

        Assert.NotNull(response);
        Assert.Single(response!.Data!);
        Assert.Equal(12345, response.Data![0].Id);
        Assert.Equal("Solanum lycopersicum", response.Data[0].ScientificName);
    }

    [Fact]
    public async Task SearchAsync_ReturnsNull_OnTransportFailure()
    {
        var handler = new ThrowingHandler(new HttpRequestException("dns failure"));
        var client = NewClient(handler);

        var response = await client.SearchAsync("Anything", CancellationToken.None);

        Assert.Null(response);
    }

    [Fact]
    public async Task SearchAsync_ReturnsNull_OnTimeout()
    {
        // HttpClient.Timeout surfaces as TaskCanceledException whose internal
        // token is the per-request timeout — caller's token is not signalled,
        // so the catch-when clause swallows it as a transport-style failure.
        var handler = new ThrowingHandler(new TaskCanceledException("request timed out"));
        var client = NewClient(handler);

        var response = await client.SearchAsync("Anything", CancellationToken.None);

        Assert.Null(response);
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
    public async Task GetSpeciesAsync_BuildsUrl_WithIdAndToken()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"data\":{\"id\":12345}}");
        var client = NewClient(handler);

        await client.GetSpeciesAsync(12345, CancellationToken.None);

        Assert.Equal(
            $"https://trefle.io/api/v1/species/12345?token={TestToken}",
            handler.LastRequestUri!.AbsoluteUri);
    }

    [Fact]
    public async Task GetSpeciesAsync_ParsesData()
    {
        const string body = """
            {
              "data": {
                "id": 12345,
                "scientific_name": "Solanum lycopersicum",
                "slug": "solanum-lycopersicum",
                "edible": true,
                "vegetable": true
              }
            }
            """;
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var response = await client.GetSpeciesAsync(12345, CancellationToken.None);

        Assert.NotNull(response);
        Assert.NotNull(response!.Data);
        Assert.Equal(12345, response.Data!.Id);
        Assert.Equal("Solanum lycopersicum", response.Data.ScientificName);
        Assert.True(response.Data.Edible);
        Assert.True(response.Data.Vegetable);
    }

    [Fact]
    public async Task GetSpeciesWithLiteralAsync_ReturnsParsedAndVerbatimBody_WithUnboundFieldsPreserved_AndTokenRedacted()
    {
        // Body carries an UNMAPPED field (must survive in the literal) plus the token
        // inside a self-link (must be redacted before it leaves the client).
        const string body =
            "{\"data\":{\"id\":12345,\"scientific_name\":\"Solanum lycopersicum\"," +
            "\"growth\":{\"soil_salinity\":4,\"unmapped_extra\":\"keepme\"}," +
            "\"self\":\"/species/12345?token=secret-token\"},\"meta\":{}}";
        var handler = new RecordingHandler(HttpStatusCode.OK, body);
        var client = NewClient(handler);

        var fetch = await client.GetSpeciesWithLiteralAsync(12345, CancellationToken.None);

        // Parsed surface.
        Assert.NotNull(fetch.Species);
        Assert.Equal("Solanum lycopersicum", fetch.Species!.Data!.ScientificName);
        Assert.Equal(4, fetch.Species.Data.Growth!.SoilSalinity);
        // Verbatim literal: the unmapped field survives for the audit row.
        Assert.NotNull(fetch.LiteralJson);
        Assert.Contains("unmapped_extra", fetch.LiteralJson!);
        Assert.Contains("keepme", fetch.LiteralJson!);
        // Redaction: the token never lands in the captured body.
        Assert.DoesNotContain("secret-token", fetch.LiteralJson!);
        Assert.Contains("token=REDACTED", fetch.LiteralJson!);
    }

    [Fact]
    public async Task GetSpeciesAsync_ReturnsNull_OnTransportFailure()
    {
        var handler = new ThrowingHandler(new HttpRequestException("server fault"));
        var client = NewClient(handler);

        var response = await client.GetSpeciesAsync(99999, CancellationToken.None);

        Assert.Null(response);
    }

    [Fact]
    public async Task GetSpeciesAsync_PropagatesCallerCancellation()
    {
        // Mirror of the SearchAsync cancellation test — both methods share the
        // same OperationCanceledException pattern (caller-token signalled =
        // propagate; timeout-token signalled = swallow + return null).
        var handler = new RecordingHandler(HttpStatusCode.OK, "{\"data\":{\"id\":1}}");
        var client = NewClient(handler);

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => client.GetSpeciesAsync(12345, cts.Token));
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    public async Task SearchAsync_ReturnsNull_OnHttpError(HttpStatusCode status)
    {
        // GetFromJsonAsync<T> throws HttpRequestException on any non-success
        // status (4xx / 5xx, including 429 rate-limit). The client catches it
        // and returns null so callers degrade gracefully — this is part of the
        // contract documented on SearchAsync, and worth a regression test now
        // that the catch block was extended (round 2) to also swallow
        // JsonException + NotSupportedException.
        var handler = new RecordingHandler(status, "{}");
        var client = NewClient(handler);

        var response = await client.SearchAsync("Anything", CancellationToken.None);

        Assert.Null(response);
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    public async Task GetSpeciesAsync_ReturnsNull_OnHttpError(HttpStatusCode status)
    {
        var handler = new RecordingHandler(status, "{}");
        var client = NewClient(handler);

        var response = await client.GetSpeciesAsync(99999, CancellationToken.None);

        Assert.Null(response);
    }

    [Fact]
    public async Task SearchAsync_ReturnsNull_OnMalformedJson()
    {
        // GetFromJsonAsync throws JsonException on a successful response with a
        // body that the deserialiser can't parse. The client converts to null
        // to honor the documented "null on failure" contract.
        var handler = new RecordingHandler(HttpStatusCode.OK, "{ invalid json }");
        var client = NewClient(handler);

        var response = await client.SearchAsync("Anything", CancellationToken.None);

        Assert.Null(response);
    }

    [Fact]
    public async Task GetSpeciesAsync_ReturnsNull_OnMalformedJson()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "{ invalid json }");
        var client = NewClient(handler);

        var response = await client.GetSpeciesAsync(12345, CancellationToken.None);

        Assert.Null(response);
    }

    [Fact]
    public async Task SearchAsync_ReturnsNull_OnUnsupportedContentType()
    {
        // GetFromJsonAsync throws NotSupportedException when the Content-Type
        // header doesn't match a JSON media type. Trefle has been observed to
        // return text/html error pages from edge / proxy layers under load.
        var handler = new HtmlHandler("<html>error</html>");
        var client = NewClient(handler);

        var response = await client.SearchAsync("Anything", CancellationToken.None);

        Assert.Null(response);
    }

    [Fact]
    public async Task GetSpeciesAsync_ReturnsNull_OnUnsupportedContentType()
    {
        var handler = new HtmlHandler("<html>error</html>");
        var client = NewClient(handler);

        var response = await client.GetSpeciesAsync(12345, CancellationToken.None);

        Assert.Null(response);
    }

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

    /// <summary>
    /// Returns a 200 response with a <c>text/html</c> Content-Type so
    /// <see cref="HttpClient.GetFromJsonAsync{T}(string, CancellationToken)"/>
    /// throws <see cref="NotSupportedException"/>. Used to verify the
    /// content-type-mismatch path returns null.
    /// </summary>
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
