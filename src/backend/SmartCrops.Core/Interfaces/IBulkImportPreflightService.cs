using SmartCrops.Core.Models;

namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Read-only pre-flight cross-check for a curated batch about to be staged
/// via <c>POST /api/admin/bulk-import</c>. Resolves each candidate's
/// <c>ScientificName</c> against GBIF (same algorithm as the runtime
/// enrichment path) and reports two classes of overlap:
///
/// <list type="bullet">
///   <item><c>intra_batch</c> — two or more candidates in the same request
///   resolve to the same accepted GBIF key (e.g. <c>Rosmarinus officinalis</c>
///   + <c>Salvia rosmarinus</c> both resolve to key <c>10902460</c>).</item>
///   <item><c>db_existing</c> — a candidate resolves to a key that already
///   lives on a <c>Plant</c> row carrying a different <c>ScientificName</c>
///   (case-insensitive).</item>
/// </list>
///
/// <para>This is layer (b) of the deduplication strategy documented in
/// ADR-0004. The pre-flight is the staging gate; runtime resilience for
/// taxonomy drift (layer c) is tracked separately under SMA-46 and is the
/// fallback for collisions this layer cannot predict (cases where the
/// previously-persisted key dates from an older GBIF taxonomy snapshot).</para>
///
/// <para>STRICTLY read-only: no entities are tracked, no rows are written,
/// no GBIF state is mutated. Callers may invoke this endpoint repeatedly
/// without side effects.</para>
/// </summary>
public interface IBulkImportPreflightService
{
    Task<BulkImportPreflightResponse> CheckAsync(
        BulkImportPreflightRequest request,
        CancellationToken ct);
}
