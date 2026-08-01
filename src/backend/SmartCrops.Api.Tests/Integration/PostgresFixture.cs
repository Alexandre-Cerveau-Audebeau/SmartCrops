using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Respawn;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.ExternalApis.Gbif;
using SmartCrops.Infrastructure.ExternalApis.Perenual;
using Testcontainers.PostgreSql;

namespace SmartCrops.Api.Tests.Integration;

/// <summary>
/// xUnit collection fixture that owns a single Postgres 16 Testcontainer and a single
/// <see cref="WebApplicationFactory{TEntryPoint}"/> for the entire integration test
/// collection. Migrations are applied once on startup. Between tests, the
/// <see cref="IntegrationTestBase"/> uses <see cref="Respawner"/> to truncate user
/// tables — schema and seeded reference data (PlantTypes via HasData) are preserved.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private const string TestJwtKey = "SmartCrops-Test-Secret-Key-Min32Characters!!";
    private const string TestJwtIssuer = "SmartCrops";
    private const string TestJwtAudience = "SmartCrops";

    // Pinned to match the docker-compose dev DB so the test environment exercises the
    // same engine version (and quirks) as production-like local development. The image
    // argument is passed to the constructor per the Testcontainers 4.x recommendation
    // (the parameterless overload is [Obsolete] since 4.x).
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("smartcrops_test")
        .WithUsername("test")
        .WithPassword("test")
        .WithCleanUp(true)
        .Build();

    public WebApplicationFactory<Program> Factory { get; private set; } = default!;
    public string ConnectionString => _container.GetConnectionString();
    public Respawner Respawner { get; private set; } = default!;

    /// <summary>
    /// Shared stub for <see cref="IPlantTaxonomyService"/>. Integration tests
    /// enqueue canned responses on this instance and inspect captured calls;
    /// <see cref="IntegrationTestBase.InitializeAsync"/> calls <c>Reset()</c>
    /// after Respawn so each test starts from a clean queue.
    /// </summary>
    public StubPlantTaxonomyService TaxonomyStub =>
        Factory.Services.GetRequiredService<StubPlantTaxonomyService>();

    /// <summary>
    /// Shared stub for <see cref="IPlantTrefleEnrichmentService"/>. Same
    /// lifecycle as <see cref="TaxonomyStub"/> — reset per test.
    /// </summary>
    public StubPlantTrefleEnrichmentService TrefleStub =>
        Factory.Services.GetRequiredService<StubPlantTrefleEnrichmentService>();

    /// <summary>
    /// Shared stub for <see cref="IPlantPerenualEnrichmentService"/>. Same
    /// lifecycle as <see cref="TaxonomyStub"/> — reset per test.
    /// </summary>
    public StubPlantPerenualEnrichmentService PerenualStub =>
        Factory.Services.GetRequiredService<StubPlantPerenualEnrichmentService>();

    /// <summary>
    /// Shared stub for <see cref="IPerenualCatalogService"/> (SMA-13 catalog
    /// enumeration). Same lifecycle as the other stubs — reset per test.
    /// </summary>
    public StubPerenualCatalogService PerenualCatalogStub =>
        Factory.Services.GetRequiredService<StubPerenualCatalogService>();

    /// <summary>
    /// Shared stub for <see cref="IPerenualPestCatalogService"/> (SMA-71 PR2
    /// pest-disease catalogue). Same lifecycle as the other stubs — reset per test.
    /// </summary>
    public StubPerenualPestCatalogService PerenualPestCatalogStub =>
        Factory.Services.GetRequiredService<StubPerenualPestCatalogService>();

    /// <summary>
    /// Shared stub for <see cref="ISearchIndexingService"/> (SMA-255 admin
    /// reindex). Same lifecycle as the other stubs — reset per test.
    /// </summary>
    public StubSearchIndexingService SearchIndexingStub =>
        Factory.Services.GetRequiredService<StubSearchIndexingService>();

    /// <summary>
    /// Shared stub for <see cref="IPlantSearchService"/> (SMA-255 T3 public
    /// finder). Same lifecycle as the other stubs — reset per test.
    /// </summary>
    public StubPlantSearchService PlantSearchStub =>
        Factory.Services.GetRequiredService<StubPlantSearchService>();

    /// <summary>
    /// Shared programmable HTTP handler backing the <c>PerenualClient</c> typed
    /// client (SMA-93). The <c>PerenualRawCacheController</c> injects the concrete
    /// client, so its only seam is the transport — tests configure canned
    /// species-list / details / care-guide bodies here. Reset per test.
    /// </summary>
    public StubPerenualHttpHandler PerenualHttpStub =>
        Factory.Services.GetRequiredService<StubPerenualHttpHandler>();

    /// <summary>
    /// Shared programmable HTTP handler backing the <c>GbifClient</c> typed client
    /// (SMA-124). The <c>PlantTranslationsController</c> injects the concrete client
    /// for the vernacular backfill, so its only seam is the transport — tests
    /// configure canned <c>vernacularNames</c> bodies here. Reset per test.
    /// </summary>
    public StubGbifHttpHandler GbifHttpStub =>
        Factory.Services.GetRequiredService<StubGbifHttpHandler>();

    /// <summary>
    /// Shared stub for <see cref="IEmailService"/> (SMA-30 contact endpoint).
    /// Same lifecycle as the other stubs — reset per test.
    /// </summary>
    public StubEmailService EmailStub =>
        Factory.Services.GetRequiredService<StubEmailService>();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        // "Testing" gates the Program.cs guard that skips DataSeeder.
        // Trefle token is a non-empty placeholder kept alive by ValidateOnStart;
        // the stub below never reads it. Production HTTP / resilience / Trefle-token
        // plumbing stays untested at the integration layer.
        Factory = new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            // SMA-30: the contact endpoint's "contact" rate-limit policy keys
            // every TestServer request on the same partition (no remote IP), so
            // the production limit (5/10min) would 429 the collection. Pin it
            // high here; the dedicated 429 proof uses its own factory with a
            // limit of 2. Same deal for the "passwordReset" policy (SMA-323).
            .WithConfig("RateLimiting:Contact:PermitLimit", "100")
            .WithConfig("RateLimiting:PasswordReset:PermitLimit", "100")
            // Same deal for the "account" policy (SMA-341 R4): every TestServer
            // request shares the "unknown" partition, so the production 10/10min
            // would 429 the account-endpoint tests; the dedicated 429 proof
            // pins its own limit of 2.
            .WithConfig("RateLimiting:Account:PermitLimit", "100")
            .WithConnectionString(ConnectionString)
            .WithServices(services =>
            {
                // Replace the production external-API services with deterministic
                // in-memory stubs. Tests enqueue results on Fixture.TaxonomyStub /
                // Fixture.TrefleStub.
                //
                // Dual registration pattern (one block per stubbed interface):
                //   1. AddSingleton<StubPlantTaxonomyService>() registers the concrete
                //      stub type — so tests can resolve it directly via
                //      Fixture.TaxonomyStub for state control (Enqueue, Reset, inspect
                //      ReceivedNames).
                //   2. AddSingleton<IPlantTaxonomyService>(sp => sp.GetRequiredService<
                //      StubPlantTaxonomyService>()) maps the interface to the same
                //      singleton instance — so production code resolving the interface
                //      hits the same stub.
                // A single AddSingleton<IPlantTaxonomyService>(stubInstance) would not
                // expose the typed stub for state control; two separate AddSingleton
                // calls would create two distinct instances whose state diverges.
                services.RemoveAll<IPlantTaxonomyService>();
                services.AddSingleton<StubPlantTaxonomyService>();
                services.AddSingleton<IPlantTaxonomyService>(sp =>
                    sp.GetRequiredService<StubPlantTaxonomyService>());

                services.RemoveAll<IPlantTrefleEnrichmentService>();
                services.AddSingleton<StubPlantTrefleEnrichmentService>();
                services.AddSingleton<IPlantTrefleEnrichmentService>(sp =>
                    sp.GetRequiredService<StubPlantTrefleEnrichmentService>());

                services.RemoveAll<IPlantPerenualEnrichmentService>();
                services.AddSingleton<StubPlantPerenualEnrichmentService>();
                services.AddSingleton<IPlantPerenualEnrichmentService>(sp =>
                    sp.GetRequiredService<StubPlantPerenualEnrichmentService>());

                services.RemoveAll<IPerenualCatalogService>();
                services.AddSingleton<StubPerenualCatalogService>();
                services.AddSingleton<IPerenualCatalogService>(sp =>
                    sp.GetRequiredService<StubPerenualCatalogService>());

                services.RemoveAll<IPerenualPestCatalogService>();
                services.AddSingleton<StubPerenualPestCatalogService>();
                services.AddSingleton<IPerenualPestCatalogService>(sp =>
                    sp.GetRequiredService<StubPerenualPestCatalogService>());

                // SMA-255: no Typesense server exists in the integration
                // environment, so the reindex endpoint is exercised against a
                // deterministic stub (the Postgres→Typesense round-trip is
                // validated against the live docker stack instead).
                services.RemoveAll<ISearchIndexingService>();
                services.AddSingleton<StubSearchIndexingService>();
                services.AddSingleton<ISearchIndexingService>(sp =>
                    sp.GetRequiredService<StubSearchIndexingService>());

                // SMA-255 T3: same policy for the public finder read path —
                // the engine is stubbed, hydration runs against the real
                // Postgres container.
                services.RemoveAll<IPlantSearchService>();
                services.AddSingleton<StubPlantSearchService>();
                services.AddSingleton<IPlantSearchService>(sp =>
                    sp.GetRequiredService<StubPlantSearchService>());

                // SMA-30: no SMTP relay exists in the integration environment,
                // so the contact endpoint is exercised against a deterministic
                // stub (the real OVH round-trip is validated against the live
                // docker stack instead).
                services.RemoveAll<IEmailService>();
                services.AddSingleton<StubEmailService>();
                services.AddSingleton<IEmailService>(sp =>
                    sp.GetRequiredService<StubEmailService>());

                // SMA-93: the raw-cache controller injects the concrete PerenualClient
                // (no service interface to swap), so we stub the transport instead —
                // override the typed client's primary handler with a programmable stub.
                // Re-calling AddHttpClient<PerenualClient> reuses the production-named
                // registration (base address + resilience preserved); only the primary
                // handler is replaced, and ConfigureTestServices wins (runs last).
                services.AddSingleton<StubPerenualHttpHandler>();
                services.AddHttpClient<PerenualClient>()
                    .ConfigurePrimaryHttpMessageHandler(sp =>
                        sp.GetRequiredService<StubPerenualHttpHandler>());

                // SMA-124: the translations controller injects the concrete GbifClient
                // for the vernacular backfill, so stub the transport the same way —
                // re-registering AddHttpClient<GbifClient> reuses the production-named
                // registration (base address + resilience) and only swaps the primary
                // handler. (Taxonomy tests stub IPlantTaxonomyService instead, so this
                // handler is exercised only by the vernacular-backfill tests.)
                services.AddSingleton<StubGbifHttpHandler>();
                services.AddHttpClient<GbifClient>()
                    .ConfigurePrimaryHttpMessageHandler(sp =>
                        sp.GetRequiredService<StubGbifHttpHandler>());
            })
            .Build();

        // Apply migrations once. Force the host to build before resolving services so
        // ConfigureAppConfiguration above takes effect on the IConfiguration that
        // DependencyInjection.AddInfrastructure reads.
        using (var scope = Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            await db.Database.MigrateAsync();
        }

        // Respawn ignores schema-bearing and reference tables so the schema invariants
        // and seeded enum-like data (PlantTypes via HasData) survive across tests.
        // Identity tables (AspNetUsers et al.) are intentionally NOT in the ignore list:
        // each test owns its user lifecycle and starts from a clean slate — the
        // GardenLayoutEndpointsTests helper seeds an ApplicationUser at the start of
        // every test method.
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        Respawner = await Respawner.CreateAsync(connection, new RespawnerOptions
        {
            DbAdapter = DbAdapter.Postgres,
            SchemasToInclude = ["public"],
            TablesToIgnore =
            [
                new Respawn.Graph.Table("__EFMigrationsHistory"),
                new Respawn.Graph.Table("PlantTypes"),
            ],
        });
    }

    public async Task DisposeAsync()
    {
        // Always tear down the container, even if Factory disposal throws — leaking a
        // running Docker container across CI runs is worse than masking a transient
        // factory error.
        try
        {
            if (Factory is not null)
            {
                await Factory.DisposeAsync();
            }
        }
        finally
        {
            await _container.DisposeAsync();
        }
    }

    /// <summary>
    /// Issues a JWT bearer for the given user id, optionally carrying role claims
    /// (SMA-33). Only <c>sub</c> (+ any roles) is set, so the <c>OnTokenValidated</c>
    /// security-stamp check in Program.cs short-circuits (it returns early when no
    /// <c>security_stamp</c> claim is present). Role claims use
    /// <see cref="ClaimTypes.Role"/>, matching the <c>RoleClaimType</c> configured
    /// in Program.cs, so <c>[Authorize(Roles = "Admin")]</c> resolves them.
    /// </summary>
    public string GenerateToken(string userId, params string[] roles)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestJwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim> { new(JwtRegisteredClaimNames.Sub, userId) };
        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));
        var token = new JwtSecurityToken(
            issuer: TestJwtIssuer,
            audience: TestJwtAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
