using Microsoft.AspNetCore.Mvc.Testing;
using SmartCrops.Api.Tests.Infrastructure;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-41 — the config-gated ForwardedHeaders boundary: a valid CIDR boots the
/// host (and /health answers), an unparsable entry fails fast AT BOOT naming
/// the offending value — same philosophy as the JWT guard: a half-trusted
/// proxy boundary is worse than no boot.
/// </summary>
public class ForwardedHeadersConfigTests
{
    private static WebApplicationFactory<Program> FactoryWithKnownNetwork(string cidr) =>
        new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("ForwardedHeaders:KnownNetworks:0", cidr)
            .Build();

    [Fact]
    public async Task ValidCidr_HostBoots_AndHealthAnswers()
    {
        await using var factory = FactoryWithKnownNetwork("172.28.0.0/16");
        var client = factory.CreateClient();
        var response = await client.GetAsync("/health");
        response.EnsureSuccessStatusCode();
        Assert.Equal("ok", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public void InvalidCidr_FailsFastAtBoot_NamingTheOffendingValue()
    {
        using var factory = FactoryWithKnownNetwork("not-a-cidr");
        var ex = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("not-a-cidr", ex.ToString());
    }
}
