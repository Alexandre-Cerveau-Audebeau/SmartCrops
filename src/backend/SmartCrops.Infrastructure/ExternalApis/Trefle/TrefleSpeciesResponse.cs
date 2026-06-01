using System.Text.Json.Serialization;

namespace SmartCrops.Infrastructure.ExternalApis.Trefle;

/// <summary>
/// Partial binding for <c>GET /species/{id}</c>. Only the fields SmartCrops
/// writes somewhere are mapped — Trefle returns many more (bibliography,
/// extra growth panels, etc.) which we deliberately ignore to keep the
/// surface area small. The raw response is still retained verbatim on
/// <c>PlantTrefleData.RawResponseJson</c> for re-derivation.
/// </summary>
public class TrefleSpeciesResponse
{
    [JsonPropertyName("data")]
    public TrefleSpeciesData? Data { get; set; }
}

public class TrefleSpeciesData
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("scientific_name")] public string? ScientificName { get; set; }
    [JsonPropertyName("slug")] public string? Slug { get; set; }
    [JsonPropertyName("genus")] public string? Genus { get; set; }
    [JsonPropertyName("family")] public string? Family { get; set; }
    [JsonPropertyName("vegetable")] public bool? Vegetable { get; set; }
    [JsonPropertyName("edible")] public bool? Edible { get; set; }

    /// <summary>Language code → list of names. Same language is sometimes
    /// emitted twice under both ISO 639-1 and ISO 639-2 keys (see resolver).</summary>
    [JsonPropertyName("common_names")]
    public Dictionary<string, List<string>>? CommonNames { get; set; }

    [JsonPropertyName("synonyms")]
    public List<TrefleSynonymDto>? Synonyms { get; set; }

    /// <summary>Image category (flower / leaf / fruit / bark / habit / other) →
    /// list of images. The empty-string key ("") shows up for some species
    /// (Kew Gardens uncategorised photos) and is dropped by the resolver.</summary>
    [JsonPropertyName("images")]
    public Dictionary<string, List<TrefleImageDto>>? Images { get; set; }

    [JsonPropertyName("sources")]
    public List<TrefleSourceDto>? Sources { get; set; }

    [JsonPropertyName("growth")]
    public TrefleGrowthDto? Growth { get; set; }

    [JsonPropertyName("specifications")]
    public TrefleSpecificationsDto? Specifications { get; set; }

    [JsonPropertyName("flower")]
    public TrefleFlowerDto? Flower { get; set; }

    [JsonPropertyName("foliage")]
    public TrefleFoliageDto? Foliage { get; set; }

    [JsonPropertyName("distribution")]
    public TrefleDistributionDto? Distribution { get; set; }
}

public class TrefleSynonymDto
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("author")] public string? Author { get; set; }
}

public class TrefleImageDto
{
    [JsonPropertyName("image_url")] public string? ImageUrl { get; set; }
    [JsonPropertyName("license_name")] public string? LicenseName { get; set; }
    [JsonPropertyName("copyright")] public string? Copyright { get; set; }
}

public class TrefleSourceDto
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("citation")] public string? Citation { get; set; }
    [JsonPropertyName("url")] public string? Url { get; set; }
    [JsonPropertyName("id")] public string? Id { get; set; }
}

public class TrefleGrowthDto
{
    [JsonPropertyName("ph_minimum")] public decimal? PhMinimum { get; set; }
    [JsonPropertyName("ph_maximum")] public decimal? PhMaximum { get; set; }
    [JsonPropertyName("light")] public int? Light { get; set; }
    [JsonPropertyName("soil_nutriments")] public int? SoilNutriments { get; set; }
    [JsonPropertyName("minimum_temperature")] public TrefleTempDto? MinimumTemperature { get; set; }
    [JsonPropertyName("maximum_temperature")] public TrefleTempDto? MaximumTemperature { get; set; }

    /// <summary>SMA-71: soil-salinity tolerance on Trefle's 0-10 scale (was ignored).</summary>
    [JsonPropertyName("soil_salinity")] public int? SoilSalinity { get; set; }

    /// <summary>SMA-71: atmospheric-humidity preference on Trefle's 0-10 scale (was ignored).</summary>
    [JsonPropertyName("atmospheric_humidity")] public int? AtmosphericHumidity { get; set; }
}

public class TrefleTempDto
{
    [JsonPropertyName("deg_c")] public int? DegC { get; set; }
}

public class TrefleSpecificationsDto
{
    [JsonPropertyName("growth_habit")] public string? GrowthHabit { get; set; }

    /// <summary>SMA-71: average height; Trefle nests the value under <c>.cm</c> (was ignored).</summary>
    [JsonPropertyName("average_height")] public TrefleHeightDto? AverageHeight { get; set; }

    /// <summary>SMA-71: growth-rate label (e.g. "Slow"/"Moderate"/"Rapid"; was ignored).</summary>
    [JsonPropertyName("growth_rate")] public string? GrowthRate { get; set; }
}

public class TrefleHeightDto
{
    [JsonPropertyName("cm")] public int? Cm { get; set; }
}

public class TrefleFlowerDto
{
    [JsonPropertyName("color")] public List<string>? Color { get; set; }
}

public class TrefleFoliageDto
{
    [JsonPropertyName("color")] public List<string>? Color { get; set; }
}

public class TrefleDistributionDto
{
    /// <summary>TDWG region codes where the species is native.</summary>
    [JsonPropertyName("native")] public List<string>? Native { get; set; }

    /// <summary>TDWG region codes where the species has been introduced.</summary>
    [JsonPropertyName("introduced")] public List<string>? Introduced { get; set; }
}
