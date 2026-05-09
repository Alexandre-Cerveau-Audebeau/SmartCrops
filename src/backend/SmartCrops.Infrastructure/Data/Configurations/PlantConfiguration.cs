using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantConfiguration : IEntityTypeConfiguration<Plant>
{
    public void Configure(EntityTypeBuilder<Plant> builder)
    {
        builder.HasKey(p => p.Id);

        // Plants generate their Id client-side (DataSeeder + application code) so EF
        // never picks a value for us — keeps Id assignment explicit at the call site.
        builder.Property(p => p.Id).ValueGeneratedNever();

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

        // ── Identity (GBIF canonical) ───────────────────────────────────────────
        builder.Property(p => p.Family).HasMaxLength(100);
        builder.Property(p => p.Genus).HasMaxLength(100);
        builder.Property(p => p.SpeciesEpithet).HasMaxLength(100);
        builder.Property(p => p.Author).HasMaxLength(200);

        // ── Canonical READ MODEL ────────────────────────────────────────────────
        // Enums are stored as strings so changing numeric values upstream doesn't
        // silently corrupt rows; the max length covers the longest variant name.
        builder.Property(p => p.LifeCycle).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.GrowthRate).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.WateringNeedLevel).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.CareLevel).HasConversion<string>().HasMaxLength(20);

        // EnrichmentStatus is [Flags] — store as int so bitwise combinations round-trip.
        // Default value is set at the entity level (Plant.cs) to avoid double-defaulting
        // and to preserve ETL merge precedence (Manual > Perenual > Trefle > GBIF).
        builder.Property(p => p.EnrichmentStatus)
            .HasConversion<int>();

        builder.Property(p => p.SoilPhMin).HasColumnType("decimal(4,2)");
        builder.Property(p => p.SoilPhMax).HasColumnType("decimal(4,2)");

        // ── Timestamps ──────────────────────────────────────────────────────────
        builder.Property(p => p.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(p => p.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // ── Relationships ───────────────────────────────────────────────────────
        builder.HasOne(p => p.PlantType)
            .WithMany()
            .HasForeignKey(p => p.PlantTypeId)
            .OnDelete(DeleteBehavior.Restrict); // Prevent cascade-deleting all plants when a type is removed.

        builder.HasMany(p => p.Translations)
            .WithOne(t => t.Plant)
            .HasForeignKey(t => t.PlantId)
            .OnDelete(DeleteBehavior.Cascade); // Translations are owned by the plant — delete together.

        // ── Indexes ─────────────────────────────────────────────────────────────
        // GbifTaxonKey is the global canonical id — only enforce uniqueness on rows
        // that have one, since most plants are seeded without it initially.
        builder.HasIndex(p => p.GbifTaxonKey)
            .IsUnique()
            .HasFilter("\"GbifTaxonKey\" IS NOT NULL");

        builder.HasIndex(p => p.Family);
        builder.HasIndex(p => p.Genus);
        builder.HasIndex(p => p.EnrichmentStatus);
    }
}
