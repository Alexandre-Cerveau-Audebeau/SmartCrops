using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace SmartCrops.Api.Tests;

public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((context, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "SmartCrops-Test-Secret-Key-Min32Characters!!",
                ["Jwt:Issuer"] = "SmartCrops",
                ["Jwt:Audience"] = "SmartCrops",
                ["Google:ClientId"] = "test-client-id",
                ["Google:ClientSecret"] = "test-client-secret",
            });
        });
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
