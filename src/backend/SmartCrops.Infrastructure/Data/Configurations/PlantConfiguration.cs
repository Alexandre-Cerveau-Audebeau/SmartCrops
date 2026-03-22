using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantConfiguration : IEntityTypeConfiguration<Plant>
{
    public void Configure(EntityTypeBuilder<Plant> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.ScientificName)
            .IsRequired()
            .HasMaxLength(200);

        // A scientific name identifies a unique species — duplicates indicate a data error.
        builder.HasIndex(p => p.ScientificName)
            .IsUnique();

        builder.Property(p => p.SunExposure).HasMaxLength(50);
        builder.Property(p => p.WaterNeeds).HasMaxLength(50);
        builder.Property(p => p.SowingPeriod).HasMaxLength(50);
        builder.Property(p => p.HarvestPeriod).HasMaxLength(50);
        builder.Property(p => p.ImageUrl).HasMaxLength(500);

        builder.HasOne(p => p.PlantType)
            .WithMany()
            .HasForeignKey(p => p.PlantTypeId)
            .OnDelete(DeleteBehavior.Restrict); // Prevent cascade-deleting all plants when a type is removed.

        builder.HasMany(p => p.Translations)
            .WithOne(t => t.Plant)
            .HasForeignKey(t => t.PlantId)
            .OnDelete(DeleteBehavior.Cascade); // Translations are owned by the plant — delete together.
    }
}
