using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Repositories;

namespace SmartCrops.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Resolve the connection string inside the options lambda so it is read after
        // all configuration sources (including test overrides) have been applied.
        services.AddDbContext<SmartCropsDbContext>(options =>
        {
            var connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException(
                    "Connection string 'DefaultConnection' is not configured.");

            options.UseNpgsql(connectionString);
        });

        services.AddScoped<IPlantRepository, PlantRepository>();

        services.AddIdentity<IdentityUser, IdentityRole>(options =>
        {
            options.User.AllowedUserNameCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._@+";
            options.User.RequireUniqueEmail = true;
        })
            .AddEntityFrameworkStores<SmartCropsDbContext>()
            .AddDefaultTokenProviders();

        return services;
    }

    /// <summary>
    /// Applies pending EF Core migrations and seeds reference data.
    /// NOTE: suitable for development/staging. In production, prefer running
    /// migrations as a dedicated deployment step (dotnet ef database update).
    /// </summary>
    public static async Task InitialiseDatabaseAsync(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        context.Database.Migrate();
        await DataSeeder.SeedAsync(context);
    }
}
