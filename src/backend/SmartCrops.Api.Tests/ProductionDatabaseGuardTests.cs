using Microsoft.AspNetCore.Mvc.Testing;
using SmartCrops.Api.Tests.Infrastructure;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-328 R4 — a Production boot with ZERO database configuration must die
/// at startup with a named cause instead of waiting for the first DbContext
/// resolution. The full With* helper set keeps every other environment-gated
/// guard satisfied (JWT, options ValidateOnStart, frontend URL) so the ONLY
/// missing concern is the database — the guard under test.
/// </summary>
public class ProductionDatabaseGuardTests
{
    [Fact]
    public void ProductionWithoutAnyDatabaseConfig_FailsFastAtBoot()
    {
        using WebApplicationFactory<Program> factory = new TestWebAppBuilder()
            .WithEnvironment("Production")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            .Build();

        var ex = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("Production requires a database configuration", ex.ToString());
    }
}
