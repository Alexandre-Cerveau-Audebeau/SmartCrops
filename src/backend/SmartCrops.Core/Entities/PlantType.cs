namespace SmartCrops.Core.Entities;

public class PlantType
{
    public int Id { get; set; }

    /// <summary>
    /// Internal key used as i18n lookup token (e.g. "Vegetable", "Herb", "Fruit").
    /// Never displayed raw — the UI resolves it via translation files.
    /// </summary>
    public required string Name { get; set; }

    public string? Description { get; set; }
}
