namespace SmartCrops.Core.Enums;

/// <summary>
/// Type of phase in a plant's annual life cycle.
/// Used to build the temporal timeline shown to gardeners.
/// </summary>
public enum PlantPhaseType
{
    Sowing = 1,
    Germination = 2,
    Growing = 3,
    Flowering = 4,
    Fruiting = 5,
    Harvest = 6,
    Pruning = 7,
    Dormancy = 8,
}
