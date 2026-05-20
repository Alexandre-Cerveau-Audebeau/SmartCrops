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

        // ── Perenual Supreme xData columns (Sprint 1.5 PR B) ────────────────
        // Scalar columns (10).
        builder.Property(p => p.XWateringBasedTempMinC);
        builder.Property(p => p.XWateringBasedTempMaxC);

        builder.Property(p => p.XWateringPhMin).HasPrecision(4, 2);
        builder.Property(p => p.XWateringPhMax).HasPrecision(4, 2);

        builder.Property(p => p.XSunlightHoursMin);
        builder.Property(p => p.XSunlightHoursMax);

        builder.Property(p => p.XTemperatureToleranceMinC);
        builder.Property(p => p.XTemperatureToleranceMaxC);

        builder.Property(p => p.XPlantSpacingValue);
        builder.Property(p => p.XPlantSpacingUnit).HasMaxLength(20);

        // jsonb columns (2).
        builder.Property(p => p.XWateringQualityJson).HasColumnType("jsonb");
        builder.Property(p => p.XWateringPeriodJson).HasColumnType("jsonb");

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

        // Perenual xData domain/range CHECK constraints — all NULL-tolerant
        // (columns are optional). Quoting follows PlantConfiguration's escaped
        // double-quote convention. See Sprint 1.5 PR B.
        builder.ToTable("PlantPerenualData", t =>
        {
            t.HasCheckConstraint(
                "CK_PlantPerenualData_XWateringBasedTemp_Range",
                "\"XWateringBasedTempMinC\" IS NULL OR \"XWateringBasedTempMinC\" BETWEEN -50 AND 60");
            t.HasCheckConstraint(
                "CK_PlantPerenualData_XWateringBasedTempMax_Range",
                "\"XWateringBasedTempMaxC\" IS NULL OR \"XWateringBasedTempMaxC\" BETWEEN -50 AND 60");
            t.HasCheckConstraint(
                "CK_PlantPerenualData_XWateringBasedTemp_Order",
                "\"XWateringBasedTempMinC\" IS NULL OR \"XWateringBasedTempMaxC\" IS NULL OR \"XWateringBasedTempMinC\" <= \"XWateringBasedTempMaxC\"");

            t.HasCheckConstraint(
                "CK_PlantPerenualData_XWateringPh_Range",
                "\"XWateringPhMin\" IS NULL OR (\"XWateringPhMin\" >= 0 AND \"XWateringPhMin\" <= 14)");
            t.HasCheckConstraint(
                "CK_PlantPerenualData_XWateringPhMax_Range",
                "\"XWateringPhMax\" IS NULL OR (\"XWateringPhMax\" >= 0 AND \"XWateringPhMax\" <= 14)");
            t.HasCheckConstraint(
                "CK_PlantPerenualData_XWateringPh_Order",
                "\"XWateringPhMin\" IS NULL OR \"XWateringPhMax\" IS NULL OR \"XWateringPhMin\" <= \"XWateringPhMax\"");

            t.HasCheckConstraint(
                "CK_PlantPerenualData_XSunlightHours_Range",
                "\"XSunlightHoursMin\" IS NULL OR \"XSunlightHoursMin\" BETWEEN 0 AND 24");
            t.HasCheckConstraint(
                "CK_PlantPerenualData_XSunlightHoursMax_Range",
                "\"XSunlightHoursMax\" IS NULL OR \"XSunlightHoursMax\" BETWEEN 0 AND 24");

            t.HasCheckConstraint(
                "CK_PlantPerenualData_XTemperatureTolerance_Range",
                "\"XTemperatureToleranceMinC\" IS NULL OR \"XTemperatureToleranceMinC\" BETWEEN -50 AND 60");
            t.HasCheckConstraint(
                "CK_PlantPerenualData_XTemperatureToleranceMax_Range",
                "\"XTemperatureToleranceMaxC\" IS NULL OR \"XTemperatureToleranceMaxC\" BETWEEN -50 AND 60");
            t.HasCheckConstraint(
                "CK_PlantPerenualData_XTemperatureTolerance_Order",
                "\"XTemperatureToleranceMinC\" IS NULL OR \"XTemperatureToleranceMaxC\" IS NULL OR \"XTemperatureToleranceMinC\" <= \"XTemperatureToleranceMaxC\"");

            t.HasCheckConstraint(
                "CK_PlantPerenualData_XPlantSpacing_Positive",
                "\"XPlantSpacingValue\" IS NULL OR \"XPlantSpacingValue\" >= 0");
        });
    }
}
