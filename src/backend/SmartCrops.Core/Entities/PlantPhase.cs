using SmartCrops.Core.Enums;

namespace SmartCrops.Core.Entities;

/// <summary>
/// A phase of the plant's annual life cycle, expressed as a month range.
/// Ranges may wrap the year boundary (e.g. start=11, end=2 → Nov through Feb).
/// </summary>
public class PlantPhase
{
    public int Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    public PlantPhaseType PhaseType { get; set; }

    /// <summary>Inclusive start month, 1-12. CHECK constraint enforced at DB level.</summary>
    public int StartMonth { get; set; }

    /// <summary>Inclusive end month, 1-12. May be less than StartMonth to wrap the year.</summary>
    public int EndMonth { get; set; }

    /// <summary>Optional advice for this phase.</summary>
    public string? Notes { get; set; }

    /// <summary>ISO 639-1 language code for Notes (when present).</summary>
    public string? NotesLanguage { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
