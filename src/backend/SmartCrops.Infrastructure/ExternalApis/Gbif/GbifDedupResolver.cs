using SmartCrops.Core.Models;

namespace SmartCrops.Infrastructure.ExternalApis.Gbif;

/// <summary>
/// Pure dedup logic with no I/O. Implements the algorithm validated against the
/// GBIF Postman collection: <c>EXACT</c> or <c>FUZZY ≥ threshold</c> picks the
/// best available species key; <c>HIGHERRANK</c> descends into <c>alternatives</c>
/// looking for a <c>SPECIES</c>-rank entry; everything else (including a null
/// response from a failed call) is <c>NONE</c>.
/// </summary>
public class GbifDedupResolver
{
    private readonly int _fuzzyThreshold;

    public GbifDedupResolver(int fuzzyConfidenceThreshold)
    {
        _fuzzyThreshold = fuzzyConfidenceThreshold;
    }

    public PlantTaxonomyResult Resolve(GbifMatchResponse? response)
    {
        if (response is null || response.MatchType == "NONE")
        {
            return new PlantTaxonomyResult(null, null, null, null, "NONE", null, null);
        }

        // acceptedUsageKey wins over speciesKey wins over usageKey — GBIF returns
        // the accepted-synonym redirect via acceptedUsageKey when applicable.
        var key = response.MatchType switch
        {
            "EXACT" => response.AcceptedUsageKey ?? response.SpeciesKey ?? response.UsageKey,
            "FUZZY" when response.Confidence >= _fuzzyThreshold
                => response.AcceptedUsageKey ?? response.SpeciesKey ?? response.UsageKey,
            "FUZZY" => null,
            "HIGHERRANK" => response.Alternatives?
                .FirstOrDefault(a => a.Rank == "SPECIES")?.SpeciesKey,
            _ => null,
        };

        var speciesEpithet = ExtractEpithet(response.Species, response.Genus);

        return new PlantTaxonomyResult(
            GbifTaxonKey: key,
            Family: response.Family,
            Genus: response.Genus,
            SpeciesEpithet: speciesEpithet,
            MatchType: response.MatchType,
            Confidence: response.Confidence,
            CanonicalName: response.CanonicalName);
    }

    /// <summary>
    /// GBIF's <c>species</c> field carries the binomial (e.g. <c>"Solanum lycopersicum"</c>).
    /// The epithet is the trailing word after <c>"Genus "</c>. Returns <c>null</c> when
    /// the prefix mismatch suggests a malformed response (genus and species disagree).
    /// </summary>
    private static string? ExtractEpithet(string? species, string? genus)
    {
        if (string.IsNullOrWhiteSpace(species) || string.IsNullOrWhiteSpace(genus))
        {
            return null;
        }

        var prefix = genus + " ";
        return species.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            ? species[prefix.Length..]
            : null;
    }
}
