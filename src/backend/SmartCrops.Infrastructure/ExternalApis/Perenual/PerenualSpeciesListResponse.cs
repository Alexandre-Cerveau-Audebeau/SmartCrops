using System.Text.Json.Serialization;

namespace SmartCrops.Infrastructure.ExternalApis.Perenual;

/// <summary>
/// Minimal binding for <c>GET /species-list?q={name}</c>. Only the fields
/// needed to pick a best match are mapped — the full species record is
/// fetched separately by id once we've decided which match to keep.
/// </summary>
public class PerenualSpeciesListResponse
{
    [JsonPropertyName("data")]
    public List<PerenualSpeciesListMatch>? Data { get; set; }
}

public class PerenualSpeciesListMatch
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    /// <summary>
    /// Perenual returns scientific_name as an array of strings (most species
    /// have one entry, but cultivars and reclassifications may have multiple).
    /// The resolver matches against any entry case-insensitively.
    /// </summary>
    [JsonPropertyName("scientific_name")]
    public List<string>? ScientificName { get; set; }

    [JsonPropertyName("common_name")]
    public string? CommonName { get; set; }
}
