using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantSynonymConfiguration : IEntityTypeConfiguration<PlantSynonym>
{
    public void Configure(EntityTypeBuilder<PlantSynonym> builder)
    {
        builder.HasKey(s => s.Id);

        // Synonyms drive scientific name matching during ETL — blank values are useless
        // and would create false matches against legitimate empty-string queries.
        builder.ToTable("PlantSynonyms", t =>
            t.HasCheckConstraint(
                "CK_PlantSynonym_Synonym_NotBlank",
                "btrim(\"Synonym\") <> ''"));

        builder.HasOne(s => s.Plant)
            .WithMany(p => p.Synonyms)
            .HasForeignKey(s => s.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(s => s.Synonym)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(s => s.Authority).HasMaxLength(200);

        builder.Property(s => s.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(s => s.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Supports fuzzy lookup of upstream records during ETL.
        builder.HasIndex(s => s.Synonym);

        // No duplicate synonyms per plant.
        builder.HasIndex(s => new { s.PlantId, s.Synonym }).IsUnique();
    }
}
