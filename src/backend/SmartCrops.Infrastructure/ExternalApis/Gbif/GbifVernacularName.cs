using System.Text.Json.Serialization;

namespace SmartCrops.Infrastructure.ExternalApis.Gbif;

/// <summary>
/// One entry of GBIF's <c>/v1/species/{key}/vernacularNames</c> response — the
/// minimal surface SMA-124 consumes to pick a French common name. GBIF returns
/// many entries per taxon (one per source, often duplicated by casing/accents),
/// so selection happens downstream in <see cref="GbifVernacularSelector"/>.
/// </summary>
public class GbifVernacularName
{
    /// <summary>The vernacular (common) name, e.g. <c>"menthe poivrée"</c>. GBIF
    /// casing is inconsistent and some sources (TAXREF) concatenate several names
    /// in one field separated by commas — the selector normalises both.</summary>
    [JsonPropertyName("vernacularName")]
    public string? VernacularName { get; set; }

    /// <summary>ISO 639-3 language code. French is <c>"fra"</c> (NOT <c>"fr"</c>).</summary>
    [JsonPropertyName("language")]
    public string? Language { get; set; }

    /// <summary>GBIF's preferred-name flag. Sparse and source-dependent (mostly
    /// VASCAN), so it is a strong hint but not the sole selection criterion.</summary>
    [JsonPropertyName("preferred")]
    public bool? Preferred { get; set; }

    /// <summary>Originating dataset (e.g. <c>"TAXREF"</c>, <c>"Catalogue of Life"</c>).
    /// Captured for diagnostics; not used by the selector.</summary>
    [JsonPropertyName("source")]
    public string? Source { get; set; }
}

/// <summary>
/// One page of GBIF's paginated <c>vernacularNames</c> response. The endpoint pages
/// via <c>offset</c>/<c>limit</c> and signals the final page with
/// <see cref="EndOfRecords"/>; <see cref="GbifClient.GetVernacularNamesAsync"/>
/// accumulates <see cref="Results"/> across pages until then.
/// </summary>
public class GbifVernacularNamesResponse
{
    [JsonPropertyName("results")]
    public List<GbifVernacularName> Results { get; set; } = [];

    [JsonPropertyName("endOfRecords")]
    public bool EndOfRecords { get; set; }

    [JsonPropertyName("offset")]
    public int Offset { get; set; }

    [JsonPropertyName("limit")]
    public int Limit { get; set; }
}
