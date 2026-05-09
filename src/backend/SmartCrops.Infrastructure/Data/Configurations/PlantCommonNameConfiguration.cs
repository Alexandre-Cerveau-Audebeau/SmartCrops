using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantCommonNameConfiguration : IEntityTypeConfiguration<PlantCommonName>
{
    public void Configure(EntityTypeBuilder<PlantCommonName> builder)
    {
        builder.HasKey(c => c.Id);

        // A common name with no text is meaningless — block at the DB level.
        builder.ToTable("PlantCommonNames", t =>
        {
            t.HasCheckConstraint(
                "CK_PlantCommonName_Name_NotBlank",
                "btrim(\"Name\") <> ''");

            // Block empty/whitespace LanguageCode to preserve (PlantId, LanguageCode) key semantics.
            t.HasCheckConstraint(
                "CK_PlantCommonName_LanguageCode_NotBlank",
                "btrim(\"LanguageCode\") <> ''");
        });

        builder.HasOne(c => c.Plant)
            .WithMany(p => p.CommonNames)
            .HasForeignKey(c => c.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        // BCP 47 tags can include script + region + variant subtags (e.g. "zh-Hant", "sr-Latn-RS").
        // RFC 5646 allows each subtag up to 8 chars with no overall limit; 35 covers practical cases.
        builder.Property(c => c.LanguageCode)
            .IsRequired()
            .HasMaxLength(35);

        builder.Property(c => c.Name)
            .IsRequired()
            .HasMaxLength(150);

        builder.Property(c => c.IsPrimary).HasDefaultValue(false);

        builder.Property(c => c.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Both indexes intentionally non-unique: a plant can have multiple common
        // names per language (e.g. "tomato" and "love apple" in EN), and the same
        // common name can apply to multiple plants across languages.
        builder.HasIndex(c => new { c.PlantId, c.LanguageCode });

        // Enforce at most one primary common name per (plant, language) at the DB level.
        builder.HasIndex(c => new { c.PlantId, c.LanguageCode })
            .HasFilter("\"IsPrimary\" = TRUE")
            .IsUnique();

        builder.HasIndex(c => c.Name);
    }
}
