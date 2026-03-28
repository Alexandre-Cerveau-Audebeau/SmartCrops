using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data;

public class SmartCropsDbContext(DbContextOptions<SmartCropsDbContext> options)
    : IdentityDbContext<IdentityUser>(options)
{
    public DbSet<Plant> Plants => Set<Plant>();
    public DbSet<PlantType> PlantTypes => Set<PlantType>();
    public DbSet<PlantTranslation> PlantTranslations => Set<PlantTranslation>();
    public DbSet<PlantSuggestion> PlantSuggestions => Set<PlantSuggestion>();
    public DbSet<Garden> Gardens => Set<Garden>();
    public DbSet<GardenPlant> GardenPlants => Set<GardenPlant>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Scans this assembly for all IEntityTypeConfiguration<T> implementations
        // and applies them automatically — no manual registration needed when adding
        // new configuration classes.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SmartCropsDbContext).Assembly);
    }
}
