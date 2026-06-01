using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

/// <summary>
/// EF Core mapping for <see cref="PerenualRawCache"/> (SMA-93): a standalone,
/// shape-agnostic raw cache. <c>(Endpoint, ResourceId)</c> is the unique key the
/// idempotent capture upserts on; the verbatim redacted body is jsonb.
/// Auto-discovered via <c>ApplyConfigurationsFromAssembly</c>.
/// </summary>
public class PerenualRawCacheConfiguration : IEntityTypeConfiguration<PerenualRawCache>
{
    public void Configure(EntityTypeBuilder<PerenualRawCache> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.Endpoint).IsRequired().HasMaxLength(50);
        builder.Property(c => c.ResourceId).IsRequired().HasMaxLength(100);
        builder.Property(c => c.RawJson).HasColumnType("jsonb");
        builder.Property(c => c.HttpStatus).IsRequired();
        builder.Property(c => c.FetchedAt).IsRequired();

        // Idempotent capture key: one row per (endpoint, resource).
        builder.HasIndex(c => new { c.Endpoint, c.ResourceId }).IsUnique();
    }
}
