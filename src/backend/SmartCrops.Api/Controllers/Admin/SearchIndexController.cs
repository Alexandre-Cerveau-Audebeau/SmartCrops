using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Api.Controllers.Admin;

/// <summary>
/// Admin surface for the Typesense search index (SMA-255). Indexing is an
/// explicit operator action — nothing in the request pipeline writes to the
/// index yet, so after data changes (imports, enrichments, repins) an admin
/// re-runs the reindex to refresh the search engine.
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Admin)]
[Route("api/admin/search")]
public class SearchIndexController : ControllerBase
{
    private readonly ISearchIndexingService _indexer;
    private readonly ILogger<SearchIndexController> _logger;

    public SearchIndexController(
        ISearchIndexingService indexer,
        ILogger<SearchIndexController> logger)
    {
        _indexer = indexer;
        _logger = logger;
    }

    /// <summary>
    /// Bootstraps the <c>plants</c> collection when absent, then upserts every
    /// plant from Postgres into Typesense. Idempotent — re-running yields the
    /// same document count, no duplicates.
    /// </summary>
    [HttpPost("reindex")]
    public async Task<IActionResult> Reindex(CancellationToken ct = default)
    {
        var result = await _indexer.ReindexAllAsync(ct);

        _logger.LogInformation(
            "Search reindex requested by admin: collectionExisted={CollectionExisted} indexed={Indexed} failures={Failures} durationMs={DurationMs}",
            result.CollectionExisted, result.DocumentsIndexed, result.Failures.Count, result.DurationMs);

        return Ok(new ReindexResponse(
            result.CollectionExisted,
            result.DocumentsIndexed,
            result.DurationMs,
            result.Failures));
    }

    /// <summary>
    /// Counts-only summary. <paramref name="CollectionExists"/> reports whether
    /// the collection existed BEFORE this call (<c>false</c> = it was
    /// bootstrapped by this run). <paramref name="Failures"/> lists rejected
    /// documents as "id (scientificName): error" strings — empty on success.
    /// </summary>
    public record ReindexResponse(
        bool CollectionExists,
        int DocumentsIndexed,
        long DurationMs,
        IReadOnlyList<string> Failures);
}
