namespace SmartCrops.Core.Entities;

/// <summary>
/// Holds all language-dependent fields for a plant.
/// A unique constraint on (PlantId, Language) enforces one translation per plant per language.
/// </summary>
public class PlantTranslation
{
    public int Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    /// <summary>
    /// ISO 639-1 language code (e.g. "en", "fr", "es").
    /// </summary>
    public required string Language { get; set; }

    /// <summary>
    /// Localized common name (e.g. "Tomato" for "en", "Tomate" for "fr").
    /// </summary>
    public required string CommonName { get; set; }

    public string? Description { get; set; }
}
