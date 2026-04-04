namespace SmartCrops.Core.Entities;

public class Garden
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string UserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public int? LayoutWidth { get; set; }
    public int? LayoutHeight { get; set; }
    public string? CellSize { get; set; }
    public string? CellsJson { get; set; }
    public ICollection<GardenPlant> GardenPlants { get; set; } = [];
    public ICollection<GardenPlacement> Placements { get; set; } = [];
}
