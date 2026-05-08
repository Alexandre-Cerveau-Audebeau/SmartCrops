using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantLongDescriptionConfiguration : IEntityTypeConfiguration<PlantLongDescription>
{
    public void Configure(EntityTypeBuilder<PlantLongDescription> builder)
    {
        builder.HasKey(d => d.Id);

        builder.ToTable("PlantLongDescriptions", t =>
        {
            // Enforce ISO 639-1 lowercase letters; rejects invalid codes like "e1" or "EN".
            t.HasCheckConstraint("CK_PlantLongDescription_Language", "\"Language\" ~ '^[a-z]{2}$'");

            // Block empty/whitespace descriptions — a row with no content is useless.
            t.HasCheckConstraint(
                "CK_PlantLongDescription_LongDescription_NotBlank",
                "btrim(\"LongDescription\") <> ''");
        });

        builder.HasOne(d => d.Plant)
            .WithMany(p => p.LongDescriptions)
            .HasForeignKey(d => d.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        // ISO 639-1 language tag, fixed 2 characters → CHAR(2).
        builder.Property(d => d.Language)
            .IsRequired()
            .HasMaxLength(2)
            .IsFixedLength();

        // Long-form description has no upper bound — store as TEXT.
        builder.Property(d => d.LongDescription)
            .IsRequired()
            .HasColumnType("text");

        builder.Property(d => d.SourceMethod).HasMaxLength(50);

        builder.Property(d => d.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(d => d.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // One long description per plant per language.
        builder.HasIndex(d => new { d.PlantId, d.Language }).IsUnique();
    }
}
