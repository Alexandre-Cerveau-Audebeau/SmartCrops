using System.Text.Json.Serialization;

namespace SmartCrops.Infrastructure.ExternalApis.Trefle;

/// <summary>
/// Minimal binding for <c>GET /species/search?q={name}</c>. Only the fields
/// needed to pick a best match are mapped — the full species record is
/// fetched separately by id once we've decided which match to keep.
/// </summary>
public class TrefleSearchResponse
{
    [JsonPropertyName("data")]
    public List<TrefleSearchMatch>? Data { get; set; }
}

public class TrefleSearchMatch
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("scientific_name")]
    public string? ScientificName { get; set; }

    [JsonPropertyName("slug")]
    public string? Slug { get; set; }
}
