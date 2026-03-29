namespace SmartCrops.Core.Entities;

public class GardenPlant
{
    public Guid GardenId { get; set; }
    public Garden Garden { get; set; } = null!;
    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;
    public DateTime AddedAt { get; set; }
    public string? Notes { get; set; }
}
