using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data;

public class SmartCropsDbContext(DbContextOptions<SmartCropsDbContext> options) : DbContext(options)
{
    public DbSet<Plant> Plants => Set<Plant>();
    public DbSet<PlantType> PlantTypes => Set<PlantType>();
    public DbSet<PlantTranslation> PlantTranslations => Set<PlantTranslation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Scans this assembly for all IEntityTypeConfiguration<T> implementations
        // and applies them automatically — no manual registration needed when adding
        // new configuration classes.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SmartCropsDbContext).Assembly);
    }
}
