using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantPestConfiguration : IEntityTypeConfiguration<PlantPest>
{
    public void Configure(EntityTypeBuilder<PlantPest> builder)
    {
        builder.HasKey(p => p.Id);

        // A pest record with no name is meaningless — block at the DB level.
        builder.ToTable("PlantPests", t =>
            t.HasCheckConstraint(
                "CK_PlantPests_Name_NotBlank",
                "btrim(\"Name\") <> ''"));

        builder.HasOne(p => p.Plant)
            .WithMany(plant => plant.Pests)
            .HasForeignKey(p => p.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(p => p.Name)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(p => p.Type)
            .HasConversion<string>()
            .HasMaxLength(30);

        builder.Property(p => p.Description).HasMaxLength(2000);
        builder.Property(p => p.Symptoms).HasMaxLength(2000);
        builder.Property(p => p.Solutions).HasMaxLength(2000);
        builder.Property(p => p.ImageUrl).HasMaxLength(500);

        builder.Property(p => p.Source)
            .IsRequired()
            .HasMaxLength(50);

        builder.Property(p => p.SourceExternalId).HasMaxLength(100);

        builder.Property(p => p.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(p => p.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Cascade FK + moderation/queue scenarios benefit from PlantId + Type indexes.
        builder.HasIndex(p => p.PlantId);
        builder.HasIndex(p => p.Type);

        // ETL dedup: a given external id within a given source must be unique.
        // Null SourceExternalId means "manual entry, no upstream id" — multiple
        // such rows are allowed, hence the WHERE filter.
        builder.HasIndex(p => new { p.Source, p.SourceExternalId })
            .IsUnique()
            .HasFilter("\"SourceExternalId\" IS NOT NULL");
    }
}
