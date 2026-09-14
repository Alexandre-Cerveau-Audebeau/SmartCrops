using System.Net;
using SmartCrops.Api.Tests.Integration.Stubs;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// SMA-336 PR 3a/5, review round 1 (F1) — the stub's own contract, because
/// its <c>Received</c> counter is the PROOF the cache and rate-limit tests
/// rest on: every request that reaches the transport is counted, including a
/// forecast the pipeline cancels while the stub is being slow on purpose.
/// No database, no host: the handler alone behind an
/// <see cref="HttpMessageInvoker"/>.
/// </summary>
public class StubWeatherApiHttpHandlerTests
{
    private const string Base = "https://api.weatherapi.com/v1/";

    // Synthetic, obviously-fake credential — never a real one.
    private const string Key = "test-key-FAKE-DO-NOT-USE";

    [Fact]
    public async Task Forecast_CancelledDuringTheDelay_IsStillCounted()
    {
        // The slow-provider proof: the delay is long, the caller gives up
        // first. The attempt DID reach the transport — the counter must say so.
        var stub = new StubWeatherApiHttpHandler { ForecastDelay = TimeSpan.FromSeconds(30) };
        using var invoker = new HttpMessageInvoker(stub);
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{Base}forecast.json?key={Key}&q=45.7600,4.8400&days=5");

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => invoker.SendAsync(request, cts.Token));

        Assert.Equal(1, stub.ForecastCalls);
        Assert.Contains("forecast:45.7600,4.8400", stub.Received);
    }

    [Fact]
    public async Task Forecast_Unconfigured_Is404_AndCounted()
    {
        var stub = new StubWeatherApiHttpHandler();
        using var invoker = new HttpMessageInvoker(stub);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{Base}forecast.json?key={Key}&q=45.7600,4.8400");

        using var response = await invoker.SendAsync(request, CancellationToken.None);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, stub.ForecastCalls);
    }

    [Fact]
    public async Task Forecast_Configured_AnswersTheCannedBody_ByCoordinates()
    {
        var stub = new StubWeatherApiHttpHandler();
        stub.SetForecast(45.76, 4.84, "{\"synthetic\":true}");
        using var invoker = new HttpMessageInvoker(stub);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{Base}forecast.json?key={Key}&q=45.7600,4.8400");

        using var response = await invoker.SendAsync(request, CancellationToken.None);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("{\"synthetic\":true}", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Search_IsCounted_ByDecodedQuery_AndAnswersEmptyByDefault()
    {
        var stub = new StubWeatherApiHttpHandler();
        using var invoker = new HttpMessageInvoker(stub);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{Base}search.json?key={Key}&q=Saint-%C3%89tienne");

        using var response = await invoker.SendAsync(request, CancellationToken.None);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("[]", await response.Content.ReadAsStringAsync());
        Assert.Equal(1, stub.SearchCalls);
        Assert.Equal(0, stub.ForecastCalls);
        Assert.Contains("search:Saint-Étienne", stub.Received);
    }

    [Fact]
    public async Task UnknownPath_Is404_AndNotCounted()
    {
        var stub = new StubWeatherApiHttpHandler();
        using var invoker = new HttpMessageInvoker(stub);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{Base}history.json?key={Key}&q=Lyon");

        using var response = await invoker.SendAsync(request, CancellationToken.None);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Empty(stub.Received);
    }

    [Fact]
    public async Task Reset_ClearsAnswersCountsAndDelay()
    {
        var stub = new StubWeatherApiHttpHandler { ForecastDelay = TimeSpan.FromSeconds(1) };
        stub.SetSearch("Paris", "[{\"name\":\"Paris\"}]");
        using var invoker = new HttpMessageInvoker(stub);
        using var first = new HttpRequestMessage(HttpMethod.Get, $"{Base}search.json?key={Key}&q=Paris");
        using (await invoker.SendAsync(first, CancellationToken.None)) { }

        stub.Reset();

        Assert.Empty(stub.Received);
        Assert.Null(stub.ForecastDelay);
        using var second = new HttpRequestMessage(HttpMethod.Get, $"{Base}search.json?key={Key}&q=Paris");
        using var response = await invoker.SendAsync(second, CancellationToken.None);
        Assert.Equal("[]", await response.Content.ReadAsStringAsync());
    }
}
