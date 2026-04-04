using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class GardenPlacementConfiguration : IEntityTypeConfiguration<GardenPlacement>
{
    public void Configure(EntityTypeBuilder<GardenPlacement> builder)
    {
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).ValueGeneratedOnAdd();

        builder.Property(p => p.GardenId).IsRequired();
        builder.Property(p => p.PlantId).IsRequired();
        builder.Property(p => p.StartRow).IsRequired();
        builder.Property(p => p.StartCol).IsRequired();
        builder.Property(p => p.SpanRows).IsRequired().HasDefaultValue(1);
        builder.Property(p => p.SpanCols).IsRequired().HasDefaultValue(1);
        builder.Property(p => p.Notes).HasMaxLength(500);

        builder.HasIndex(p => p.GardenId);

        builder.HasOne(p => p.Garden)
            .WithMany(g => g.Placements)
            .HasForeignKey(p => p.GardenId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(p => p.Plant)
            .WithMany()
            .HasForeignKey(p => p.PlantId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
