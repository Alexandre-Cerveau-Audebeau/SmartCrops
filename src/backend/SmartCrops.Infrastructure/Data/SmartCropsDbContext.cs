using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data;

public class SmartCropsDbContext(DbContextOptions<SmartCropsDbContext> options)
    : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<Plant> Plants => Set<Plant>();
    public DbSet<PlantType> PlantTypes => Set<PlantType>();
    public DbSet<PlantTranslation> PlantTranslations => Set<PlantTranslation>();
    public DbSet<PlantSuggestion> PlantSuggestions => Set<PlantSuggestion>();
    public DbSet<Garden> Gardens => Set<Garden>();
    public DbSet<GardenPlant> GardenPlants => Set<GardenPlant>();
    public DbSet<GardenPlacement> GardenPlacements => Set<GardenPlacement>();

    public DbSet<PlantTrefleData> PlantTrefleData => Set<PlantTrefleData>();
    public DbSet<PlantPerenualData> PlantPerenualData => Set<PlantPerenualData>();
    public DbSet<PlantLongDescription> PlantLongDescriptions => Set<PlantLongDescription>();
    public DbSet<PlantCommonName> PlantCommonNames => Set<PlantCommonName>();
    public DbSet<PlantImage> PlantImages => Set<PlantImage>();
    public DbSet<PlantPhase> PlantPhases => Set<PlantPhase>();
    public DbSet<PlantSynonym> PlantSynonyms => Set<PlantSynonym>();
    public DbSet<PlantSource> PlantSources => Set<PlantSource>();
    public DbSet<PlantPest> PlantPests => Set<PlantPest>();

    public DbSet<PerenualPestCatalog> PerenualPestCatalog => Set<PerenualPestCatalog>();

    public DbSet<PerenualRawCache> PerenualRawCache => Set<PerenualRawCache>();

    public DbSet<PerenualRevisitQueue> PerenualRevisitQueue => Set<PerenualRevisitQueue>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Scans this assembly for all IEntityTypeConfiguration<T> implementations
        // and applies them automatically — no manual registration needed when adding
        // new configuration classes.
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SmartCropsDbContext).Assembly);
    }
}
