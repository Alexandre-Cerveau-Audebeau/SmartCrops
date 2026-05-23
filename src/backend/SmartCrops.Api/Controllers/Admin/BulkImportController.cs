using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
/// <para>Bare <c>[Authorize]</c> matches the pattern set by the three
/// enrichment controllers (PR #58 / PR #59) — Identity Roles aren't in place
/// yet; tighten to an admin role when role-based authz lands.</para>
/// </summary>
[ApiController]
[Authorize]
[Route("api/admin/bulk-import")]
public class BulkImportController : ControllerBase
{
    private readonly IBulkImportService _bulkImport;

    public BulkImportController(IBulkImportService bulkImport)
    {
        _bulkImport = bulkImport;
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
}
