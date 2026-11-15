using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartCrops.Infrastructure;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-369 OD1 — where <c>AddInfrastructure</c> reads the database
/// configuration when the DbContext options are resolved: the container's
/// <see cref="IConfiguration"/> first, the argument when the container holds
/// none. No database: resolving the options opens no connection.
/// </summary>
public class DependencyInjectionTests
{
    private static IConfiguration Config(string host) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Database:Host"] = host,
                ["Database:User"] = "u",
                ["Database:Password"] = "p",
            })
            .Build();

    private static string? ResolvedHost(IServiceCollection services)
    {
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var options = scope.ServiceProvider.GetRequiredService<DbContextOptions<SmartCropsDbContext>>();
        var connectionString = options.Extensions.OfType<RelationalOptionsExtension>().Single().ConnectionString;
        return new NpgsqlConnectionStringBuilder(connectionString).Host;
    }

    [Fact]
    public void NoConfigurationInTheContainer_TheSuppliedOneIsUsed()
    {
        var services = new ServiceCollection();
        services.AddInfrastructure(Config("argument-host"));

        Assert.Equal("argument-host", ResolvedHost(services));
    }

    [Fact]
    public void ConfigurationInTheContainer_WinsOverTheSuppliedOne()
    {
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(Config("container-host"));
        services.AddInfrastructure(Config("argument-host"));

        Assert.Equal("container-host", ResolvedHost(services));
    }
}
