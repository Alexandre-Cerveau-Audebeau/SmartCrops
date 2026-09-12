using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Infrastructure.ExternalApis.WeatherApi;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-336 PR 3a/5 — two dedicated factories for the geocode endpoint's two
/// guards, on the <c>AccountRateLimitTests</c> pattern.
///
/// <para>The <b>"geocode"</b> fixed-window policy: <c>PermitLimit</c> pinned
/// to 2, so the third request in the window is rejected 429 before reaching
/// the controller — and the transport counter proves it never reached the
/// provider either. Every TestServer request shares the "unknown" partition,
/// which is exactly what the proof needs.</para>
///
/// <para>The <b>missing key</b>: a host booted with an EMPTY
/// <c>WeatherApi:ApiKey</c> serves the endpoint — the boot is allowed without
/// the key (SMA-377) — and answers the neutral 503 without ever calling the
/// transport.</para>
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class GeocodeRateLimitTests : IAsyncLifetime
{
    private readonly PostgresFixture _fixture;
    private WebApplicationFactory<Program> _limited = default!;
    private WebApplicationFactory<Program> _keyless = default!;

    public GeocodeRateLimitTests(PostgresFixture fixture)
    {
        _fixture = fixture;
    }

    public Task InitializeAsync()
    {
        _limited = Build(apiKey: "test-weatherapi-key", permitLimit: "2");
        _keyless = Build(apiKey: "", permitLimit: "100");
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        await _limited.DisposeAsync();
        await _keyless.DisposeAsync();
    }

    private WebApplicationFactory<Program> Build(string apiKey, string permitLimit) =>
        new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("WeatherApi:ApiKey", apiKey)
            .WithConfig("RateLimiting:Geocode:PermitLimit", permitLimit)
            .WithConnectionString(_fixture.ConnectionString)
            .WithServices(services =>
            {
                services.AddSingleton<StubWeatherApiHttpHandler>();
                services.AddHttpClient<WeatherApiClient>()
                    .ConfigurePrimaryHttpMessageHandler(sp =>
                        sp.GetRequiredService<StubWeatherApiHttpHandler>());
            })
            .Build();

    private HttpClient ClientFor(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _fixture.GenerateToken($"u-{Guid.NewGuid():N}"));
        return client;
    }

    [Fact]
    public async Task Search_ThirdRequestInWindow_Returns429_AndNeverReachesTheProvider()
    {
        using var client = ClientFor(_limited);
        var stub = _limited.Services.GetRequiredService<StubWeatherApiHttpHandler>();

        var first = await client.GetAsync("/api/geocode/search?q=Lyon");
        var second = await client.GetAsync("/api/geocode/search?q=Lyon");
        var third = await client.GetAsync("/api/geocode/search?q=Lyon");

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
        Assert.Equal(2, stub.SearchCalls);
    }

    [Fact]
    public async Task Search_WithoutKey_Returns503_WithoutCalling()
    {
        using var client = ClientFor(_keyless);
        var stub = _keyless.Services.GetRequiredService<StubWeatherApiHttpHandler>();

        var response = await client.GetAsync("/api/geocode/search?q=Lyon");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("geocoding unavailable", await response.Content.ReadAsStringAsync());
        Assert.Empty(stub.Received);
    }
}
