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
