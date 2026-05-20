namespace SmartCrops.Api.DTOs;

/// <summary>
/// Detail response for <c>GET /api/plants/{id}</c>. Distinct from the list/search
/// endpoints (which still expose the raw <see cref="Core.Entities.Plant"/> entity)
/// because the detail view materialises every navigation collection and must
/// exclude the source-of-truth raw JSON blobs that the audit tables retain.
///
/// Three contracts that aren't obvious from the shape:
/// <list type="bullet">
///   <item>Enum-typed scalars (<c>LifeCycle</c>, <c>GrowthRate</c>, etc.) ship as
///   <c>string</c> — the frontend renders human labels via i18n keyed on these
///   names; sending the underlying ints would force the frontend to mirror the
///   backend enum table.</item>
///   <item><c>EnrichmentSources</c> is the <c>[Flags]</c> <c>EnrichmentStatus</c>
///   exploded into a stable string array (<c>["Manual", "GBIF", "Trefle",
///   "Perenual"]</c> when all four bits are set). The footer chips iterate this
///   array directly — no bitwise check on the client.</item>
///   <item><c>TrefleData</c> and <c>PerenualData</c> expose every persisted
///   column except <c>RawResponseJson</c>. The raw blobs are typically
///   100–200 KB each and exist for ETL re-derivation, not display.</item>
/// </list>
/// </summary>
public record PlantDetailResponse
{
    public Guid Id { get; init; }
    public required string ScientificName { get; init; }

    /// <summary>FK to <see cref="Core.Entities.PlantType"/>. Always present.</summary>
    public int PlantTypeId { get; init; }

    /// <summary>
    /// Denormalised <see cref="PlantTypeDto"/> projection. Nullable to stay
    /// defensive against schema drift: the FK is always populated, but if a
    /// future caller of <c>PlantsController.GetById</c> took a code path that
    /// skipped the <c>PlantType</c> Include, the DTO would surface a missing
    /// navigation here rather than crashing inside the mapper.
    /// </summary>
    public PlantTypeDto? PlantType { get; init; }

    public string? SunExposure { get; init; }
    public string? WaterNeeds { get; init; }
    public string? SowingPeriod { get; init; }
    public string? HarvestPeriod { get; init; }
    public string? ImageUrl { get; init; }

    public int? GbifTaxonKey { get; init; }
    public string? Family { get; init; }
    public string? Genus { get; init; }
    public string? SpeciesEpithet { get; init; }
    public string? Author { get; init; }
    public string? WfoId { get; init; }
    public int? Year { get; init; }

    public string? LifeCycle { get; init; }
    public string? GrowthRate { get; init; }
    public string? WateringNeedLevel { get; init; }
    public string? CareLevel { get; init; }
    public string? GrowthHabit { get; init; }

    public int? HardinessZoneMin { get; init; }
    public int? HardinessZoneMax { get; init; }
    public int? MinHeightCm { get; init; }
    public int? MaxHeightCm { get; init; }
    public int? MinSpreadCm { get; init; }
    public int? MaxSpreadCm { get; init; }
    public decimal? SoilPhMin { get; init; }
    public decimal? SoilPhMax { get; init; }
    public int? LightLevel { get; init; }
    public int? SoilNutriments { get; init; }
    public int? MinTempC { get; init; }
    public int? MaxTempC { get; init; }

    public bool? IsEdible { get; init; }
    public bool? IsVegetable { get; init; }
    public bool? IsMedicinal { get; init; }
    public bool? IsIndoor { get; init; }
    public bool? IsDroughtTolerant { get; init; }
    public bool? IsSaltTolerant { get; init; }
    public bool? IsThorny { get; init; }
    public bool? IsInvasive { get; init; }
    public bool? IsTropical { get; init; }
    public bool? IsToxicToHumans { get; init; }
    public bool? IsToxicToPets { get; init; }
    public bool? AttractsPollinators { get; init; }

    public string? FlowerColors { get; init; }
    public string? NativeRegions { get; init; }
    public string? IntroducedRegions { get; init; }
    public string? EdibleParts { get; init; }
    public string? SowingInstructions { get; init; }
    public string? PropagationInstructions { get; init; }

