using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class GardenPlantConfiguration : IEntityTypeConfiguration<GardenPlant>
{
    public void Configure(EntityTypeBuilder<GardenPlant> builder)
    {
        builder.HasKey(gp => new { gp.GardenId, gp.PlantId });

        builder.HasOne(gp => gp.Garden)
            .WithMany(g => g.GardenPlants)
            .HasForeignKey(gp => gp.GardenId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(gp => gp.Plant)
            .WithMany(p => p.GardenPlants)
            .HasForeignKey(gp => gp.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(gp => gp.AddedAt).HasDefaultValueSql("now()");
        builder.Property(gp => gp.Notes).HasMaxLength(500);
    }
}
