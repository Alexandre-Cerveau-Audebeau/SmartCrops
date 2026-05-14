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

            // BCP 47 structural validation of LanguageCode, in lowercase form to match
            // the ToLowerInvariant value converter below. Rejects malformed tags like
            // "francais", "FR_US", "" or "fr fr" at the persistence boundary. This regex
            // strictly subsumes the former CK_PlantCommonName_LanguageCode_NotBlank check
            // (any value matching the pattern is necessarily non-blank), so that
            // constraint is replaced rather than kept alongside.
            //   [a-z]{2,3}              ISO 639-1/639-3 language subtag (mandatory)
            //   (-[a-z]{4})?            optional script subtag (-hant, -latn)
            //   (-([a-z]{2}|[0-9]{3}))? optional region subtag (-us, or -419)
            // Uses the case-sensitive ~ operator (not ~*) because storage is guaranteed
            // lowercase by the value converter.
            t.HasCheckConstraint(
                "CK_PlantCommonName_LanguageCode_Bcp47",
                "\"LanguageCode\" ~ '^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?$'");
        });

        builder.HasOne(c => c.Plant)
            .WithMany(p => p.CommonNames)
            .HasForeignKey(c => c.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        // BCP 47 tags can include script + region + variant subtags (e.g. "zh-Hant", "sr-Latn-RS").
        // RFC 5646 allows each subtag up to 8 chars with no overall limit; 35 covers practical cases.
        // BCP 47 also defines tags as case-insensitive — normalize to lowercase on write
        // so the partial unique index (PlantId, LanguageCode) WHERE IsPrimary = TRUE actually
        // enforces uniqueness regardless of how the caller cased the tag.
        builder.Property(c => c.LanguageCode)
            .IsRequired()
            .HasMaxLength(35)
            .HasConversion(
                v => v.ToLowerInvariant(),
                v => v);

        builder.Property(c => c.Name)
            .IsRequired()
            .HasMaxLength(150);

        builder.Property(c => c.IsPrimary).HasDefaultValue(false);

        builder.Property(c => c.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Single-column PlantId index: covers the FK back to Plant for cascade delete
        // and for general "load all common names for a plant" queries. The previous
        // (PlantId, LanguageCode) composite was collapsed by EF onto the filtered
        // partial unique below (same column tuple), so it never produced a separate
        // unfiltered DB index — leaving cascade delete with no usable index.
        builder.HasIndex(c => c.PlantId);

        // Enforce at most one primary common name per (plant, language) at the DB level.
        // A plant can still have multiple non-primary names per language (e.g. "tomato"
        // and "love apple" in EN); only one of them may carry IsPrimary = TRUE.
        builder.HasIndex(c => new { c.PlantId, c.LanguageCode })
            .HasFilter("\"IsPrimary\" = TRUE")
            .IsUnique();

        builder.HasIndex(c => c.Name);
    }
}
