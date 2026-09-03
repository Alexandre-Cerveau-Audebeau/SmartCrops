using Microsoft.AspNetCore.Identity;

namespace SmartCrops.Core.Entities;

public class ApplicationUser : IdentityUser
{
    public string? DisplayName { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? City { get; set; }

    /// <summary>
    /// SMA-414 (D1) — UTC instant the account was created, stamped explicitly
    /// by every creation path (Register, Google callback). Nullable on purpose:
    /// accounts that predate migration 30 (<c>AddUserCreatedAt</c>) keep
    /// <c>null</c> — no default, no backfill. The admin dashboard shows them as
    /// "registered before the migration", excludes them from the 7/30-day
    /// counters and sorts them last.
    /// </summary>
    public DateTime? CreatedAt { get; set; }
}
