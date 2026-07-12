using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-30 — dedicated factory proving the "contact" fixed-window policy:
/// PermitLimit pinned to 2, so the third valid POST in the window is rejected
/// 429 before reaching the controller. Kept out of the integration collection
/// (whose shared fixture pins the limit to 100 so functional tests never
/// trip). Every TestServer request has no remote IP, so all three POSTs share
/// the "unknown" partition — exactly what the proof needs.
/// </summary>
public class ContactRateLimitFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // No DbContext override: the contact endpoint never resolves
        // SmartCropsDbContext, so the production lambda (lazy on first
        // resolve) is never hit — same shape as CustomWebApplicationFactory.
        new TestWebAppBuilder()
            .WithEnvironment("Development")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("RateLimiting:Contact:PermitLimit", "2")
            .WithServices(services =>
            {
                // No relay in tests — swap the production sender for a stub so
                // the two permitted POSTs return 204 instead of dialing OVH.
                services.RemoveAll<IEmailService>();
                services.AddSingleton<IEmailService, StubEmailService>();
            })
            .ApplyTo(builder);
    }
}

public class ContactRateLimitTests : IClassFixture<ContactRateLimitFactory>
{
    private readonly HttpClient _client;

    public ContactRateLimitTests(ContactRateLimitFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Post_ThirdRequestInWindow_Returns429()
    {
        var payload = new
        {
            name = "Alex Gardener",
            email = "alex@example.com",
            reason = "other",
            message = "Rate-limit probe.",
        };

        var first = await _client.PostAsJsonAsync("/api/contact", payload);
        var second = await _client.PostAsJsonAsync("/api/contact", payload);
        var third = await _client.PostAsJsonAsync("/api/contact", payload);

        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
    }
}
