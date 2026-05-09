namespace SmartCrops.Core.Enums;

/// <summary>
/// Origin of a piece of plant data. Used in PlantSource and PlantImage.
/// </summary>
public enum PlantSourceType
{
    GBIF = 1,
    Trefle = 2,
    Perenual = 3,
    WFO = 4,
    POWO = 5,
    PlantNet = 6,
    Manual = 90,
    UserSubmitted = 91,
}
