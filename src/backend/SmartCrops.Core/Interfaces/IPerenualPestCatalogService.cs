using SmartCrops.Core.Models;

namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Read-only enumeration of the global Perenual pest/disease catalogue
/// (<c>/api/pest-disease-list</c>). Distinct from <see cref="IPerenualCatalogService"/>
/// (species catalogue) and <see cref="IPlantPerenualEnrichmentService"/> (per-plant).
///
/// <para>Implementations absorb upstream HTTP/JSON/timeout failures and return
/// <c>null</c> on any non-recoverable error (same posture as the other Perenual
/// services), and redact the API key from each per-item literal before returning
/// it (SMA-71 PR2).</para>
/// </summary>
public interface IPerenualPestCatalogService
{
    /// <summary>
    /// Fetch one page of the pest/disease catalogue. Returns <c>null</c> on
    /// transport failure, timeout, malformed payload, or non-JSON Content-Type.
    /// </summary>
    Task<PerenualPestPage?> GetPageAsync(int page, CancellationToken ct);
}
