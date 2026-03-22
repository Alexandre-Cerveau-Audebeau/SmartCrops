using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantSuggestionConfiguration : IEntityTypeConfiguration<PlantSuggestion>
{
    public void Configure(EntityTypeBuilder<PlantSuggestion> builder)
    {
        builder.HasKey(s => s.Id);

        builder.Property(s => s.FieldName)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(s => s.Language).HasMaxLength(10);
        builder.Property(s => s.CurrentValue).HasMaxLength(2000);

        builder.Property(s => s.SuggestedValue)
            .IsRequired()
            .HasMaxLength(2000);

        builder.Property(s => s.Reason).HasMaxLength(1000);

        builder.Property(s => s.Status)
            .IsRequired()
            .HasMaxLength(20)
            .HasDefaultValue("Pending");

        builder.Property(s => s.UserId).HasMaxLength(200);
        builder.Property(s => s.ReviewedBy).HasMaxLength(200);

        // Primary query pattern: load all pending suggestions for a given plant,
        // or load all pending suggestions across the system for the moderation queue.
        builder.HasIndex(s => new { s.PlantId, s.Status });

        builder.HasOne(s => s.Plant)
            .WithMany(p => p.Suggestions)
            .HasForeignKey(s => s.PlantId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
