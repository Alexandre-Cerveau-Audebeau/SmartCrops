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
}
