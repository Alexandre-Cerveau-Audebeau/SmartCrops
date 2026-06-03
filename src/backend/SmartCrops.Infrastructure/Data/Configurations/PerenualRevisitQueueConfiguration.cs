using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

/// <summary>
/// EF Core mapping for <see cref="PerenualRevisitQueue"/> (SMA-103). Mirrors the
/// <see cref="PerenualRawCache"/> column widths for <c>Endpoint</c>/<c>ResourceId</c>
/// and shares its idempotent <c>(Endpoint, ResourceId)</c> unique key — here the key
/// the transient-enqueue upserts on. No foreign key to the raw cache (a transient
/// failure writes no cache row, so there is nothing to reference) and no extra index
/// beyond the unique constraint (the drain filters
/// <c>Endpoint = @e AND ResolvedAt IS NULL</c> over a tiny set; a partial index is
/// premature — SMA-75/95). Auto-discovered via <c>ApplyConfigurationsFromAssembly</c>.
/// </summary>
public class PerenualRevisitQueueConfiguration : IEntityTypeConfiguration<PerenualRevisitQueue>
{
    public void Configure(EntityTypeBuilder<PerenualRevisitQueue> builder)
    {
        builder.HasKey(q => q.Id);

        builder.Property(q => q.Endpoint).IsRequired().HasMaxLength(50);
        builder.Property(q => q.ResourceId).IsRequired().HasMaxLength(100);
        builder.Property(q => q.Attempts).IsRequired().HasDefaultValue(0);
        builder.Property(q => q.LastHttpStatus);
        builder.Property(q => q.LastError);
        builder.Property(q => q.FirstSeenAt).IsRequired();
        builder.Property(q => q.LastAttemptAt).IsRequired();
        builder.Property(q => q.ResolvedAt);

        // Idempotent enqueue key: one queue row per (endpoint, resource).
        builder.HasIndex(q => new { q.Endpoint, q.ResourceId }).IsUnique();

        // Attempts is a monotonic counter — guard against a negative at the DB.
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_PerenualRevisitQueue_Attempts_NonNegative", "\"Attempts\" >= 0"));
    }
}
