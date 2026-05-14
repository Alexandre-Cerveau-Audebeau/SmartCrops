using SmartCrops.Core.Enums;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

/// <summary>
/// Root of the plant aggregate.
///
/// Architecture:
/// - Canonical fields (life cycle, watering need, hardiness, etc.) live directly on
///   Plant for fast reads — denormalized READ MODEL.
/// - Source-specific raw data is kept in <see cref="PlantTrefleData"/> and
///   <see cref="PlantPerenualData"/> as an audit trail and for re-derivation.
/// - Multilingual content lives in <see cref="PlantTranslation"/> (legacy short text)
///   and <see cref="PlantLongDescription"/> (rich long-form, one row per language).
/// - During ETL, merge priority is: Manual &gt; Perenual &gt; Trefle &gt; GBIF.
/// </summary>
public class Plant : IHasUpdatedAt
{
    public Guid Id { get; set; }

    /// <summary>
    /// Latin scientific name — language-neutral, never translated (e.g. "Solanum lycopersicum").
    /// </summary>
    public required string ScientificName { get; set; }

    public int PlantTypeId { get; set; }
    public PlantType PlantType { get; set; } = null!;

    /// <summary>
    /// Enum-like key resolved by the UI (e.g. "full_sun", "partial_shade", "full_shade").
    /// Storing a key instead of an enum keeps the DB schema stable when values are added.
    /// </summary>
    public string? SunExposure { get; set; }

    /// <summary>
    /// Enum-like key resolved by the UI (e.g. "low", "moderate", "regular", "high").
    /// </summary>
    public string? WaterNeeds { get; set; }

    /// <summary>
    /// Human-readable period key (e.g. "march-may"). Kept as a string so it can express
    /// ranges, hemisphere variants, or climate-zone qualifiers without schema changes.
    /// </summary>
    public string? SowingPeriod { get; set; }

    /// <summary>
    /// Human-readable period key (e.g. "july-october").
    /// </summary>
    public string? HarvestPeriod { get; set; }

    public string? ImageUrl { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // ── Identity (GBIF canonical) ───────────────────────────────────────────────

    /// <summary>GBIF taxon key — globally unique numeric ID for the species.</summary>
    public int? GbifTaxonKey { get; set; }

    /// <summary>Family name (e.g. "Solanaceae").</summary>
    public string? Family { get; set; }

    /// <summary>Genus name (e.g. "Solanum").</summary>
    public string? Genus { get; set; }

    /// <summary>Species epithet (e.g. "lycopersicum").</summary>
    public string? SpeciesEpithet { get; set; }

    /// <summary>Taxonomic authority (e.g. "L." for Linnaeus).</summary>
    public string? Author { get; set; }

    // ── Canonical READ MODEL (denormalized from sources) ────────────────────────

    public PlantLifeCycle? LifeCycle { get; set; }
    public PlantGrowthRate? GrowthRate { get; set; }
    public PlantWateringNeed? WateringNeedLevel { get; set; }
    public PlantCareLevel? CareLevel { get; set; }

    /// <summary>USDA hardiness zone lower bound.</summary>
    public int? HardinessZoneMin { get; set; }

    /// <summary>USDA hardiness zone upper bound.</summary>
    public int? HardinessZoneMax { get; set; }

    public int? MinHeightCm { get; set; }
    public int? MaxHeightCm { get; set; }
    public int? MinSpreadCm { get; set; }
    public int? MaxSpreadCm { get; set; }

    public decimal? SoilPhMin { get; set; }
    public decimal? SoilPhMax { get; set; }

    /// <summary>Light requirement on a 0-10 scale (Trefle convention).</summary>
    public int? LightLevel { get; set; }

    public int? MinTempC { get; set; }
    public int? MaxTempC { get; set; }

    // ── Boolean flags ───────────────────────────────────────────────────────────

    public bool? IsEdible { get; set; }
    public bool? IsMedicinal { get; set; }
    public bool? IsIndoor { get; set; }
    public bool? IsDroughtTolerant { get; set; }
    public bool? IsSaltTolerant { get; set; }
    public bool? IsThorny { get; set; }
    public bool? IsInvasive { get; set; }
    public bool? IsTropical { get; set; }
    public bool? IsToxicToHumans { get; set; }
    public bool? IsToxicToPets { get; set; }
    public bool? AttractsPollinators { get; set; }

    // ── Enrichment metadata ─────────────────────────────────────────────────────

    public EnrichmentStatus EnrichmentStatus { get; set; } = EnrichmentStatus.Manual;

    public DateTime? LastEnrichmentAt { get; set; }

    // ── Navigation properties ───────────────────────────────────────────────────

    public ICollection<PlantTranslation> Translations { get; set; } = [];
    public ICollection<PlantSuggestion> Suggestions { get; set; } = [];
    public ICollection<GardenPlant> GardenPlants { get; set; } = [];

    public ICollection<PlantLongDescription> LongDescriptions { get; set; } = [];
    public ICollection<PlantCommonName> CommonNames { get; set; } = [];
    public ICollection<PlantImage> Images { get; set; } = [];
    public ICollection<PlantPhase> Phases { get; set; } = [];
    public ICollection<PlantSynonym> Synonyms { get; set; } = [];
    public ICollection<PlantSource> Sources { get; set; } = [];

    public PlantTrefleData? TrefleData { get; set; }
    public PlantPerenualData? PerenualData { get; set; }
}
