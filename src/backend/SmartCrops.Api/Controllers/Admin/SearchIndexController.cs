using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Interfaces;
using Typesense;

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
        try
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
        catch (Exception ex) when (ex is TypesenseApiException or HttpRequestException)
        {
            // TypesenseApiException covers every engine rejection (auth, bad
            // request, service-unavailable); HttpRequestException covers the
            // container being unreachable. Both are foreseeable operator
            // situations — surface a 503 instead of an opaque 500. Cancellation
            // (OperationCanceledException) deliberately falls through to the
            // framework's request-abort handling.
            _logger.LogError(ex, "Search reindex failed — Typesense unreachable or rejected the request");
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                "Search engine unavailable or rejected the reindex; see server logs for detail.");
        }
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
