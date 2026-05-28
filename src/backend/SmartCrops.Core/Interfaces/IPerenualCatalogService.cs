using SmartCrops.Core.Models;

namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Read-only enumeration of the Perenual species catalog. Distinct from
/// <see cref="IPlantPerenualEnrichmentService"/> (which resolves a single
/// plant and produces a dual-write payload) — this service is the catalog
/// fetcher used by the SMA-13 batch 2 scale-up tooling
/// (<c>scripts/bulk-import/Fetch-PerenualCatalog.ps1</c>).
///
/// <para>Implementations must absorb upstream HTTP/JSON/timeout failures and
/// return <c>null</c> on any non-recoverable error (same posture as
/// <c>PerenualClient.SearchAsync</c> / <c>GetSpeciesDetailsAsync</c>) so the
/// admin endpoint never propagates an upstream exception.</para>
/// </summary>
public interface IPerenualCatalogService
{
    /// <summary>
    /// Fetch one page of the catalog. Returns <c>null</c> on transport failure,
    /// timeout, malformed payload, or non-JSON Content-Type (off-by-one ≥8574
    /// HTML responses, PR #76).
    /// </summary>
    Task<PerenualCatalogPage?> GetPageAsync(int page, CancellationToken ct);
}
