using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

public class GardenConfiguration : IEntityTypeConfiguration<Garden>
{
    public void Configure(EntityTypeBuilder<Garden> builder)
    {
        builder.HasKey(g => g.Id);
        builder.Property(g => g.Name).IsRequired().HasMaxLength(100);
        builder.Property(g => g.Description).HasMaxLength(500);
        builder.Property(g => g.UserId).IsRequired().HasMaxLength(450);
        builder.HasIndex(g => g.UserId);

        builder.Property(g => g.CellSize).HasMaxLength(10);

        // ── Location (SMA-336 PR 3a/5) ──────────────────────────────────────
        // Lengths of the three text columns, and the invariants the database
        // enforces on the coordinates: each in its range, and NEVER one without
        // the other — a latitude alone is not half a place. All three are
        // NULL-tolerant (NULL is « not located »), so existing rows are
        // unaffected, as with the Plants range checks.
        builder.Property(g => g.LocationName).HasMaxLength(120);
        builder.Property(g => g.LocationRegion).HasMaxLength(120);
        builder.Property(g => g.LocationCountry).HasMaxLength(80);

        builder.ToTable("Gardens", t =>
        {
            t.HasCheckConstraint(
                "CK_Gardens_Latitude_Range",
                "\"Latitude\" IS NULL OR (\"Latitude\" >= -90 AND \"Latitude\" <= 90)");
            t.HasCheckConstraint(
                "CK_Gardens_Longitude_Range",
                "\"Longitude\" IS NULL OR (\"Longitude\" >= -180 AND \"Longitude\" <= 180)");
            t.HasCheckConstraint(
                "CK_Gardens_Location_Pair",
                "(\"Latitude\" IS NULL) = (\"Longitude\" IS NULL)");
        });

        builder.Property(g => g.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(g => g.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(g => g.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
