using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

/// <summary>
/// EF Core mapping for <see cref="PerenualPestCatalog"/> (SMA-71 PR2): a
/// standalone global reference table, NOT 1-1 with Plant. <c>PerenualPestId</c>
/// is the unique natural key (idempotent harvest upsert); the verbatim redacted
/// body is jsonb. Auto-discovered via <c>ApplyConfigurationsFromAssembly</c>.
/// </summary>
public class PerenualPestCatalogConfiguration : IEntityTypeConfiguration<PerenualPestCatalog>
{
    public void Configure(EntityTypeBuilder<PerenualPestCatalog> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.PerenualPestId).IsRequired();
        builder.HasIndex(p => p.PerenualPestId).IsUnique();

        builder.Property(p => p.CommonName).HasMaxLength(200);
        builder.Property(p => p.ScientificName).HasMaxLength(200);

        builder.Property(p => p.LiteralResponseJson).HasColumnType("jsonb");

        builder.Property(p => p.FetchedAt).IsRequired();

        builder.Property(p => p.CreatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
        builder.Property(p => p.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");
    }
}
