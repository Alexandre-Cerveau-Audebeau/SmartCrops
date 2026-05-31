using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

/// <summary>
/// One entry of the global Perenual pest/disease catalogue (one row per upstream
/// pest id). SMA-71 PR2 loss-proof capture of <c>/api/pest-disease-list</c>
/// (~256 entries across 9 pages) taken ahead of the subscription cancel.
///
/// <para>Unlike <see cref="PlantPerenualData"/> this is NOT per-plant — it is a
/// standalone reference table. The join from <see cref="PlantPest"/> (by name)
/// is deferred to a later phase, so there is intentionally no foreign key.
/// Internal/audit only; deliberately never surfaced in a public API DTO.</para>
/// </summary>
public class PerenualPestCatalog : IHasUpdatedAt
{
    public Guid Id { get; set; }

    /// <summary>Upstream Perenual pest/disease id (<c>response.id</c>). Natural key — unique.</summary>
    public int PerenualPestId { get; set; }

    /// <summary>Common name (e.g. "Fairy ring"). Nullable — some upstream entries omit it.</summary>
    public string? CommonName { get; set; }

    /// <summary>Scientific name (e.g. "Agrocybe"). Nullable; aids the future PlantPest join.</summary>
    public string? ScientificName { get; set; }

    /// <summary>
    /// Verbatim pest entry body, API key redacted. The full upstream object —
    /// <c>description[]</c>, <c>solution[]</c>, <c>host[]</c>, <c>images[]</c> —
    /// is preserved here: the loss-proof capture. Stored as jsonb.
    /// </summary>
    public string? LiteralResponseJson { get; set; }

    /// <summary>Timestamp of the last successful harvest from Perenual.</summary>
    public DateTime FetchedAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
