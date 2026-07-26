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
/// SMA-31 R3 — a <c>Frontend:BaseUrl</c> configured WITH a trailing slash must
/// still emit single-slash confirmation links (<c>.../confirm-email</c>, never
/// <c>...//confirm-email</c>): <c>ResolveFrontendBaseUrl</c> trims at the
/// consumption point. The shared fixture pins a slash-less URL, so this proof
/// needs its own factory (same container database, dedicated configuration) —
/// the <c>ContactRateLimitTests</c> pattern.
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class AuthFrontendUrlTrailingSlashTests : IAsyncLifetime
{
    private readonly PostgresFixture _fixture;
    private WebApplicationFactory<Program> _factory = default!;
    private HttpClient _client = default!;

    public AuthFrontendUrlTrailingSlashTests(PostgresFixture fixture)
    {
        _fixture = fixture;
    }

    public Task InitializeAsync()
    {
        // Mirrors the fixture's builder ("Testing" skips the seeder; the schema is
        // already migrated by the shared fixture on the same container) — only the
        // frontend URL differs, and only the email service needs stubbing on the
        // registration path.
        _factory = new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl("http://localhost:3000/")
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
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
    public async Task Register_TrailingSlashBaseUrl_EmitsSingleSlashConfirmationLink()
    {
        var email = $"slash-{Guid.NewGuid():N}@example.com";

        var response = await _client.PostAsJsonAsync(
            "/api/auth/register",
            new { email, password = "Str0ng!Pass" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var stub = _factory.Services.GetRequiredService<StubEmailService>();
        var sent = Assert.Single(stub.Sent);
        Assert.Contains("http://localhost:3000/confirm-email?userId=", sent.TextBody);
        Assert.DoesNotContain("//confirm-email", sent.TextBody);
    }
}
