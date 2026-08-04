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
        // standard otherwise-valid config the boot-guard family uses.
        using WebApplicationFactory<Program> factory = new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTypesense()
            .WithSmtp()
            .WithInMemoryDatabase("BootOptionalUpstreamsTests")
            .Build();

        using HttpClient client = factory.CreateClient();

        HttpResponseMessage response = await client.GetAsync("/health");

        response.EnsureSuccessStatusCode();
        Assert.Equal("ok", await response.Content.ReadAsStringAsync());
    }
}
