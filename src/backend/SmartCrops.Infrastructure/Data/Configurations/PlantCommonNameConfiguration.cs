using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantCommonNameConfiguration : IEntityTypeConfiguration<PlantCommonName>
{
    public void Configure(EntityTypeBuilder<PlantCommonName> builder)
    {
        builder.HasKey(c => c.Id);

        builder.HasOne(c => c.Plant)
            .WithMany(p => p.CommonNames)
            .HasForeignKey(c => c.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        // Up to 5 chars to accommodate BCP 47-style tags (e.g. "pt-BR").
        builder.Property(c => c.LanguageCode)
            .IsRequired()
            .HasMaxLength(5);

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
        builder.HasIndex(c => c.Name);
    }
}
