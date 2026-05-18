using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using SmartCrops.Api.Tests.Infrastructure;

namespace SmartCrops.Api.Tests;

public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // No DbContext override: /health and /swagger never resolve
        // SmartCropsDbContext, so the production lambda (lazy on first resolve)
        // is never hit.
        new TestWebAppBuilder()
            .WithEnvironment("Development")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .ApplyTo(builder);
    }
}

public class HealthEndpointTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public HealthEndpointTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetHealth_Returns200WithOk()
    {
        var response = await _client.GetAsync("/health");

        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("ok", body);
    }

    [Fact]
    public async Task GetSwagger_Returns200()
    {
        var response = await _client.GetAsync("/swagger/index.html");

        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
    }
}
