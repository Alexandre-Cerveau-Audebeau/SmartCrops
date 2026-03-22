using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantTranslationConfiguration : IEntityTypeConfiguration<PlantTranslation>
{
    public void Configure(EntityTypeBuilder<PlantTranslation> builder)
    {
        builder.HasKey(t => t.Id);

        builder.Property(t => t.Language)
            .IsRequired()
            .HasMaxLength(5); // ISO 639-1 ("en") or BCP 47 tag ("zh-TW") — 5 chars covers both.

        builder.Property(t => t.CommonName)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(t => t.Description).HasMaxLength(2000);

        // Core i18n constraint: one translation per language per plant.
        // EF translates this to a UNIQUE INDEX on (plant_id, language).
        builder.HasIndex(t => new { t.PlantId, t.Language })
            .IsUnique();
    }
}
