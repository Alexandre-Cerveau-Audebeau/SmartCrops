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
    private static TestWebAppBuilder ProductionBuilder() => new TestWebAppBuilder()
        .WithEnvironment("Production")
        .WithJwtAuth()
        .WithGoogleOAuth()
        .WithFrontendUrl()
        .WithTrefle()
        .WithPerenual()
        .WithTypesense()
        .WithSmtp();

    [Fact]
    public void ProductionWithoutAnyDatabaseConfig_FailsFastAtBoot()
    {
        using WebApplicationFactory<Program> factory = ProductionBuilder().Build();

        // Typed assert (SMA-368): the guard's InvalidOperationException reaches
        // the factory unwrapped — DataProtectionPersistenceTests already proves
        // boot-path throws arrive as-is — so the loose ThrowsAny/ToString pair
        // is tightened to the exception the guard actually throws.
        var ex = Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
        Assert.Contains("Production requires a database configuration", ex.Message);
    }

    [Fact]
    public void ProductionWithIncompleteDiscreteConfig_FailsFastAtBoot()
    {
        // SMA-369 D4b — the claim written beside the DB-init gate in Program.cs:
        // an INCOMPLETE discrete config (Database:Host without User/Password)
        // passes the presence-only IsConfigured gate, then dies AT BOOT on the
        // resolver's named error while the DB-init block resolves the DbContext.
        // A resolver unit test cannot hold this — the behavior lives in the
        // host boot sequence — so this factory boot is the proof.
        using WebApplicationFactory<Program> factory = ProductionBuilder()
            .WithConfig("Database:Host", "dbhost")
            .Build();

        var ex = Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
        Assert.Contains("Database:User", ex.Message);
    }
}