    public IReadOnlyList<string> EnrichmentSources { get; init; } = [];
    public DateTime? LastEnrichmentAt { get; init; }

    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }

    public IReadOnlyList<PlantTranslationDto> Translations { get; init; } = [];
    public IReadOnlyList<PlantImageDto> Images { get; init; } = [];
    public IReadOnlyList<PlantLongDescriptionDto> LongDescriptions { get; init; } = [];
    public IReadOnlyList<PlantCommonNameDto> CommonNames { get; init; } = [];
    public IReadOnlyList<PlantPestDto> Pests { get; init; } = [];
    public IReadOnlyList<PlantSynonymDto> Synonyms { get; init; } = [];
    public IReadOnlyList<PlantSourceDto> Sources { get; init; } = [];

    public PlantTrefleDataDto? TrefleData { get; init; }
    public PlantPerenualDataDto? PerenualData { get; init; }
}

/// <summary>Lightweight projection of the <c>PlantType</c> reference entity.</summary>
public record PlantTypeDto(int Id, string Name, string? Description);

/// <summary>Localised display fields (common name + short description) per language.</summary>
public record PlantTranslationDto(
    int Id,
    string Language,
    string CommonName,
    string? Description);

/// <summary>
/// A categorised photo with licensing metadata. <c>ImageType</c> and
/// <c>Source</c> ship as strings rather than enums so the frontend can render
/// them as i18n keys without mirroring the backend enum tables.
/// </summary>
public record PlantImageDto(
    int Id,
    string ImageType,
    string Url,
    string? ThumbnailUrl,
    int? Width,
    int? Height,
    string? LicenseName,
    string? LicenseUrl,
    string? Credit,
    string Source,
    string? SourceExternalId,
    int DisplayOrder,
    bool IsFlagged);

/// <summary>Long-form description in a single language, one row per locale.</summary>
public record PlantLongDescriptionDto(
    int Id,
    string Language,
    string LongDescription,
    string? SourceMethod);

/// <summary>A vernacular name in one language; <c>IsPrimary</c> flags the preferred entry.</summary>
public record PlantCommonNameDto(
    int Id,
    string LanguageCode,
    string Name,
    bool IsPrimary);

/// <summary>A pest or pathogen affecting the plant, sourced from Perenual today.</summary>
public record PlantPestDto(
    int Id,
    string Name,
    string Type,
    string? Description,
    string? Symptoms,
    string? Solutions,
    string? ImageUrl,
    string Source,
    string? SourceExternalId);

/// <summary>A historical / alternative scientific name used during ETL fuzzy match.</summary>
public record PlantSynonymDto(
    int Id,
    string Synonym,
    string? Authority);

/// <summary>Cross-reference to an external taxonomy / enrichment API, with link metadata.</summary>
public record PlantSourceDto(
    int Id,
    string SourceType,
    string ExternalId,
    string? Url,
    string? Notes,
    DateTime? LastFetchedAt);

/// <summary>
/// Trefle-specific structured data (1-1 with Plant). <c>RawResponseJson</c>
/// is intentionally omitted — the audit blob stays in the DB.
/// </summary>
public record PlantTrefleDataDto(
    Guid Id,
    string? TrefleSlug,
    string? WfoId,
    string? GrowthHabit,
    string? FlowerColors,
    string? FoliageColors,
    string? NativeRegionsJson,
    string? IntroducedRegionsJson,
    int? SoilNutrimentsLevel,
    int? SoilSalinityLevel,
    int? AtmosphericHumidityLevel,
    string? ApiVersion,
    DateTime LastSyncAt);

/// <summary>
/// Perenual-specific structured data (1-1 with Plant). <c>RawResponseJson</c>
/// is intentionally omitted — the audit blob stays in the DB.
/// </summary>
public record PlantPerenualDataDto(
    Guid Id,
    int PerenualId,
    int? RequestedPerenualId,
    string? Cultivar,
    string? PerenualType,
    string? OriginCountries,
    string? PropagationMethods,
    string? WateringBenchmark,
    string? WateringBenchmarkUnit,
    string? SunlightPreferences,
    string? PruningMonths,
    string? Maintenance,
    string? FloweringSeason,
    string? HarvestSeason,
    bool? HasEdibleFruit,
    bool? HasEdibleLeaves,
    bool? IsCulinary,
    string? PlantAnatomyJson,
    string? ApiVersion,
    bool HasSupremeData,
    DateTime LastSyncAt);
