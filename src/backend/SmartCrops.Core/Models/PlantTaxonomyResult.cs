namespace SmartCrops.Core.Models;

/// <summary>
/// Outcome of a taxonomy resolution attempt against an external authority
/// (GBIF in D1; future Trefle / Perenual ETLs may reuse the same shape).
///
/// <see cref="GbifTaxonKey"/> is <c>null</c> when no acceptable match was found:
/// <list type="bullet">
///   <item><c>matchType=NONE</c> from the upstream API</item>
///   <item><c>matchType=HIGHERRANK</c> with no SPECIES-rank entry in <c>alternatives</c></item>
///   <item><c>matchType=FUZZY</c> below the configured confidence threshold</item>
/// </list>
///
/// <see cref="CanonicalName"/> is kept for caller logging / debugging; it is not
/// persisted on the <c>Plant</c> aggregate (the scientific name on Plant is
/// authoritative and intentionally not overwritten by GBIF).
/// </summary>
/// <param name="Author">
/// SMA-71: taxonomic authority parsed from GBIF's <c>scientificName</c> (the
/// trailing authorship after the canonical binomial, e.g. <c>"L."</c>). <c>null</c>
/// when GBIF ships no authorship. First-writer-wins on <c>Plant.Author</c>.
/// </param>
/// <param name="RawResponseJson">
/// SMA-71 loss-proof capture: the verbatim GBIF <c>/species/match</c> response
/// body. Persisted on the <c>PlantSource</c> Gbif row so unmapped fields stay
/// re-derivable without a re-fetch. Attached by the service after the resolver
/// runs; <c>null</c> on the no-match / failure paths. Internal/audit only — never
/// surfaced in a public DTO. GBIF carries no API key in the URL or body, so no
/// redaction is required.
/// </param>
public record PlantTaxonomyResult(
    int? GbifTaxonKey,
    string? Family,
    string? Genus,
    string? SpeciesEpithet,
    string MatchType,
    int? Confidence,
    string? CanonicalName,
    string? Author = null,
    string? RawResponseJson = null);
