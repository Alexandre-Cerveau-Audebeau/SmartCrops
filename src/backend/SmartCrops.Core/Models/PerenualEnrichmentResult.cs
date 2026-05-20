using SmartCrops.Core.Enums;

namespace SmartCrops.Core.Models;

/// <summary>
/// Outcome of a Perenual enrichment attempt. <see cref="PerenualId"/> is
/// <c>null</c> when no acceptable match was found; in that case the collections
/// are empty (never <c>null</c>) so the controller can rely on a stable shape
/// and skip dual-write entirely.
///
/// <para>Perenual's response is richer than Trefle's on care/edibility scalars
/// and per-pest descriptive text. This record carries both the denormalised
/// scalars (mirrored onto <c>Plant</c> per ADR-0003, null-coalesce semantics)
/// and the 1-N enrichment tables (<c>PlantImage</c>, <c>PlantPest</c>,
/// <c>PlantLongDescription</c>) the controller replaces on each enrichment.</para>
///
/// <para><see cref="MatchType"/> mirrors the GBIF/Trefle convention
/// (<c>EXACT</c> / <c>NONE</c>) for consistent caller logging. Perenual itself
/// does not expose a match-type concept; we synthesise it after the resolver
/// runs its cultivar-marker-aware scientific-name comparison.</para>
/// </summary>
/// <param name="IsCanonicalMismatchDangerous">
/// True when Perenual canonicalised the requested id server-side to a
/// DIFFERENT id (<c>response.id != requestedPerenualId</c>). Perenual has been
/// observed shipping internally-inconsistent merged records (e.g. id 8758
/// reports scientific_name <c>"Solanum lycopersicum"</c> but serves Solanum
/// dulcamara images), so a name comparison is not a reliable detector — the id
/// mismatch itself is. When set, the controller skips every destructive
/// wrong-species write — the four collection/source targets (images, pests,
/// long-description, source URL) AND the payload-owned <c>EdibleParts</c> JSON
/// overwrite — and keeps only the gap-fill scalar denormalisation + audit row.
/// See issues #73 and #67.
/// </param>
public record PerenualEnrichmentResult(
    int? PerenualId,
    int? RequestedPerenualId,
    string? Cultivar,
    string? PerenualType,
    string? CanonicalScientificName,
    string? RawResponseJson,
    bool HasSupremeData,

    // Denormalised scalars — null-coalesced onto Plant on enrichment.
    PlantLifeCycle? LifeCycle,
    PlantGrowthRate? GrowthRate,
    PlantWateringNeed? WateringNeed,
    PlantCareLevel? CareLevel,
    int? HardinessZoneMin,
    int? HardinessZoneMax,
    int? MinHeightCm,
    int? MaxHeightCm,
    bool? IsEdible,
    bool? IsIndoor,
    bool? IsDroughtTolerant,
    bool? IsSaltTolerant,
    bool? IsThorny,
    bool? IsInvasive,
    bool? IsTropical,
    bool? IsMedicinal,
    bool? IsToxicToHumans,
    bool? IsToxicToPets,

    // Structured payloads — Perenual owns these on Plant (overwrite).
    string? EdiblePartsJson,
    string? PropagationInstructions,
    string? SowingInstructions,

    // Free-form labels — persisted in PlantPerenualData.
    string? OriginCountries,
    string? SunlightPreferences,
    string? PruningMonths,
    string? Maintenance,
    string? FloweringSeason,
    string? HarvestSeason,
    string? PlantAnatomyJson,
    bool? HasEdibleFruit,
    bool? HasEdibleLeaves,
    bool? IsCulinary,
    string? PropagationMethods,
    string? WateringBenchmark,
    string? WateringBenchmarkUnit,

    // 1-N collections — controller does delete-then-insert filtered by Perenual source.
    IReadOnlyList<PerenualImage> Images,
    IReadOnlyList<PerenualPest> Pests,
    string? LongDescriptionEn,

    // True when ParseHardiness rejected an upstream pattern as a suspected
    // data-corruption artefact (currently: {min:"2", max:"2"}, observed on the
    // Solanum dulcamara entry that 8759/Tomato canonicalises into). The
    // controller logs a warning when this fires. See issue #66.
    bool HardinessRejectedAsSuspect,

    bool IsCanonicalMismatchDangerous,

    string MatchType);

/// <summary>An image returned by Perenual, ready for insert into <c>PlantImage</c>.</summary>
public record PerenualImage(
    string Url,
    string? ThumbnailUrl,
    string? LicenseName,
    string? LicenseUrl);

/// <summary>
/// A pest susceptibility name from Perenual's <c>pest_susceptibility</c> list,
/// already trimmed of leading/trailing whitespace and classified.
/// </summary>
public record PerenualPest(
    string Name,
    PlantPestType Type);
