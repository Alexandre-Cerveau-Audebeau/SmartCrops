using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Interceptors;
using SmartCrops.Infrastructure.Repositories;
using SmartCrops.Infrastructure.Services;

namespace SmartCrops.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddSingleton<UpdateTimestampInterceptor>();

        // Resolve the connection string inside the options lambda so it is read after
        // all configuration sources (including test overrides) have been applied.
        services.AddDbContext<SmartCropsDbContext>((sp, options) =>
        {
            var connectionString = ConnectionStringResolver.Resolve(configuration);

            options
                .UseNpgsql(connectionString)
                .AddInterceptors(sp.GetRequiredService<UpdateTimestampInterceptor>());
        });

        services.AddScoped<IPlantRepository, PlantRepository>();
        services.AddScoped<IBulkImportService, BulkImportService>();
        services.AddScoped<IBulkImportPreflightService, BulkImportPreflightService>();

        services.AddIdentity<ApplicationUser, IdentityRole>(options =>
        {
            options.User.AllowedUserNameCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._@+";
            options.User.RequireUniqueEmail = true;

            // SMA-350 — pinned to the framework defaults in force, so the rules
            // the UI states have a source of truth in this repo. RequiredUniqueChars
            // is pinned for completeness but is vacuous at 1 — every non-empty
            // password satisfies it — so the UI deliberately states five rules, not six.
            options.Password.RequiredLength = 6;
            options.Password.RequireDigit = true;
            options.Password.RequireLowercase = true;
            options.Password.RequireUppercase = true;
            options.Password.RequireNonAlphanumeric = true;
            options.Password.RequiredUniqueChars = 1;
        })
            .AddEntityFrameworkStores<SmartCropsDbContext>()
            .AddDefaultTokenProviders();

        services.ConfigureExternalCookie(options =>
        {
            options.Cookie.SameSite = SameSiteMode.Lax;
        });

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

        // SMA-33 / #68 — seed the Admin role and grant it to the operator-configured
        // emails (AdminSeed:Emails, CSV; set via the AdminSeed__Emails env var in
        // docker-compose.override.yml — never committed). Additive/idempotent: it
        // never revokes a role for an absent email. CSV semantics live in the
        // shared AdminRolePrimitives (SMA-389/390 R1) — one definition for the
        // seeder and the creation-time hook.
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("AdminRoleSeeder");
        await AdminRoleSeeder.SeedAsync(
            roleManager, userManager,
            AdminRolePrimitives.ParseEmails(configuration["AdminSeed:Emails"]), logger);
    }
}
