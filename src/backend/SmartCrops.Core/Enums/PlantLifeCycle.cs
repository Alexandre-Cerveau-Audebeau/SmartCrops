namespace SmartCrops.Core.Enums;

/// <summary>
/// The biological life cycle of a plant.
/// Maps to Perenual API "cycle" field and Trefle "duration" field.
/// </summary>
public enum PlantLifeCycle
{
    Annual = 1,
    Biennial = 2,
    Perennial = 3,
    HerbaceousPerennial = 4,
}
