using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class PlantPhaseConfiguration : IEntityTypeConfiguration<PlantPhase>
{
    public void Configure(EntityTypeBuilder<PlantPhase> builder)
    {
        builder.HasKey(ph => ph.Id);

        // CHECK constraints belong on the table — guard against bad data even when
        // it bypasses the application layer (raw SQL, manual edits, etc.).
        builder.ToTable("PlantPhases", t =>
        {
            t.HasCheckConstraint("CK_PlantPhase_StartMonth", "\"StartMonth\" BETWEEN 1 AND 12");
            t.HasCheckConstraint("CK_PlantPhase_EndMonth", "\"EndMonth\" BETWEEN 1 AND 12");
        });

        builder.HasOne(ph => ph.Plant)
            .WithMany(p => p.Phases)
            .HasForeignKey(ph => ph.PlantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(ph => ph.PhaseType)
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(ph => ph.Notes).HasMaxLength(500);

        builder.Property(ph => ph.NotesLanguage)
            .HasMaxLength(2)
            .IsFixedLength();

        builder.Property(ph => ph.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(ph => ph.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        builder.HasIndex(ph => new { ph.PlantId, ph.PhaseType });
    }
}
