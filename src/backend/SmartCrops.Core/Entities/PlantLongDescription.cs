namespace SmartCrops.Core.Entities;

/// <summary>
/// Long-form rich description of a plant, one row per language.
/// Distinct from PlantTranslation which holds short descriptions for the legacy UI.
/// </summary>
public class PlantLongDescription
{
    public int Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    /// <summary>ISO 639-1 language code (e.g. "en", "fr").</summary>
    public required string Language { get; set; }

    /// <summary>Long-form description text. Stored as unbounded TEXT.</summary>
    public required string LongDescription { get; set; }

    /// <summary>How the description was produced (e.g. "manual", "perenual", "anthropic-claude-4-7").</summary>
    public string? SourceMethod { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
