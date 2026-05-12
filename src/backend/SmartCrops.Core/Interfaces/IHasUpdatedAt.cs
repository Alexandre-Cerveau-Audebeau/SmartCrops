namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Marker interface for entities whose <see cref="UpdatedAt"/> property must be
/// automatically refreshed when the entity is modified and persisted.
///
/// Implemented by entities tracked by <c>UpdateTimestampInterceptor</c>.
///
/// Why not <c>IHasTimestamps</c>?
/// <list type="bullet">
///   <item>The interceptor only ever touches <see cref="UpdatedAt"/>.
///   <c>CreatedAt</c> stays under PostgreSQL's control via
///   <c>DEFAULT CURRENT_TIMESTAMP</c> on INSERT.</item>
///   <item>One marker = one precise behavior (Single Responsibility for the
///   contract).</item>
///   <item>Future markers like <c>IHasSoftDelete</c> follow the same
///   convention.</item>
/// </list>
/// </summary>
public interface IHasUpdatedAt
{
    /// <summary>
    /// UTC timestamp of the last modification persisted through SaveChanges.
    /// Settable so the interceptor can refresh it.
    /// </summary>
    DateTime UpdatedAt { get; set; }
}
