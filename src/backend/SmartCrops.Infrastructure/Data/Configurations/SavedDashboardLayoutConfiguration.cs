using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

/// <summary>
/// SMA-448, lot F1 — EF Core mapping for <see cref="SavedDashboardLayout"/>,
/// the archive of the layouts of the formulas an account is not on. One row
/// per (account, formula): the unique index on the pair is what enforces it,
/// and it also serves every lookup by account, its leading column. Deleted
/// with the account, like <c>UserDashboardPreferences</c>: a layout is a
/// convenience, not data the user would want kept without its account.
/// Auto-discovered via <c>ApplyConfigurationsFromAssembly</c>.
/// </summary>
public class SavedDashboardLayoutConfiguration : IEntityTypeConfiguration<SavedDashboardLayout>
{
    public void Configure(EntityTypeBuilder<SavedDashboardLayout> builder)
    {
        builder.HasKey(l => l.Id);

        builder.Property(l => l.UserId).IsRequired().HasMaxLength(450);
        builder.Property(l => l.Formula).IsRequired().HasMaxLength(20);
        builder.HasIndex(l => new { l.UserId, l.Formula }).IsUnique();

        // jsonb, as in the current row: PostgreSQL refuses a document that
        // does not parse, so the archive can never hold one.
        builder.Property(l => l.LayoutJson).IsRequired().HasColumnType("jsonb");

        builder.Property(l => l.SchemaVersion).IsRequired();

        builder.Property(l => l.UpdatedAt)
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(l => l.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.ToTable("SavedDashboardLayouts", t => t.HasCheckConstraint(
            "CK_SavedDashboardLayouts_Formula",
            "\"Formula\" IN ('novice', 'gardener', 'expert')"));
    }
}
