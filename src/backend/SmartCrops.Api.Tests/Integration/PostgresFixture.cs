using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Respawn;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.Data;
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

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        Factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                // "Testing" gates the Program.cs guard that skips DataSeeder.
                builder.UseEnvironment("Testing");
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["ConnectionStrings:DefaultConnection"] = ConnectionString,
                        ["Jwt:Key"] = TestJwtKey,
                        ["Jwt:Issuer"] = TestJwtIssuer,
                        ["Jwt:Audience"] = TestJwtAudience,
                        ["Google:ClientId"] = "test-client-id",
                        ["Google:ClientSecret"] = "test-client-secret",
                        ["Frontend:BaseUrl"] = "http://localhost:3000",
                    });
                });

                // Replace the production GBIF-backed IPlantTaxonomyService with a
                // deterministic in-memory stub. Tests enqueue PlantTaxonomyResult
                // values on Fixture.TaxonomyStub; production HTTP/resilience
                // plumbing stays untested at the integration layer.
                builder.ConfigureTestServices(services =>
                {
                    services.RemoveAll<IPlantTaxonomyService>();
                    services.AddSingleton<StubPlantTaxonomyService>();
                    services.AddSingleton<IPlantTaxonomyService>(sp =>
                        sp.GetRequiredService<StubPlantTaxonomyService>());
                });
            });

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
    /// Issues a JWT bearer for the given user id. Replicates the pattern used by
    /// <c>GardensTestFactory</c>: only the <c>sub</c> claim is set, so the
    /// <c>OnTokenValidated</c> security-stamp check in Program.cs short-circuits
    /// (the production check returns early when no <c>security_stamp</c> claim is present).
    /// </summary>
    public string GenerateToken(string userId)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestJwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: TestJwtIssuer,
            audience: TestJwtAudience,
            claims: [new Claim(JwtRegisteredClaimNames.Sub, userId)],
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
