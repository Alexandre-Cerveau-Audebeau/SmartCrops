using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

/// <summary>
/// SMA-448, lot F1 — the archive of the dashboard layouts of the formulas an
/// account is NOT on: one row per (account, formula), unique. Changing formula
/// moves the current layout here under the formula it leaves, and brings the
/// archived layout of the formula it enters back into the current row — so a
/// switch, in either direction, loses nothing (contract v3, V4).
///
/// <para>A table of its own rather than a second row in
/// <see cref="UserDashboardPreferences"/> (pre-flight § C.3 c): the current
/// row stays one per account, as the image before the formulas reads it —
/// migrations apply at boot and a rollback of the image does not roll the
/// schema back. The document is stored VERBATIM, schema version included, as
/// the current row held it.</para>
/// </summary>
public class SavedDashboardLayout : IHasUpdatedAt
{
    public Guid Id { get; set; }

    /// <summary>Owner; cascade-deleted with the account, like the current row.</summary>
    public required string UserId { get; set; }

    /// <summary>The formula this layout belongs to (CK_SavedDashboardLayouts_Formula).</summary>
    public required string Formula { get; set; }

    /// <summary>The layout document, jsonb, exactly as the current row held it.</summary>
    public required string LayoutJson { get; set; }

    /// <summary>The schema version the document was written under.</summary>
    public int SchemaVersion { get; set; }

    /// <summary>UTC timestamp of the last archive, refreshed by <c>UpdateTimestampInterceptor</c>.</summary>
    public DateTime UpdatedAt { get; set; }
}
