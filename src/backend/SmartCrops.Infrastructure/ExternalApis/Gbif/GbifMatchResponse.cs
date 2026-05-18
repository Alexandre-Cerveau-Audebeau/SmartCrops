using System.Text.Json.Serialization;

namespace SmartCrops.Infrastructure.ExternalApis.Gbif;

/// <summary>
/// Partial mirror of the GBIF <c>/v1/species/match</c> response shape. Only the
/// fields consumed in D1 are bound — add more (kingdom, order, familyKey,
/// scientificName-with-author, etc.) when an ETL caller needs them. JSON
/// property names mirror GBIF's verbatim casing.
/// </summary>
public class GbifMatchResponse
{
    [JsonPropertyName("usageKey")]
    public int? UsageKey { get; set; }

    [JsonPropertyName("acceptedUsageKey")]
    public int? AcceptedUsageKey { get; set; }

    [JsonPropertyName("speciesKey")]
    public int? SpeciesKey { get; set; }

    [JsonPropertyName("canonicalName")]
    public string? CanonicalName { get; set; }

    [JsonPropertyName("rank")]
    public string? Rank { get; set; }

    [JsonPropertyName("matchType")]
    public string MatchType { get; set; } = "NONE";

    [JsonPropertyName("confidence")]
    public int? Confidence { get; set; }

    [JsonPropertyName("family")]
    public string? Family { get; set; }

    [JsonPropertyName("genus")]
    public string? Genus { get; set; }

    /// <summary>GBIF returns the binomial (e.g. <c>"Solanum lycopersicum"</c>) here.</summary>
    [JsonPropertyName("species")]
    public string? Species { get; set; }

    /// <summary>
    /// Populated only when <c>verbose=true</c> is on the request. For
    /// <c>matchType=HIGHERRANK</c> the SPECIES-rank entries land here.
    /// </summary>
    [JsonPropertyName("alternatives")]
    public List<GbifMatchResponse>? Alternatives { get; set; }
}
