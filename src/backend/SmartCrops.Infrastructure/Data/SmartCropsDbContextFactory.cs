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
        var options = new DbContextOptionsBuilder<SmartCropsDbContext>()
            .UseNpgsql("Host=localhost;Database=smartcrops;Username=smartcrops;Password=smartcrops_dev")
            .Options;

        return new SmartCropsDbContext(options);
    }
}
