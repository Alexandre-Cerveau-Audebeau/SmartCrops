using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantTrefleDataConfiguration : IEntityTypeConfiguration<PlantTrefleData>
{
    public void Configure(EntityTypeBuilder<PlantTrefleData> builder)
    {
        builder.HasKey(t => t.Id);

        builder.HasOne(t => t.Plant)
            .WithOne(p => p.TrefleData)
            .HasForeignKey<PlantTrefleData>(t => t.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(t => t.TrefleSlug).HasMaxLength(200);
        builder.Property(t => t.WfoId).HasMaxLength(50);
        builder.Property(t => t.GrowthHabit).HasMaxLength(100);
        builder.Property(t => t.FlowerColors).HasMaxLength(500);
        builder.Property(t => t.FoliageColors).HasMaxLength(500);
        builder.Property(t => t.ApiVersion).HasMaxLength(20);

        builder.Property(t => t.NativeRegionsJson).HasColumnType("jsonb");
        builder.Property(t => t.IntroducedRegionsJson).HasColumnType("jsonb");
        builder.Property(t => t.RawResponseJson).HasColumnType("jsonb");

        builder.Property(t => t.LastSyncAt).IsRequired();

        builder.Property(t => t.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(t => t.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Enforces 1-1 with Plant.
        builder.HasIndex(t => t.PlantId).IsUnique();

        // TrefleSlug is unique when set; null slugs allowed for plants not yet matched.
        builder.HasIndex(t => t.TrefleSlug)
            .IsUnique()
            .HasFilter("\"TrefleSlug\" IS NOT NULL");
    }
}
