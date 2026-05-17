namespace SmartCrops.Core.Enums;

/// <summary>
/// Classification of a plant pest or disease.
/// Sourced primarily from Perenual disease/pest data.
/// Stored as string in DB for readability and extensibility.
/// </summary>
public enum PlantPestType
{
    Disease = 1,
    Insect = 2,
    Fungus = 3,
    Bacteria = 4,
    Mite = 5,
    Nematode = 6,
    Virus = 7,
    Other = 99,
}
