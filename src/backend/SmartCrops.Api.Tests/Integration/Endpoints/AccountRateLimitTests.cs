using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using SmartCrops.Api.Tests.Infrastructure;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-341 R4 — dedicated factory proving the "account" fixed-window policy:
/// PermitLimit pinned to 2, so the third request in the window is rejected 429
/// before reaching the controller (the PasswordResetRateLimitTests pattern,
/// including its lesson: the endpoints resolve the Identity store, hence
/// <c>WithConnectionString</c> against the shared Postgres container). Every
/// TestServer request has no remote IP, so all requests share the "unknown"
/// partition — exactly what the proof needs. The bearer names a user id that
/// does not exist: authentication passes (test JWT), the endpoints answer 404,
/// and a 404 still consumes a permit — the limiter sits in front of the
/// controller, which is the point (it shields the export's full-graph
/// serialization and the deletion's lookup + transaction from being driven in
/// a loop). The mixed fact proves the actual design: BOTH account endpoints
/// draw on ONE shared "account" budget — a third sister policy, deliberately
/// not a reuse of "passwordReset" (see the Program.cs comment block).
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class AccountRateLimitTests : IAsyncLifetime
{
    private readonly PostgresFixture _fixture;
    private WebApplicationFactory<Program> _factory = default!;
    private HttpClient _client = default!;

    public AccountRateLimitTests(PostgresFixture fixture)
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
            .WithConfig("RateLimiting:Account:PermitLimit", "2")
            .WithConnectionString(_fixture.ConnectionString)
            .Build();
        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _fixture.GenerateToken($"u-{Guid.NewGuid():N}"));
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
    }

    private async Task<HttpResponseMessage> DeleteAccountAsync()
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, "/api/auth/account")
        {
            Content = JsonContent.Create(new { confirmation = "whoever@example.com" }),
        };
        return await _client.SendAsync(request);
    }

    [Fact]
    public async Task Get_Export_ThirdRequestInWindow_Returns429()
    {
        // The export is the exposed endpoint: each request materializes every
        // garden and serializes the whole graph (the documented buffering
        // ceiling), so it is the one most worth throttling.
        var first = await _client.GetAsync("/api/auth/account/export");
        var second = await _client.GetAsync("/api/auth/account/export");
        var third = await _client.GetAsync("/api/auth/account/export");

        Assert.Equal(HttpStatusCode.NotFound, first.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, second.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
    }

    [Fact]
    public async Task Get_MixedEndpoints_ThirdRequestInWindow_Returns429()
    {
        // The PasswordResetRateLimitTests R4 lesson applied here from day one:
        // per-endpoint facts only prove isolation — this proves export and
        // deletion draw on ONE shared "account" budget, so dropping the
        // attribute from either endpoint (or giving it a private policy) fails
        // this fact.
        var export = await _client.GetAsync("/api/auth/account/export");
        var delete = await DeleteAccountAsync();
        var exportAgain = await _client.GetAsync("/api/auth/account/export");

        Assert.Equal(HttpStatusCode.NotFound, export.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, exportAgain.StatusCode);
    }
}
