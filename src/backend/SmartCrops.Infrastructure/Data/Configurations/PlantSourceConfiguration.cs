using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantSourceConfiguration : IEntityTypeConfiguration<PlantSource>
{
    public void Configure(EntityTypeBuilder<PlantSource> builder)
    {
        builder.HasKey(s => s.Id);

        builder.HasOne(s => s.Plant)
            .WithMany(p => p.Sources)
            .HasForeignKey(s => s.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(s => s.SourceType)
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(s => s.ExternalId)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(s => s.Url).HasMaxLength(1000);
        builder.Property(s => s.Notes).HasMaxLength(500);

        builder.Property(s => s.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(s => s.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Lookup all sources of a given kind for a plant (e.g. "Trefle entries for X").
        builder.HasIndex(s => new { s.PlantId, s.SourceType });
        // Reverse lookup: given an upstream id, find linked plant(s) during ETL.
        // NOT unique on purpose: scientific synonyms (e.g. Matricaria chamomilla and
        // Matricaria recutita both pointing to the same Trefle slug) can legitimately
        // share an external id. Per-source uniqueness is enforced in PlantTrefleData
        // and PlantPerenualData via PlantId.
        builder.HasIndex(s => new { s.SourceType, s.ExternalId });
    }
}
