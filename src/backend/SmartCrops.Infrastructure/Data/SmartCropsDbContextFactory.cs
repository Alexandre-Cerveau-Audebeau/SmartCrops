using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SmartCrops.Infrastructure.Data;

/// <summary>
/// Used exclusively by the EF Core CLI (dotnet ef migrations / database update) at design time.
/// The application never instantiates this class at runtime — it exists only so the tooling
/// can create a SmartCropsDbContext without needing a running host or configuration system.
/// </summary>
public class SmartCropsDbContextFactory : IDesignTimeDbContextFactory<SmartCropsDbContext>
{
    public SmartCropsDbContext CreateDbContext(string[] args)
    {
        // SMA-355 — no committed password. Model-only commands (dotnet ef
        // migrations add/remove) never open a connection, so the password-less
        // fallback is enough for them; migrations are applied at runtime by the
        // API on boot. Commands that do reach the database (dotnet ef database
        // update) need the real string exported first:
        //   $env:ConnectionStrings__DefaultConnection =
        //     "Host=localhost;Database=smartcrops;Username=smartcrops;Password=<dev password>"
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Host=localhost;Database=smartcrops;Username=smartcrops";

        var options = new DbContextOptionsBuilder<SmartCropsDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new SmartCropsDbContext(options);
    }
}
