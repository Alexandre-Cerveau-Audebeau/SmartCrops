using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-31 R3/R4 — startup validation contract of <c>Frontend:BaseUrl</c>, proven
/// against dedicated factories (the shared fixture pins a slash-less URL, and the
/// rejection proofs need the host boot itself to fail — the
/// <c>ContactRateLimitTests</c> pattern, same container database).
/// <para>The contract: a trailing slash is TOLERATED at startup and normalized at
/// the consumer (<c>ResolveFrontendBaseUrl</c> trims it, links stay single-slash);
/// a query- or fragment-bearing value is REJECTED at boot (R4) because emitted
/// links append a path segment, so anything past authority+path breaks them.
/// "Testing" is not Development, so <c>ValidateOnStart</c> is armed here.</para>
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class AuthFrontendUrlValidationTests
{
    private readonly PostgresFixture _fixture;

    public AuthFrontendUrlValidationTests(PostgresFixture fixture)
    {
        _fixture = fixture;
    }

    /// <summary>
    /// Mirrors the shared fixture's builder ("Testing" skips the seeder; the schema
    /// is already migrated by the fixture on the same container) — only the frontend
    /// URL varies per test, and only the email service needs stubbing on the
    /// registration path.
    /// </summary>
    private WebApplicationFactory<Program> BuildFactory(string frontendBaseUrl) =>
        new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl(frontendBaseUrl)
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

    /// <summary>
    /// Unwraps host-startup exception nesting down to the options-validation
    /// failure, so the assertions survive hosting-layer wrapping changes.
    /// </summary>
    private static OptionsValidationException? FindOptionsValidation(Exception? ex)
    {
        while (ex is not null)
        {
            if (ex is OptionsValidationException validation)
                return validation;
            ex = ex is AggregateException aggregate ? aggregate.InnerException : ex.InnerException;
        }

        return null;
    }

    [Fact]
    public async Task Register_TrailingSlashBaseUrl_EmitsSingleSlashConfirmationLink()
    {
        await using var factory = BuildFactory("http://localhost:3000/");
        using var client = factory.CreateClient();
        var email = $"slash-{Guid.NewGuid():N}@example.com";

        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { email, password = "Str0ng!Pass" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var stub = factory.Services.GetRequiredService<StubEmailService>();
        var sent = Assert.Single(stub.Sent);
        Assert.Contains("http://localhost:3000/confirm-email?userId=", sent.TextBody);
        Assert.DoesNotContain("//confirm-email", sent.TextBody);
    }

    [Theory]
    [InlineData("http://localhost:3000/?tenant=1")]
    [InlineData("http://localhost:3000/#home")]
    public async Task Startup_QueryOrFragmentBearingBaseUrl_FailsOptionsValidation(string frontendBaseUrl)
    {
        await using var factory = BuildFactory(frontendBaseUrl);

        // ValidateOnStart fires when the deferred host actually boots, i.e. on the
        // first CreateClient — the misconfigured value must kill the boot, not
        // degrade into broken emitted links.
        var ex = Record.Exception(() => factory.CreateClient());

        Assert.NotNull(ex);
        var validation = FindOptionsValidation(ex);
        Assert.NotNull(validation);
        Assert.Contains("no query string and no fragment", validation!.Message);
    }
}
