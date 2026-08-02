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

    [Fact]
    public void OutOfRangePrefixLength_FailsFastAtBoot_NamingTheEntry()
    {
        // "172.28.0.0/999" passes both TryParse calls; without the explicit
        // bound it would die in the IPNetwork ctor as a generic
        // ArgumentOutOfRangeException naming nothing.
        using var factory = FactoryWithKnownNetwork("172.28.0.0/999");
        var ex = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("999", ex.ToString());
        Assert.Contains("not a valid CIDR", ex.ToString());
    }

    [Theory]
    [InlineData("0.0.0.0/0")]
    [InlineData("::/0")]
    public void CatchAllNetwork_FailsFastAtBoot_NamingTheHazard(string cidr)
    {
        // /0 parses as valid CIDR — the rejection is semantic: it would trust
        // every peer on the wire for X-Forwarded-* headers.
        using var factory = FactoryWithKnownNetwork(cidr);
        var ex = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("catch-all", ex.ToString());
    }

    private static WebApplicationFactory<Program> FactoryWithKnownProxy(string proxy) =>
        new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("ForwardedHeaders:KnownProxies:0", proxy)
            .Build();

    [Fact]
    public async Task ValidKnownProxy_HostBoots_AndHealthAnswers()
    {
        // A single proxy is an IP, not a CIDR.
        await using var factory = FactoryWithKnownProxy("203.0.113.9");
        var client = factory.CreateClient();
        var response = await client.GetAsync("/health");
        response.EnsureSuccessStatusCode();
        Assert.Equal("ok", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public void InvalidKnownProxy_FailsFastAtBoot_NamingTheOffendingValue()
    {
        using var factory = FactoryWithKnownProxy("not-an-ip");
        var ex = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("not-an-ip", ex.ToString());
    }
}
