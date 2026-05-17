namespace SmartCrops.Core.Enums;

/// <summary>
/// Classification of a plant pest or disease.
/// Sourced primarily from Perenual disease/pest data.
/// Stored as string in DB for readability and extensibility.
///
/// Semantics:
/// - <see cref="Disease"/> is a catch-all for conditions whose pathogen is unknown
///   or non-applicable (physiological disorders, environmental stress).
/// - The pathogen-specific values (<see cref="Fungus"/>, <see cref="Bacteria"/>,
///   <see cref="Virus"/>, <see cref="Mite"/>, <see cref="Nematode"/>) MUST be used
///   when Perenual identifies a causal agent — never collapse them into Disease.
/// - <see cref="Insect"/> is the most common case for visible pests.
/// - <see cref="Other"/> is reserved for edge cases (e.g. weeds, parasitic plants).
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
