using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantImageConfiguration : IEntityTypeConfiguration<PlantImage>
{
    public void Configure(EntityTypeBuilder<PlantImage> builder)
    {
        builder.HasKey(i => i.Id);

        // Image URLs must be non-blank — a row pointing nowhere is unusable.
        builder.ToTable("PlantImages", t =>
            t.HasCheckConstraint(
                "CK_PlantImage_Url_NotBlank",
                "btrim(\"Url\") <> ''"));

        builder.HasOne(i => i.Plant)
            .WithMany(p => p.Images)
            .HasForeignKey(i => i.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(i => i.ImageType)
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(i => i.Source)
            .HasConversion<string>()
            .HasMaxLength(20);

        // S3 pre-signed URLs include long signature query strings.
        builder.Property(i => i.Url)
            .IsRequired()
            .HasMaxLength(1000);
        builder.Property(i => i.ThumbnailUrl).HasMaxLength(1000);

        builder.Property(i => i.LicenseName).HasMaxLength(150);
        builder.Property(i => i.LicenseUrl).HasMaxLength(500);
        builder.Property(i => i.Credit).HasMaxLength(300);
        builder.Property(i => i.SourceExternalId).HasMaxLength(100);

        builder.Property(i => i.DisplayOrder).HasDefaultValue(0);
        builder.Property(i => i.IsFlagged).HasDefaultValue(false);

        builder.Property(i => i.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(i => i.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Drives the per-plant gallery query order.
        builder.HasIndex(i => new { i.PlantId, i.ImageType, i.DisplayOrder });
        // Enforce idempotency for sourced images: a given (PlantId, Source, SourceExternalId)
        // tuple can only exist once, preventing duplicates from ETL retries or concurrent imports.
        // Filtered to allow images without an external id (e.g. manually uploaded).
        builder.HasIndex(i => new { i.PlantId, i.Source, i.SourceExternalId })
            .IsUnique()
            .HasFilter("\"SourceExternalId\" IS NOT NULL");
    }
}
