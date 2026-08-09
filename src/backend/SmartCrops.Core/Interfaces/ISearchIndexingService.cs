namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Pushes the Postgres plant catalogue into the external search engine
/// (SMA-255). Engine-agnostic contract; the Typesense implementation lives in
/// Infrastructure.
/// </summary>
public interface ISearchIndexingService
{
    /// <summary>
    /// Bootstraps the search collection when absent, then upserts every plant.
    /// Idempotent: documents are keyed by the Plant Guid, so re-running yields
    /// the same document count with no duplicates.
    /// </summary>
    Task<SearchReindexResult> ReindexAllAsync(CancellationToken ct = default);

    /// <summary>
    /// Boot-time conditional variant (SMA-389): when the collection exists AND
    /// holds at least one document, this is a strict no-op costing a single
    /// collection GET; when the collection is absent or empty, it runs
    /// <see cref="ReindexAllAsync"/> (which bootstraps the schema when needed).
    /// A full reindex on every boot is deliberately impossible through this
    /// method — ongoing freshness stays with the admin reindex endpoint.
    /// </summary>
    Task<SearchIndexEnsureResult> ReindexIfEmptyAsync(CancellationToken ct = default);
}

/// <summary>
/// Summary of a full reindex run. <see cref="CollectionExisted"/> is
/// <c>false</c> when this call had to create (bootstrap) the collection.
/// <see cref="Failures"/> carries one human-readable entry per document the
/// engine rejected (empty on a clean run).
/// </summary>
public record SearchReindexResult(
    bool CollectionExisted,
    int DocumentsIndexed,
    long DurationMs,
    IReadOnlyList<string> Failures);

/// <summary>
/// Outcome of the boot-time conditional reindex (SMA-389).
/// <see cref="Indexed"/> is <c>false</c> for the strict no-op — the collection
/// already existed with <see cref="ExistingDocuments"/> documents and the call
/// cost one GET; it is <c>true</c> when the absent-or-empty gate tripped and
/// the full reindex ran, in which case <see cref="Reindex"/> carries that
/// run's summary (<c>null</c> on the no-op path).
/// </summary>
public record SearchIndexEnsureResult(
    bool Indexed,
    int ExistingDocuments,
    SearchReindexResult? Reindex);
