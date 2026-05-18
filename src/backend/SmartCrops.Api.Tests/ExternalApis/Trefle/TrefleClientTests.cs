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
    public async Task GetSpeciesAsync_ReturnsNull_OnTransportFailure()
    {
        var handler = new ThrowingHandler(new HttpRequestException("server fault"));
        var client = NewClient(handler);

        var response = await client.GetSpeciesAsync(99999, CancellationToken.None);

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
}
