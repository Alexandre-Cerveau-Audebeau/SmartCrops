using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Api.Controllers.Admin;

/// <summary>
/// Admin-triggered bulk creation of minimal <see cref="Core.Entities.Plant"/>
/// rows from a JSON list of scientific names + plant-type labels. Foundation
/// for the bulk import flow (1000-3000 plants): rows are intentionally empty
/// beyond identity so the existing per-source enrichment endpoints (taxonomy,
/// Trefle, Perenual) can fan out on them afterwards.
///
/// <para>Gated to the Admin role (SMA-33/#68): admin-only bulk-import operation.</para>
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Admin)]
[Route("api/admin/bulk-import")]
public class BulkImportController : ControllerBase
{
    private readonly IBulkImportService _bulkImport;
    private readonly IBulkImportPreflightService _preflight;

    public BulkImportController(
        IBulkImportService bulkImport,
        IBulkImportPreflightService preflight)
    {
        _bulkImport = bulkImport;
        _preflight = preflight;
    }

    /// <summary>
    /// Create minimal Plant rows from the supplied items. Per-item resilience
    /// mirrors <c>EnrichAll</c>: a malformed, duplicate, or invalid-plant-type
    /// row Fails/Skips on its own and the rest of the batch proceeds. The
    /// response counts (Total, Created, Skipped, Failed) always sum to the
    /// request item count; <c>FailedReasons</c> carries one line per Failed
    /// item for diagnostic surfacing in the admin UI.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<BulkImportResult>> Create(
        [FromBody] BulkImportRequest request,
        CancellationToken ct)
    {
        if (request is null)
        {
            return BadRequest("Request body is required.");
        }

        var result = await _bulkImport.CreateAsync(request, ct);
        return Ok(result);
    }

    /// <summary>
    /// Read-only overlap pre-flight for a curated batch. Resolves every
    /// candidate's <c>ScientificName</c> against GBIF (same algorithm as the
    /// runtime enrichment path) and reports candidates whose resolved
    /// accepted key collides either with another candidate in the same batch
    /// (<c>intra_batch</c>) or with an existing <c>Plant</c> row carrying a
    /// different name (<c>db_existing</c>). Implements layer (b) of ADR-0004.
    ///
    /// <para>No DB writes. Shares the controller-level admin-role authorization
    /// (<c>[Authorize(Roles = "Admin")]</c>) with the create endpoint above
    /// (SMA-33/#68).</para>
    /// </summary>
    [HttpPost("preflight")]
    public async Task<ActionResult<BulkImportPreflightResponse>> Preflight(
        [FromBody] BulkImportPreflightRequest request,
        CancellationToken ct)
    {
        if (request is null || request.Candidates is null)
        {
            return BadRequest("Request body with a non-empty Candidates list is required.");
        }

        if (request.Candidates.Count == 0)
        {
            return BadRequest("Candidates list must not be empty.");
        }

        if (request.Candidates.Count > BulkImportPreflightRequest.MaxCandidates)
        {
            return BadRequest(
                $"Candidates list exceeds the per-request cap of {BulkImportPreflightRequest.MaxCandidates}. " +
                "Chunk the input client-side.");
        }

        var result = await _preflight.CheckAsync(request, ct);
        return Ok(result);
    }
}
