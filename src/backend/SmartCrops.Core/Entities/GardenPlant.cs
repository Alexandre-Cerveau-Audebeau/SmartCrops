namespace SmartCrops.Core.Entities;

/// <summary>
/// DEPRECATED (SMA-6 Option A): the "add to my garden" path that wrote these
/// rows was removed — <see cref="GardenPlacement"/> is the sole source of truth
/// for a garden's plants (counter, cards, planner surfaces). Existing rows stay
/// readable (GET /api/gardens/{id}) and editable (PATCH notes / DELETE) so no
/// user data is destroyed; nothing creates new rows. Dropping the table and this
/// entity is a dedicated future ticket — deliberately NO migration in SMA-6.
/// </summary>
public class GardenPlant
{
    public Guid GardenId { get; set; }
    public Garden Garden { get; set; } = null!;
    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;
    public DateTime AddedAt { get; set; }
    public string? Notes { get; set; }
}
