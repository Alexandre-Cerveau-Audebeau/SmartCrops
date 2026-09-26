using Microsoft.AspNetCore.Identity;
using SmartCrops.Core.Dashboard;

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

    // ── Default location (SMA-336 PR 3a/5) ──────────────────────────────────
    // The account's DEFAULT place: every garden that carries no location of its
    // own inherits it at READ time (GeoLocation.From(garden) ?? GeoLocation
    // .From(user), ADR-0006), so « one city is enough for all your gardens »
    // costs one row, never a copy per garden — and a garden created tomorrow
    // is located the day it exists. Six nullable columns, no defaults, mirror
    // of Garden.Location*; NULL everywhere is « no default ».
    //
    // Deliberately UNRELATED to City: that field is the profile's free text,
    // edited on the profile page, and nothing here reads or clears it. Lengths
    // and the range / pair CHECK constraints live in ApplicationUserConfiguration.

    /// <summary>Normalized place name as the geocoder returned it (« Lyon »).</summary>
    public string? LocationName { get; set; }

    /// <summary>Region or state (« Auvergne-Rhône-Alpes »).</summary>
    public string? LocationRegion { get; set; }

    /// <summary>Country NAME as the geocoder returned it — never an ISO code.</summary>
    public string? LocationCountry { get; set; }

    /// <summary>
    /// Decimal degrees, −90..90 (<c>CK_AspNetUsers_Latitude_Range</c>). Set and
    /// cleared TOGETHER with <see cref="Longitude"/> (<c>CK_AspNetUsers_Location_Pair</c>).
    /// </summary>
    public double? Latitude { get; set; }

    /// <summary>Decimal degrees, −180..180 (<c>CK_AspNetUsers_Longitude_Range</c>).</summary>
    public double? Longitude { get; set; }

    /// <summary>UTC instant the default was resolved (ADR-0001); stamped explicitly by the writer.</summary>
    public DateTime? LocationResolvedAt { get; set; }

    // ── Formula (SMA-448, lot F1) ───────────────────────────────────────────
    // The account's formula is a RIGHT, not a display preference (contract v3,
    // R1 and R8): it decides what the account MAY do, and the server checks it.
    // It lives here rather than in the dashboard layout document, where a
    // client could write any level it liked and an unreadable document lost it
    // (pre-flight § C.1 a, decided by Alexandre on 26/09). One of the three
    // levels, never null (CK_AspNetUsers_Formula), 'gardener' by default — the
    // level every account read before the formulas existed.

    /// <summary>The account's formula: <c>novice</c>, <c>gardener</c> or <c>expert</c>.</summary>
    public string Formula { get; set; } = DashboardLayout.Levels.Gardener;

    /// <summary>
    /// UTC instant of the account's last DELIBERATE choice of formula; null
    /// until it makes one — the migration gives every existing account its
    /// effective level and leaves this null, so the choice screen still shows
    /// once (pre-flight § C.6 a, question 1).
    /// </summary>
    public DateTime? FormulaChosenAt { get; set; }
}
