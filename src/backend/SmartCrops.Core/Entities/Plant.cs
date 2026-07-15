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

    /// <summary>
    /// World Flora Online taxon id (audit source for the canonical species).
    /// Denormalized from <see cref="PlantTrefleData"/> per ADR-0003 so the
    /// canonical read model carries every cross-reference id directly.
    /// </summary>
    public string? WfoId { get; set; }

    /// <summary>
    /// Year the species was first published in scientific literature (GBIF).
    /// CHECK constraint: between 1700 and the current year.
    /// </summary>
    public int? Year { get; set; }

    /// <summary>
    /// Rank at which this plant's identity is pinned. Defaults to
    /// <see cref="PlantTaxonRank.Species"/>; set to <see cref="PlantTaxonRank.Genus"/>
    /// when only a genus-level identity is defensible (horticultural group or
    /// trade designation with no resolvable accepted species). Such rows usually
    /// also carry <see cref="IdentityNeedsReview"/>.
    /// </summary>
    public PlantTaxonRank TaxonRank { get; set; } = PlantTaxonRank.Species;

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

    /// <summary>Trefle soil nutriments preference on a 0-10 scale.</summary>
    public int? SoilNutriments { get; set; }

    public int? MinTempC { get; set; }
    public int? MaxTempC { get; set; }

    // ── Boolean flags ───────────────────────────────────────────────────────────

    public bool? IsEdible { get; set; }

    /// <summary>Trefle classification: whether the plant is a vegetable.</summary>
    public bool? IsVegetable { get; set; }

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

    // ── Growth habit (Trefle) ───────────────────────────────────────────────────

    /// <summary>
    /// Plant growth habit per Trefle classification. Stored as string in DB.
    /// </summary>
    public PlantGrowthHabit? GrowthHabit { get; set; }

    // ── Trefle structured data (denormalized from PlantTrefleData per ADR-0003) ─

    /// <summary>
    /// Flower colors as JSON array of strings (e.g. <c>["red","pink"]</c>).
    /// Denormalized from <see cref="PlantTrefleData.FlowerColors"/> for fast
    /// Library filtering without cross-joining the audit table.
    /// </summary>
    public string? FlowerColors { get; set; }

    /// <summary>
    /// TDWG region codes where the plant is native, as JSON array.
    /// Denormalized from <see cref="PlantTrefleData.NativeRegionsJson"/>.
    /// </summary>
    public string? NativeRegions { get; set; }

    /// <summary>
    /// TDWG region codes where the plant has been introduced, as JSON array.
    /// Denormalized from <see cref="PlantTrefleData.IntroducedRegionsJson"/>.
    /// </summary>
    public string? IntroducedRegions { get; set; }

    // ── Perenual descriptive data ───────────────────────────────────────────────

    /// <summary>
    /// Edible parts as JSON array of strings (e.g. <c>["fruit","leaf","root"]</c>).
    /// </summary>
    public string? EdibleParts { get; set; }

    /// <summary>Sowing instructions text (Perenual).</summary>
    public string? SowingInstructions { get; set; }

    /// <summary>Propagation instructions text (Perenual).</summary>
    public string? PropagationInstructions { get; set; }

    // ── Enrichment metadata ─────────────────────────────────────────────────────

    public EnrichmentStatus EnrichmentStatus { get; set; } = EnrichmentStatus.Manual;

    public DateTime? LastEnrichmentAt { get; set; }

    /// <summary>
    /// Flags a plant whose taxonomic identity is provisional and needs an admin
    /// to confirm or correct it — e.g. pinned at <see cref="PlantTaxonRank.Genus"/>,
    /// or resolved from an ambiguous source name. Defaults to <c>false</c>.
    /// </summary>
    public bool IdentityNeedsReview { get; set; }

    /// <summary>
    /// Perenual id this plant was originally requested under, denormalised from
    /// <see cref="PlantPerenualData.RequestedPerenualId"/> for fast query without
    /// joining the audit table. Differs from <see cref="PlantPerenualData.PerenualId"/>
    /// when Perenual's server-side canonicalisation rewrites the id (cf. issue #67:
    /// requesting <c>/details/8759</c> returns <c>response.id = 8758</c>, which
    /// happens to be a wholly different species' record). User-facing public
    /// URLs use this value instead of the canonical id so the link lands on the
    /// correct species page. Rows enriched before this column existed stay
    /// <c>null</c>; the frontend falls back to the canonical id in that case.
    /// </summary>
    public int? RequestedPerenualId { get; set; }

    // ── Navigation properties ───────────────────────────────────────────────────

    public ICollection<PlantTranslation> Translations { get; set; } = [];
    public ICollection<PlantSuggestion> Suggestions { get; set; } = [];

    public ICollection<PlantLongDescription> LongDescriptions { get; set; } = [];
    public ICollection<PlantCommonName> CommonNames { get; set; } = [];
    public ICollection<PlantImage> Images { get; set; } = [];
    public ICollection<PlantPhase> Phases { get; set; } = [];
    public ICollection<PlantSynonym> Synonyms { get; set; } = [];
    public ICollection<PlantSource> Sources { get; set; } = [];
    public ICollection<PlantPest> Pests { get; set; } = [];

    public PlantTrefleData? TrefleData { get; set; }
    public PlantPerenualData? PerenualData { get; set; }
}
