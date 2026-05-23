using SmartCrops.Core.Models;

namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Creates minimal <see cref="Entities.Plant"/> rows from a JSON-shaped list of
/// scientific names + plant-type labels. Foundation for the bulk import flow
/// (1000-3000 plants): the rows are deliberately empty beyond identity so the
/// existing per-source enrichment endpoints (GBIF taxonomy, Trefle, Perenual)
/// can fan out on them afterwards.
///
/// <para>Per-item resilience mirrors <c>EnrichAll</c>'s skip+continue pattern:
/// a malformed or duplicate row fails on its own and the rest of the batch
/// proceeds. Persistence happens in a single <c>SaveChangesAsync</c> at the
/// end of the batch (no row-level transactions) — the dedup checks are
/// performed up front, so duplicates are not staged into the change tracker.</para>
/// </summary>
public interface IBulkImportService
{
    Task<BulkImportResult> CreateAsync(BulkImportRequest request, CancellationToken ct);
}
