using SmartCrops.Core.Enums;

namespace SmartCrops.Core.Models;

/// <summary>
/// Outcome of a Trefle enrichment attempt. <see cref="TrefleId"/> is <c>null</c>
/// when no acceptable match was found; in that case the collections are empty
/// (never <c>null</c>) so the controller can rely on a stable shape and skip
/// dual-write entirely.
///
/// <para>Trefle's response is much richer than GBIF's, so this record carries
/// both denormalized scalars (mirrored onto <c>Plant</c> per ADR-0003) and the
/// 1-N enrichment tables (<c>PlantImage</c>, <c>PlantCommonName</c>,
/// <c>PlantSynonym</c>) the controller replaces on each enrichment.</para>
///
/// <para><see cref="MatchType"/> mirrors the GBIF convention (<c>EXACT</c> /
/// <c>NONE</c>) for consistency in caller logging — Trefle's API does not
/// expose its own match-type concept.</para>
/// </summary>
public record TrefleEnrichmentResult(
    int? TrefleId,
    string? TrefleSlug,
    string? WfoId,
    string? CanonicalName,
    string? RawResponseJson,

    // Denormalized scalars — also written to Plant on enrichment.
    string? GrowthHabit,
    bool? IsEdible,
    bool? IsVegetable,
    int? LightLevel,
    decimal? SoilPhMin,
    decimal? SoilPhMax,
    int? MinTempC,
    int? MaxTempC,
    int? SoilNutriments,

    // Structured JSON payloads — denormalized to Plant + retained on PlantTrefleData.
    string? FlowerColorsJson,
    string? FoliageColorsJson,
    string? NativeRegionsJson,
    string? IntroducedRegionsJson,

    // 1-N collections — controller does delete-then-insert for Source=Trefle on each call.
    IReadOnlyList<TrefleImage> Images,
    IReadOnlyList<TrefleCommonName> CommonNames,
    IReadOnlyList<TrefleSynonym> Synonyms,

    string MatchType);

/// <summary>A categorized image as returned by Trefle, ready for insert into <c>PlantImage</c>.</summary>
public record TrefleImage(
    string Url,
    PlantImageType ImageType,
    string? LicenseName,
    string? Credit);

/// <summary>
/// A common name with a BCP 47-compatible (lowercase) language code, already
/// canonicalised from Trefle's mixed ISO 639-1 / ISO 639-2 emission.
/// </summary>
public record TrefleCommonName(
    string LanguageCode,
    string Name);

/// <summary>A taxonomic synonym with optional publishing authority.</summary>
public record TrefleSynonym(
    string Name,
    string? Authority);
