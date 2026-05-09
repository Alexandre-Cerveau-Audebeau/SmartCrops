namespace SmartCrops.Core.Entities;

/// <summary>
/// A common (vernacular) name for a plant in a specific language.
/// A plant can have multiple common names per language (e.g. "tomato" and "love apple"
/// in English), so uniqueness is NOT enforced on (PlantId, LanguageCode).
/// </summary>
public class PlantCommonName
{
    public int Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    /// <summary>BCP 47-style language tag (e.g. "en", "pt-BR").</summary>
    public required string LanguageCode { get; set; }

    /// <summary>The common name itself.</summary>
    public required string Name { get; set; }

    /// <summary>True if this is the preferred name for this language.</summary>
    public bool IsPrimary { get; set; }

    public DateTime CreatedAt { get; set; }
}
