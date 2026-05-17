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

        // Range and domain CHECK constraints — all NULL-tolerant since the columns are
        // optional. Backfill of existing rows is unaffected (NULL bypasses each check).
        builder.ToTable("Plants", t =>
        {
            t.HasCheckConstraint(
                "CK_Plants_HardinessZone_Range",
                "\"HardinessZoneMin\" IS NULL OR \"HardinessZoneMax\" IS NULL OR \"HardinessZoneMin\" <= \"HardinessZoneMax\"");

            // Height and Spread are physical sizes — negative values are nonsensical
            // and almost always indicate a unit-conversion bug upstream. Reject them
            // at the DB boundary in addition to the min<=max ordering.
            t.HasCheckConstraint(
                "CK_Plants_Height_Range",
                "(\"MinHeightCm\" IS NULL OR \"MinHeightCm\" >= 0) AND " +
                "(\"MaxHeightCm\" IS NULL OR \"MaxHeightCm\" >= 0) AND " +
                "(\"MinHeightCm\" IS NULL OR \"MaxHeightCm\" IS NULL OR \"MinHeightCm\" <= \"MaxHeightCm\")");

            t.HasCheckConstraint(
                "CK_Plants_Spread_Range",
                "(\"MinSpreadCm\" IS NULL OR \"MinSpreadCm\" >= 0) AND " +
                "(\"MaxSpreadCm\" IS NULL OR \"MaxSpreadCm\" >= 0) AND " +
                "(\"MinSpreadCm\" IS NULL OR \"MaxSpreadCm\" IS NULL OR \"MinSpreadCm\" <= \"MaxSpreadCm\")");

            t.HasCheckConstraint(
                "CK_Plants_Temperature_Range",
                "\"MinTempC\" IS NULL OR \"MaxTempC\" IS NULL OR \"MinTempC\" <= \"MaxTempC\"");

            // Soil pH must stay in 0..14 and respect min<=max.
            t.HasCheckConstraint(
                "CK_Plants_SoilPh_Range",
                "(\"SoilPhMin\" IS NULL OR \"SoilPhMin\" BETWEEN 0 AND 14) AND (\"SoilPhMax\" IS NULL OR \"SoilPhMax\" BETWEEN 0 AND 14) AND (\"SoilPhMin\" IS NULL OR \"SoilPhMax\" IS NULL OR \"SoilPhMin\" <= \"SoilPhMax\")");

            // Light level uses Trefle's 0-10 scale; 1-10 here aligns with the
            // "any sunlight at all" floor we treat as a known value.
            t.HasCheckConstraint(
                "CK_Plants_LightLevel_Range",
                "\"LightLevel\" IS NULL OR \"LightLevel\" BETWEEN 1 AND 10");

            // SoilNutriments uses Trefle's 0-10 scale; 0 = depleted soil tolerated.
            t.HasCheckConstraint(
                "CK_Plants_SoilNutriments_Range",
                "\"SoilNutriments\" IS NULL OR \"SoilNutriments\" BETWEEN 0 AND 10");

            // Publication year (GBIF taxonomy). 1700 floor covers pre-Linnaean
            // outliers without admitting obvious data errors; current year ceiling
            // is mutable via EXTRACT so the constraint stays correct across years
            // without needing a fresh migration.
            t.HasCheckConstraint(
                "CK_Plants_Year_Range",
                "\"Year\" IS NULL OR (\"Year\" BETWEEN 1700 AND EXTRACT(YEAR FROM CURRENT_DATE)::INT)");

            // Temperature bounds (existing _Range only enforced ordering).
            // -50..60 °C covers every reasonable horticultural species and rejects
            // unit-of-measure bugs (Fahrenheit values fed as Celsius land outside).
            t.HasCheckConstraint(
                "CK_Plants_Temperature_Bounds",
                "(\"MinTempC\" IS NULL OR \"MinTempC\" BETWEEN -50 AND 60) AND " +
                "(\"MaxTempC\" IS NULL OR \"MaxTempC\" BETWEEN -50 AND 60)");

            // USDA hardiness zone bounds (existing _Range only enforced ordering).
            // 1..13 is the canonical USDA scale (1 = arctic, 13 = tropical).
            t.HasCheckConstraint(
                "CK_Plants_HardinessZone_Bounds",
                "(\"HardinessZoneMin\" IS NULL OR \"HardinessZoneMin\" BETWEEN 1 AND 13) AND " +
                "(\"HardinessZoneMax\" IS NULL OR \"HardinessZoneMax\" BETWEEN 1 AND 13)");
        });

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

        // WfoId is the World Flora Online cross-reference; denormalized from
        // PlantTrefleData per ADR-0003 so the canonical read model carries the id.
        builder.Property(p => p.WfoId).HasMaxLength(50);

        // ── Canonical READ MODEL ────────────────────────────────────────────────
        // Enums are stored as strings so changing numeric values upstream doesn't
        // silently corrupt rows; the max length covers the longest variant name.
        builder.Property(p => p.LifeCycle).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.GrowthRate).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.WateringNeedLevel).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.CareLevel).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.GrowthHabit).HasConversion<string>().HasMaxLength(20);

        // ── Trefle structured + Perenual descriptive (added in PR #57) ──────────
        // JSON-bearing strings are left unbounded text — the natural shape is small
        // (arrays of short labels / TDWG codes) but JSON metadata can grow.
        // SowingInstructions / PropagationInstructions are capped at 2000 to keep
        // the Library payload reasonable on cold reads.
        builder.Property(p => p.SowingInstructions).HasMaxLength(2000);
        builder.Property(p => p.PropagationInstructions).HasMaxLength(2000);

        // EnrichmentStatus is [Flags] — store as int so bitwise combinations round-trip.
        // DB default and aggregate initializer agree on Manual: every plant created
        // without an explicit enrichment provenance (DataSeeder, admin panel, Suggest
        // Edit) was authored manually. None should only be reached as an explicit
        // downgrade by ETL pruning logic, never as the silent default for new rows.
        builder.Property(p => p.EnrichmentStatus)
            .HasConversion<int>()
            .HasDefaultValue(EnrichmentStatus.Manual);

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
