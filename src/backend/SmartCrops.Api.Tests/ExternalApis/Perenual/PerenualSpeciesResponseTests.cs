using System.Text.Json;
using SmartCrops.Infrastructure.ExternalApis.Perenual;

namespace SmartCrops.Api.Tests.ExternalApis.Perenual;

/// <summary>
/// DTO deserialization tests for <see cref="PerenualSpeciesResponse"/>.
/// Covers the polymorphic / quirky shapes documented during Phase 1 audit:
/// pruning_count as empty array OR object, dimensions.unit as empty string,
/// xTemperatureTolence typo preserved, hardiness min/max as suffix-bearing
/// strings, scientific_name as array.
/// </summary>
public class PerenualSpeciesResponseTests
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = false,
    };

    [Fact]
    public void Deserialize_RealisticAloePayload()
    {
        const string json = """
            {
              "id": 728,
              "scientific_name": ["Aloe vera"],
              "common_name": "aloe vera",
              "family": "Asphodelaceae",
              "type": "Herb",
              "cycle": "Perennial",
              "watering": "Minimum",
              "sunlight": ["full sun", "part shade"],
              "hardiness": { "min": "9a", "max": "11" },
              "maintenance": "Low",
              "indoor": true,
              "drought_tolerant": true,
              "medicinal": true,
              "poisonous_to_humans": false,
              "edible_fruit": false,
              "edible_leaf": false,
              "description": "Succulent perennial.",
              "propagation": ["Division", "Offsets"],
              "pest_susceptibility": ["Mealybugs", " Root rot"],
              "dimensions": [{ "type": "Height", "unit": "feet", "min_value": 1.0, "max_value": 3.0 }],
              "watering_general_benchmark": { "value": "\"7-10\"", "unit": "days" },
              "default_image": {
                "license": 451,
                "license_name": "CC BY 4.0",
                "original_url": "https://wasabi/aloe.jpg"
              }
            }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        Assert.Equal(728, resp!.Id);
        Assert.Equal("Aloe vera", resp.ScientificName!.Single());
        Assert.Equal("Asphodelaceae", resp.Family);
        Assert.Equal("Perennial", resp.Cycle);
        Assert.Equal("Minimum", resp.Watering);
        Assert.Equal("9a", resp.Hardiness!.Min);
        Assert.Equal("11", resp.Hardiness.Max);
        Assert.True(resp.Indoor);
        Assert.True(resp.DroughtTolerant);
        Assert.Equal(2, resp.PestSusceptibility!.Count);
        Assert.Equal(" Root rot", resp.PestSusceptibility[1]); // raw — resolver trims
        var dim = Assert.Single(resp.Dimensions!);
        Assert.Equal("feet", dim.Unit);
        Assert.Equal(1.0m, dim.MinValue);
        Assert.Equal("\"7-10\"", resp.WateringGeneralBenchmark!.Value);
        Assert.Equal("days", resp.WateringGeneralBenchmark.Unit);
        Assert.Equal("https://wasabi/aloe.jpg", resp.DefaultImage!.OriginalUrl);
    }

    [Fact]
    public void Deserialize_PruningCountAsEmptyArray()
    {
        // Edge case #4 from Phase 1 audit: pruning_count is sometimes an
        // empty array [] for Free-tier accounts or species with no data.
        // Bound to JsonElement so deser doesn't crash on the polymorphic shape.
        const string json = """
            { "id": 1, "scientific_name": ["x"], "pruning_count": [] }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        Assert.Equal(JsonValueKind.Array, resp!.PruningCount.ValueKind);
        Assert.Equal(0, resp.PruningCount.GetArrayLength());
    }

    [Fact]
    public void Deserialize_PruningCountAsObject()
    {
        const string json = """
            { "id": 1, "scientific_name": ["x"], "pruning_count": { "amount": 2, "interval": "yearly" } }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        Assert.Equal(JsonValueKind.Object, resp!.PruningCount.ValueKind);
        Assert.Equal(2, resp.PruningCount.GetProperty("amount").GetInt32());
        Assert.Equal("yearly", resp.PruningCount.GetProperty("interval").GetString());
    }

    [Fact]
    public void Deserialize_DimensionsUnitEmptyString()
    {
        // Edge case #2 from Phase 1 audit + Phase 4 smoke discovery: unit
        // can be empty string (not null), and dimensions is an array (not
        // an object) — fixed mid-Phase-4 after live response on Aloe 728.
        const string json = """
            { "id": 1, "scientific_name": ["x"], "dimensions": [{ "type": "Height", "unit": "", "min_value": null, "max_value": null }] }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        var dim = Assert.Single(resp!.Dimensions!);
        Assert.Equal(string.Empty, dim.Unit);
        Assert.Null(dim.MinValue);
    }

    [Fact]
    public void Deserialize_WateringGeneralBenchmark_QuotedValue()
    {
        // Phase 4 smoke discovery: Perenual emits watering_general_benchmark
        // as {value, unit} where value is wrapped in escaped quotes
        // (e.g. "\"7-10\"") for ranges. Resolver strips quotes before
        // persistence; the raw DTO preserves verbatim.
        const string json = """
            {
              "id": 1,
              "scientific_name": ["x"],
              "watering_general_benchmark": { "value": "\"7-10\"", "unit": "days" }
            }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        Assert.Equal("\"7-10\"", resp!.WateringGeneralBenchmark!.Value);
        Assert.Equal("days", resp.WateringGeneralBenchmark.Unit);

        var (val, unit) = PerenualResolver.ExtractWateringBenchmark(resp.WateringGeneralBenchmark);
        Assert.Equal("7-10", val); // wrapping quotes stripped
        Assert.Equal("days", unit);
    }

    [Fact]
    public void Deserialize_XTemperatureTolenceTypoPreserved()
    {
        // Edge case #3 from Phase 1 audit: Perenual ships this field with a
        // typo ("Tolence" instead of "Tolerance"). The DTO property must use
        // the misspelled JsonPropertyName so the value reaches our bindings.
        const string json = """
            {
              "id": 1,
              "scientific_name": ["x"],
              "xTemperatureTolence": { "unit": "F", "min_value": 25, "max_value": 95 }
            }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        Assert.Equal(JsonValueKind.Object, resp!.XTemperatureTolence.ValueKind);
        Assert.Equal(25, resp.XTemperatureTolence.GetProperty("min_value").GetInt32());
    }

    [Fact]
    public void Deserialize_HardinessMinMaxAsSuffixedStrings()
    {
        // Edge case #1 from Phase 1 audit: USDA hardiness emitted as strings
        // with optional letter suffix ("3a", "9b") — must bind as string, not int.
        const string json = """
            { "id": 1, "scientific_name": ["x"], "hardiness": { "min": "3a", "max": "9b" } }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        Assert.Equal("3a", resp!.Hardiness!.Min);
        Assert.Equal("9b", resp.Hardiness.Max);
    }

    [Fact]
    public void Deserialize_ScientificNameAsArray()
    {
        // Per audit: Perenual emits scientific_name as an array of strings.
        const string json = """
            { "id": 1, "scientific_name": ["Mentha piperita", "Mentha balsamea"] }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        Assert.Equal(2, resp!.ScientificName!.Count);
        Assert.Contains("Mentha balsamea", resp.ScientificName);
    }

    [Fact]
    public void Deserialize_SupremeXDataPresent_IsDetected()
    {
        const string json = """
            {
              "id": 8759,
              "scientific_name": ["Solanum lycopersicum"],
              "xWateringQuality": ["distilled water"],
              "xWateringPhLevel": { "min": 5.5, "max": 7.0 }
            }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        Assert.True(PerenualResolver.DetectSupremeData(resp!));
    }

    [Fact]
    public void Deserialize_FreeTierXDataEmpty_IsNotDetected()
    {
        // Free-tier accounts get the same xData keys present but as empty arrays.
        const string json = """
            {
              "id": 1,
              "scientific_name": ["x"],
              "xWateringQuality": [],
              "xWateringPhLevel": [],
              "xTemperatureTolence": []
            }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        Assert.False(PerenualResolver.DetectSupremeData(resp!));
    }

    [Fact]
    public void Deserialize_XDataAbsent_IsNotDetected()
    {
        const string json = """
            { "id": 1, "scientific_name": ["x"] }
            """;

        var resp = JsonSerializer.Deserialize<PerenualSpeciesResponse>(json, JsonOpts);

        Assert.NotNull(resp);
        Assert.False(PerenualResolver.DetectSupremeData(resp!));
    }
}
