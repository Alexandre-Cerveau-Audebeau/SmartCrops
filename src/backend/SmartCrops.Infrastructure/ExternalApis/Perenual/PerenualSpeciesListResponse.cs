using System.Text.Json.Serialization;

namespace SmartCrops.Infrastructure.ExternalApis.Perenual;

/// <summary>
/// Binding for <c>GET /species-list</c> in both modes:
/// <list type="bullet">
///   <item><c>?q={name}</c> — search by scientific name. Pagination metadata
///   present but unused by the resolver path (<see cref="PerenualResolver"/>
///   reads only <see cref="Data"/>).</item>
///   <item><c>?page={n}</c> — catalog enumeration. Pagination metadata is
///   load-bearing for the catalog fetcher (<c>Fetch-PerenualCatalog.ps1</c>,
///   SMA-13). <see cref="LastPage"/> + <see cref="Total"/> let the script
///   stop deterministically.</item>
/// </list>
/// <see cref="PerenualSpeciesListMatch"/> carries the per-entry filter fields
/// (cultivar / variety / hybrid / subspecies) used by the SMA-13 Strategy A
/// anti-cultivar filter; they are nullable and ignored by the resolver path.
/// </summary>
public class PerenualSpeciesListResponse
{
    [JsonPropertyName("data")]
    public List<PerenualSpeciesListMatch>? Data { get; set; }

    // ── Pagination metadata (SMA-13 catalog fetch) ─────────────────────────
    // These fields appear on every response (both ?q= and ?page= forms); the
    // resolver path simply ignores them. Nullable to tolerate Perenual omitting
    // them on edge responses (defensive — observed on empty result sets where
    // the upstream sometimes drops `to`/`from`).

    [JsonPropertyName("current_page")]
    public int? CurrentPage { get; set; }

    [JsonPropertyName("per_page")]
    public int? PerPage { get; set; }

    [JsonPropertyName("last_page")]
    public int? LastPage { get; set; }

    [JsonPropertyName("total")]
    public int? Total { get; set; }

    [JsonPropertyName("from")]
    public int? From { get; set; }

    [JsonPropertyName("to")]
    public int? To { get; set; }
}

/// <summary>
/// One <c>species-list</c> entry. Field set is the union of what the resolver
/// path consumes (<see cref="Id"/>, <see cref="ScientificName"/>,
/// <see cref="CommonName"/>) and what the SMA-13 catalog fetcher needs to
/// apply Strategy A (<see cref="Cultivar"/>, <see cref="Variety"/>,
/// <see cref="Hybrid"/>, <see cref="Subspecies"/>) plus category-heuristic
/// signals (<see cref="Family"/>, <see cref="OtherName"/>).
/// </summary>
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

    [JsonPropertyName("other_name")]
    public List<string>? OtherName { get; set; }

    [JsonPropertyName("family")]
    public string? Family { get; set; }

    // ── SMA-13 Strategy A filter fields ────────────────────────────────────
    // Any one of these being non-null marks the entry as a cultivar/variety/
    // hybrid/subspecies; the SMA-13 catalog fetcher drops such entries from
    // curated-batch2.csv. Sample (recon Phase 0, 90 entries pages 1/50/200):
    // cultivar carries 60% of the rejection signal; the other three add
    // belt-and-braces coverage for taxonomic edge cases.

    [JsonPropertyName("cultivar")]
    public string? Cultivar { get; set; }

    [JsonPropertyName("variety")]
    public string? Variety { get; set; }

    [JsonPropertyName("hybrid")]
    public string? Hybrid { get; set; }

    [JsonPropertyName("subspecies")]
    public string? Subspecies { get; set; }
}
