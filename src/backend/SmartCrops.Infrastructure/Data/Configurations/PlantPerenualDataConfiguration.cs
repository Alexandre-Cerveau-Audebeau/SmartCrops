using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantPerenualDataConfiguration : IEntityTypeConfiguration<PlantPerenualData>
{
    public void Configure(EntityTypeBuilder<PlantPerenualData> builder)
    {
        builder.HasKey(p => p.Id);

        builder.HasOne(p => p.Plant)
            .WithOne(plant => plant.PerenualData)
            .HasForeignKey<PlantPerenualData>(p => p.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(p => p.PerenualId).IsRequired();

        builder.Property(p => p.Cultivar).HasMaxLength(150);
        builder.Property(p => p.PerenualType).HasMaxLength(100);
        builder.Property(p => p.OriginCountries).HasMaxLength(500);
        builder.Property(p => p.PropagationMethods).HasMaxLength(500);
        builder.Property(p => p.WateringBenchmark).HasMaxLength(50);
        builder.Property(p => p.WateringBenchmarkUnit).HasMaxLength(20);
        builder.Property(p => p.SunlightPreferences).HasMaxLength(200);
        builder.Property(p => p.PruningMonths).HasMaxLength(200);
        builder.Property(p => p.Maintenance).HasMaxLength(50);
        builder.Property(p => p.FloweringSeason).HasMaxLength(50);
        builder.Property(p => p.HarvestSeason).HasMaxLength(50);
        builder.Property(p => p.ApiVersion).HasMaxLength(20);

        builder.Property(p => p.PlantAnatomyJson).HasColumnType("jsonb");
        builder.Property(p => p.RawResponseJson).HasColumnType("jsonb");

        builder.Property(p => p.HasSupremeData).HasDefaultValue(false);
        builder.Property(p => p.LastSyncAt).IsRequired();

        builder.Property(p => p.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(p => p.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Enforces 1-1 with Plant.
        builder.HasIndex(p => p.PlantId).IsUnique();

        // PerenualId is the upstream PK — must be unique within our store.
        builder.HasIndex(p => p.PerenualId).IsUnique();
    }
}
