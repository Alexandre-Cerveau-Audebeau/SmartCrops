namespace SmartCrops.Core.Enums;

/// <summary>
/// How fully a plant's data has been enriched from external APIs.
/// Designed as flags so we can combine sources.
/// </summary>
[Flags]
public enum EnrichmentStatus
{
    None = 0,
    Manual = 1,
    GbifEnriched = 2,
    TrefleEnriched = 4,
    PerenualEnriched = 8,

    /// <summary>
    /// All three external APIs have enriched this plant. Use this flag to filter
    /// "ready to publish" plants without conflating with provenance.
    /// </summary>
    AllExternalSourcesEnriched = GbifEnriched | TrefleEnriched | PerenualEnriched,

    /// <summary>
    /// Backward-compatible alias for <see cref="AllExternalSourcesEnriched"/>.
    /// Prefer the explicit flag in new code.
    /// </summary>
    FullyEnriched = AllExternalSourcesEnriched,
}
