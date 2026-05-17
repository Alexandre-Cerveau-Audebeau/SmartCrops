namespace SmartCrops.Core.Enums;

/// <summary>
/// Plant growth habit per Trefle classification.
/// Stored as string in DB (see PlantConfiguration) for readability and
/// resistance to enum reordering.
/// </summary>
public enum PlantGrowthHabit
{
    Tree = 1,
    Shrub = 2,
    Herb = 3,
    Vine = 4,
    Subshrub = 5,
    Graminoid = 6,
    Liana = 7,
    Forb = 8,
}
