using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

/// <summary>
/// SMA-336 — the gardens dashboard layout a user has chosen: level, block order,
/// block sizes, hidden blocks and per-block options. One row per user (1–1,
/// enforced by a unique index on <see cref="UserId"/>); a user who never touched
/// the dashboard simply has no row and reads the level preset instead.
///
/// <para>The layout itself lives in <see cref="LayoutJson"/> rather than in
/// columns: the document is always read and written whole, and a dashboard block
/// gaining an option must not cost a migration. <see cref="SchemaVersion"/> is a
/// column, not a JSON field, so a future data migration can select the rows to
/// rewrite without parsing every document.</para>
/// </summary>
public class UserDashboardPreferences : IHasUpdatedAt
{
    public Guid Id { get; set; }

    /// <summary>
    /// Owner. Unique (one row per user) and cascade-deleted with the account, so
    /// deleting a user leaves no orphan preference row behind.
    /// </summary>
    public required string UserId { get; set; }

    /// <summary>
    /// The layout document, stored as jsonb: <c>{ schemaVersion, level, blocks: [
    /// { key, size, hidden, options } ] }</c>. jsonb rather than text so PostgreSQL
    /// itself rejects a syntactically invalid document. <c>null</c> is legal and
    /// means "nothing adjusted" — the reader falls back to the level preset.
    /// </summary>
    public string? LayoutJson { get; set; }

    /// <summary>
    /// Version of the <see cref="LayoutJson"/> shape. A row whose version the
    /// server does not know is ignored in favour of the preset — never an error:
    /// an older client must not be able to break a newer dashboard, nor the
    /// reverse.
    /// </summary>
    public int SchemaVersion { get; set; }

    /// <summary>
    /// UTC timestamp of the last save, refreshed by <c>UpdateTimestampInterceptor</c>.
    /// </summary>
    public DateTime UpdatedAt { get; set; }
}
