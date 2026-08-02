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
        // SMA-355 — no committed password, and no real host either. `dotnet ef
        // migrations add` only needs the string to PARSE — it never opens a
        // connection (proven against a live server) — so this fallback keeps
        // the common command working with zero secrets. `dotnet ef migrations
        // remove` DOES reach the database (it reads the applied-migration
        // history, even without --force), as does `database update`; for those,
        // export the real string first:
        //   $env:ConnectionStrings__DefaultConnection =
        //     "Host=localhost;Database=smartcrops;Username=smartcrops;Password=<dev password>"
        // The fallback host is deliberately unresolvable so a command that
        // tries to connect fails loudly, by name, instead of silently reaching
        // whatever answers on localhost:5432 (a native Windows Postgres has
        // squatted that port on dev machines before).
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Host=connectionstrings-defaultconnection-not-set.invalid;Database=smartcrops;Username=smartcrops";

        var options = new DbContextOptionsBuilder<SmartCropsDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new SmartCropsDbContext(options);
    }
}
