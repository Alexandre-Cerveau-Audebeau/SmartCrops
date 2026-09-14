using Microsoft.AspNetCore.Mvc.Testing;
using SmartCrops.Api.Tests.Infrastructure;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-377 — the first real CD deploy crash-looped the api at boot:
/// <c>TrefleOptions.Token</c> and <c>PerenualOptions.ApiKey</c> were
/// <c>[Required]</c> + <c>ValidateOnStart</c>, and Production supplies
/// neither (Perenual is cancelled and cache-only; Trefle only ever served
/// ingestion — runtime reads the database). The dev override always provided
/// both, masking the coupling. This boot proof pins the fix: a host whose
/// configuration carries NO Trefle and NO Perenual credentials must start
/// and serve /health. "Testing" arms the same unconditional
/// <c>ValidateOnStart</c> chains that fired in Production while keeping the
/// deliberate DB-init/seeder skip, so the boot needs no real database.
/// </summary>
public class BootOptionalUpstreamsTests
{
    [Fact]
    public async Task BootSucceeds_WhenTrefleAndPerenualSectionsAreAbsent()
    {
        // Deliberately no WithTrefle()/WithPerenual(): the sections are absent,
        // exactly like the Production environment file. Everything else is the
        // standard otherwise-valid config the boot-guard family uses. The two
        // blanks: an inherited Trefle__Token / Perenual__ApiKey environment
        // variable on the runner would otherwise silently turn this into a
        // CREDENTIALED boot; the blanks pin the uncredentialed scenario
        // (mirrors the boot-guard family's anti-ambient blanks).
        using WebApplicationFactory<Program> factory = new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("Trefle:Token", "")
            .WithConfig("Perenual:ApiKey", "")
            .WithInMemoryDatabase("BootOptionalUpstreamsTests")
            .Build();

        using HttpClient client = factory.CreateClient();

        HttpResponseMessage response = await client.GetAsync("/health");

        response.EnsureSuccessStatusCode();
        Assert.Equal("ok", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task BootSucceeds_WhenWeatherApiKeyIsAbsent()
    {
        // SMA-336 PR 3a/5 applies the SMA-377 doctrine from day one: the
        // weather provider is not a boot dependency. No WithWeatherApi(), and
        // an explicit blank against an inherited WeatherApi__ApiKey on the
        // runner, so the scenario pinned is the uncredentialed boot.
        using WebApplicationFactory<Program> factory = new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("Trefle:Token", "")
            .WithConfig("Perenual:ApiKey", "")
            .WithConfig("WeatherApi:ApiKey", "")
            .WithInMemoryDatabase("BootOptionalUpstreamsTests_WeatherApi")
            .Build();

        using HttpClient client = factory.CreateClient();

        HttpResponseMessage response = await client.GetAsync("/health");

        response.EnsureSuccessStatusCode();
        Assert.Equal("ok", await response.Content.ReadAsStringAsync());
    }
}
