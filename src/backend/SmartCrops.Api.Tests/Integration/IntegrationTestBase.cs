using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration;

/// <summary>
/// Base class for integration tests that run against a real PostgreSQL container
/// (shared via <see cref="PostgresFixture"/>). Each test instance resets the database
/// to a clean state using Respawn — schema and seeded PlantTypes survive, everything
/// else is truncated.
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public abstract class IntegrationTestBase : IAsyncLifetime
{
    protected readonly PostgresFixture Fixture;
    protected HttpClient Client { get; private set; } = default!;

    protected IntegrationTestBase(PostgresFixture fixture)
    {
        Fixture = fixture;
    }

    public async Task InitializeAsync()
    {
        await using var connection = new NpgsqlConnection(Fixture.ConnectionString);
        await connection.OpenAsync();
        await Fixture.Respawner.ResetAsync(connection);

        Client = Fixture.Factory.CreateClient();
    }

    public Task DisposeAsync()
    {
        // Null-safe: if InitializeAsync threw before Client was assigned, calling
        // Client.Dispose() would NRE and mask the original setup failure.
        Client?.Dispose();
        return Task.CompletedTask;
    }

    /// <summary>
    /// Opens a fresh DI scope. Always wrap in <c>using</c> to dispose the scope
    /// (and the DbContext it owns). Standard usage:
    /// <code>
    /// using var scope = CreateScope();
    /// var db = scope.ServiceProvider.GetRequiredService&lt;SmartCropsDbContext&gt;();
    /// </code>
    /// </summary>
    protected IServiceScope CreateScope() => Fixture.Factory.Services.CreateScope();
}
