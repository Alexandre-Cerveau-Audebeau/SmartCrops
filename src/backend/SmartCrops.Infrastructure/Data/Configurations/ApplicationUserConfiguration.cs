using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data.Configurations;

/// <summary>
/// SMA-336 PR 3a/5 — EF Core mapping for the columns SmartCrops adds to
/// <see cref="ApplicationUser"/> on top of Identity's own. Identity maps
/// <c>AspNetUsers</c> in <c>IdentityDbContext.OnModelCreating</c>; this
/// configuration is applied AFTER it by <c>ApplyConfigurationsFromAssembly</c>
/// and only touches the account's default location (ADR-0006). The earlier
/// profile columns (<c>City</c>, <c>DisplayName</c>, …) keep their
/// convention-mapped <c>text</c> shape on purpose: changing them is a migration
/// with no reader behind it.
///
/// <para>The three CHECK constraints mirror <c>GardenConfiguration</c>'s, name
/// for name with the table swapped, so the two carriers of a location can
/// never diverge on what a valid coordinate pair is.</para>
/// </summary>
public class ApplicationUserConfiguration : IEntityTypeConfiguration<ApplicationUser>
{
    public void Configure(EntityTypeBuilder<ApplicationUser> builder)
    {
        builder.Property(u => u.LocationName).HasMaxLength(120);
        builder.Property(u => u.LocationRegion).HasMaxLength(120);
        builder.Property(u => u.LocationCountry).HasMaxLength(80);

        builder.ToTable("AspNetUsers", t =>
        {
            t.HasCheckConstraint(
                "CK_AspNetUsers_Latitude_Range",
                "\"Latitude\" IS NULL OR (\"Latitude\" >= -90 AND \"Latitude\" <= 90)");
            t.HasCheckConstraint(
                "CK_AspNetUsers_Longitude_Range",
                "\"Longitude\" IS NULL OR (\"Longitude\" >= -180 AND \"Longitude\" <= 180)");
            t.HasCheckConstraint(
                "CK_AspNetUsers_Location_Pair",
                "(\"Latitude\" IS NULL) = (\"Longitude\" IS NULL)");
        });
    }
}
