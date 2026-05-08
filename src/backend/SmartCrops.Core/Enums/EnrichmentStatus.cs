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
    FullyEnriched = Manual | GbifEnriched | TrefleEnriched | PerenualEnriched,
}
