namespace SmartCrops.Core.Entities;

public class GardenPlacement
{
    public Guid Id { get; set; }
    public Guid GardenId { get; set; }
    public Guid PlantId { get; set; }
    public int StartRow { get; set; }
    public int StartCol { get; set; }
    public int SpanRows { get; set; } = 1;
    public int SpanCols { get; set; } = 1;
    public string? Notes { get; set; }
    public DateTime PlacedAt { get; set; }

    public Garden Garden { get; set; } = null!;
    public Plant Plant { get; set; } = null!;
}
