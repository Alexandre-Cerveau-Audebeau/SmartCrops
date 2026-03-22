using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantTypeConfiguration : IEntityTypeConfiguration<PlantType>
{
    public void Configure(EntityTypeBuilder<PlantType> builder)
    {
        builder.HasKey(t => t.Id);

        builder.Property(t => t.Name)
            .IsRequired()
            .HasMaxLength(50);

        builder.Property(t => t.Description).HasMaxLength(500);

        // Seed data uses explicit IDs so future migrations can reference them as stable
        // foreign key values (e.g. PlantTypeId = 1 always means "Vegetable").
        builder.HasData(
            new PlantType { Id = 1, Name = "Vegetable" },
            new PlantType { Id = 2, Name = "Fruit" },
            new PlantType { Id = 3, Name = "Herb" },
            new PlantType { Id = 4, Name = "Ornamental" },
            new PlantType { Id = 5, Name = "Medicinal" }
        );
    }
}
