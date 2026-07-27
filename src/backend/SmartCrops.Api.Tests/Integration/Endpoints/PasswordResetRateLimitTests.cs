using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-323 — dedicated factory proving the "passwordReset" fixed-window policy:
/// PermitLimit pinned to 2, so the third POST in the window is rejected 429
/// before reaching the controller (the ContactRateLimitTests pattern). Every
/// TestServer request has no remote IP, so all three POSTs share the "unknown"
/// partition — exactly what the proof needs. Unlike the contact endpoint, this
/// one resolves the Identity store on every request, hence the
/// <c>WithConnectionString</c> against the shared Postgres container (the
/// AuthFrontendUrlValidationTests delta applied to the rate-limit pattern).
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class PasswordResetRateLimitTests : IAsyncLifetime
{
    private readonly PostgresFixture _fixture;
    private WebApplicationFactory<Program> _factory = default!;
    private HttpClient _client = default!;

    public PasswordResetRateLimitTests(PostgresFixture fixture)
    {
        _fixture = fixture;
    }

    public Task InitializeAsync()
    {
        _factory = new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("RateLimiting:PasswordReset:PermitLimit", "2")
            .WithConnectionString(_fixture.ConnectionString)
            .WithServices(services =>
            {
                services.RemoveAll<IEmailService>();
                services.AddSingleton<StubEmailService>();
                services.AddSingleton<IEmailService>(sp =>
                    sp.GetRequiredService<StubEmailService>());
            })
            .Build();
        _client = _factory.CreateClient();
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
    }

    [Fact]
    public async Task Post_ThirdRequestInWindow_Returns429()
    {
        // An unknown address still counts against the window — the limiter sits in
        // front of the account lookup, which is the point (it shields the lookup
        // and the relay alike from enumeration bursts).
        var payload = new { email = "reset-limit-probe@example.com" };

        var first = await _client.PostAsJsonAsync("/api/auth/forgot-password", payload);
        var second = await _client.PostAsJsonAsync("/api/auth/forgot-password", payload);
        var third = await _client.PostAsJsonAsync("/api/auth/forgot-password", payload);

        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, second.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
    }
}
