using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

/// <summary>
/// SMA-336 — EF Core mapping for <see cref="UserDashboardPreferences"/>. One row
/// per user: the unique index on <c>UserId</c> is what enforces the 1–1, and the
/// cascade delete ties the row's lifetime to the account (unlike
/// <c>GardenConfiguration</c>, which restricts, because a garden is data the user
/// would want to keep, whereas a dashboard layout is not).
/// Auto-discovered via <c>ApplyConfigurationsFromAssembly</c>.
/// </summary>
public class UserDashboardPreferencesConfiguration : IEntityTypeConfiguration<UserDashboardPreferences>
{
    public void Configure(EntityTypeBuilder<UserDashboardPreferences> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.UserId).IsRequired().HasMaxLength(450);
        builder.HasIndex(p => p.UserId).IsUnique();

        // jsonb, not text: PostgreSQL then refuses a syntactically invalid document
        // at the storage layer, so a corrupt layout cannot be persisted at all.
        builder.Property(p => p.LayoutJson).HasColumnType("jsonb");

        builder.Property(p => p.SchemaVersion).IsRequired();

        builder.Property(p => p.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
