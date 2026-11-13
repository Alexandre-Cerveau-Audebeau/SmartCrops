using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
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
    [Theory]
    [InlineData("")] // blank
    [InlineData(null)] // absent
    public async Task BootSucceeds_WhenTrefleAndPerenualCredentialsAreBlankOrAbsent(string? credential)
    {
        // Deliberately no WithTrefle()/WithPerenual(): no credential, exactly
        // like the Production environment file. Everything else is the standard
        // otherwise-valid config the boot-guard family uses. The two blanks: an
        // inherited Trefle__Token / Perenual__ApiKey environment variable on the
        // runner would otherwise silently turn this into a CREDENTIALED boot;
        // the blanks pin the uncredentialed scenario (mirrors the boot-guard
        // family's anti-ambient blanks). Blank and absent are one boot: an absent
        // key leaves the option at its string.Empty default, a blank key binds
        // "", and with no [Required] on either, nothing tells the two apart.
        // Both are run. The absent row passes null: in the collection the
        // factory adds last, a null masks every earlier provider, the inherited
        // variable included, so the host reads no value for the key.
        using WebApplicationFactory<Program> factory = new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("Trefle:Token", credential)
            .WithConfig("Perenual:ApiKey", credential)
            .WithInMemoryDatabase("BootOptionalUpstreamsTests")
            .Build();

        using HttpClient client = factory.CreateClient();

        HttpResponseMessage response = await client.GetAsync("/health");

        response.EnsureSuccessStatusCode();
        Assert.Equal("ok", await response.Content.ReadAsStringAsync());

        // The premise of each row, read back from the host: "" for the blank
        // row, null for the absent one.
        IConfiguration configuration = factory.Services.GetRequiredService<IConfiguration>();
        Assert.Equal(credential, configuration["Trefle:Token"]);
        Assert.Equal(credential, configuration["Perenual:ApiKey"]);
    }

    [Theory]
    [InlineData("")] // blank
    [InlineData(null)] // absent
    public async Task BootSucceeds_WhenWeatherApiKeyIsBlankOrAbsent(string? apiKey)
    {
        // SMA-336 PR 3a/5 applies the SMA-377 doctrine from day one: the
        // weather provider is not a boot dependency. No WithWeatherApi(), and
        // an explicit blank against an inherited WeatherApi__ApiKey on the
        // runner, so the scenario pinned is the uncredentialed boot. Blank and
        // absent are one boot here too: the key defaults to string.Empty and
        // carries no [Required], like the two credentials of the test above.
        // Both are run, the absent row through the same masking null.
        using WebApplicationFactory<Program> factory = new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("Trefle:Token", "")
            .WithConfig("Perenual:ApiKey", "")
            .WithConfig("WeatherApi:ApiKey", apiKey)
            .WithInMemoryDatabase("BootOptionalUpstreamsTests_WeatherApi")
            .Build();

        using HttpClient client = factory.CreateClient();

        HttpResponseMessage response = await client.GetAsync("/health");

        response.EnsureSuccessStatusCode();
        Assert.Equal("ok", await response.Content.ReadAsStringAsync());

        // The premise of each row, read back from the host.
        IConfiguration configuration = factory.Services.GetRequiredService<IConfiguration>();
        Assert.Equal(apiKey, configuration["WeatherApi:ApiKey"]);
    }
}
