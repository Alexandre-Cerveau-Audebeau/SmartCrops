using System.Text.Json;
using SmartCrops.Core.Enums;
using SmartCrops.Infrastructure.ExternalApis.Trefle;

namespace SmartCrops.Api.Tests.ExternalApis.Trefle;

/// <summary>
/// Pure unit tests for <see cref="TrefleResolver"/>. No HTTP, no DB —
/// exercises best-match selection, the JSON shape traps documented in the
/// resolver (empty image key, ISO 639-1 / 639-2 duplication), enum mapping,
/// and the structural invariants the controller relies on (collections
/// are never null, JSON payloads are null vs. "[]" when empty).
/// </summary>
public class TrefleResolverTests
{
    private static TrefleResolver NewResolver() => new();

    // ── PickBestMatch ──────────────────────────────────────────────────────

    [Fact]
    public void PickBestMatch_ExactCaseInsensitiveMatch_ReturnsId()
    {
        var response = new TrefleSearchResponse
        {
            Data =
            [
                new TrefleSearchMatch { Id = 1, ScientificName = "Solanum lycopersicum" },
                new TrefleSearchMatch { Id = 2, ScientificName = "Solanum melongena" },
            ],
        };

        var id = NewResolver().PickBestMatch(response, "solanum lycopersicum");

        Assert.Equal(1, id);
    }

    [Fact]
    public void PickBestMatch_NoExactMatch_ReturnsNull()
    {
        var response = new TrefleSearchResponse
        {
            Data =
            [
                new TrefleSearchMatch { Id = 1, ScientificName = "Lycopersicon esculentum" },
            ],
        };

        var id = NewResolver().PickBestMatch(response, "Solanum lycopersicum");

        Assert.Null(id);
    }

    [Fact]
    public void PickBestMatch_EmptyData_ReturnsNull()
    {
        var response = new TrefleSearchResponse { Data = [] };

        Assert.Null(NewResolver().PickBestMatch(response, "Anything"));
    }

    [Fact]
    public void PickBestMatch_NullResponse_ReturnsNull()
    {
        Assert.Null(NewResolver().PickBestMatch(null, "Anything"));
    }

    [Fact]
    public void PickBestMatch_NullData_ReturnsNull()
    {
        var response = new TrefleSearchResponse { Data = null };

        Assert.Null(NewResolver().PickBestMatch(response, "Anything"));
    }

    // ── Resolve — null / empty inputs ──────────────────────────────────────

    [Fact]
    public void Resolve_NullResponse_ReturnsNoneWithEmptyCollections()
    {
        var result = NewResolver().Resolve(null, rawJson: "{}");

        Assert.Equal("NONE", result.MatchType);
        Assert.Null(result.TrefleId);
        Assert.Empty(result.Images);
        Assert.Empty(result.CommonNames);
        Assert.Empty(result.Synonyms);
        Assert.Equal("{}", result.RawResponseJson);
    }

    [Fact]
    public void Resolve_NullData_ReturnsNoneWithEmptyCollections()
    {
        var response = new TrefleSpeciesResponse { Data = null };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Equal("NONE", result.MatchType);
        Assert.Empty(result.Images);
    }

    // ── Resolve — full mapping ─────────────────────────────────────────────

    [Fact]
    public void Resolve_FullResponse_MapsAllScalarFields()
    {
        var response = NewSpeciesResponse();
        response.Data!.Id = 12345;
        response.Data.Slug = "solanum-lycopersicum";
        response.Data.ScientificName = "Solanum lycopersicum";
        response.Data.Edible = true;
        response.Data.Vegetable = true;
        response.Data.Specifications = new TrefleSpecificationsDto { GrowthHabit = "Forb/herb" };
        response.Data.Growth = new TrefleGrowthDto
        {
            Light = 8,
            SoilNutriments = 7,
            PhMinimum = 5.5m,
            PhMaximum = 7.5m,
            MinimumTemperature = new TrefleTempDto { DegC = -5 },
            MaximumTemperature = new TrefleTempDto { DegC = 35 },
        };

        var result = NewResolver().Resolve(response, rawJson: "{\"ok\":true}");

        Assert.Equal("EXACT", result.MatchType);
        Assert.Equal(12345, result.TrefleId);
        Assert.Equal("solanum-lycopersicum", result.TrefleSlug);
        Assert.Equal("Solanum lycopersicum", result.CanonicalName);
        Assert.Equal("{\"ok\":true}", result.RawResponseJson);
        Assert.Equal("Forb/herb", result.GrowthHabit);
        Assert.True(result.IsEdible);
        Assert.True(result.IsVegetable);
        Assert.Equal(8, result.LightLevel);
        Assert.Equal(7, result.SoilNutriments);
        Assert.Equal(5.5m, result.SoilPhMin);
        Assert.Equal(7.5m, result.SoilPhMax);
        Assert.Equal(-5, result.MinTempC);
        Assert.Equal(35, result.MaxTempC);
    }

    // ── SMA-71: the 4 newly-wired Trefle-exclusive scalars ─────────────────

    [Fact]
    public void Resolve_MapsSalinityHumidityHeightAndGrowthRate_WhenPresent()
    {
        var response = NewSpeciesResponse();
        response.Data!.Growth = new TrefleGrowthDto
        {
            SoilSalinity = 4,
            AtmosphericHumidity = 6,
        };
        response.Data.Specifications = new TrefleSpecificationsDto
        {
            AverageHeight = new TrefleHeightDto { Cm = 120 },
            GrowthRate = "  Moderate  ", // trimmed
        };

        var result = NewResolver().Resolve(response, rawJson: "{\"ok\":true}");

        Assert.Equal(4, result.SoilSalinityLevel);
        Assert.Equal(6, result.AtmosphericHumidityLevel);
        Assert.Equal(120, result.AverageHeightCm);
        Assert.Equal("Moderate", result.GrowthRate);
    }

    [Fact]
    public void Resolve_LeavesNewScalarsNull_WhenAbsentOrBlank()
    {
        var response = NewSpeciesResponse();
        // Growth/Specifications present but without the new fields, growth_rate blank.
        response.Data!.Growth = new TrefleGrowthDto { Light = 8 };
        response.Data.Specifications = new TrefleSpecificationsDto { GrowthRate = "   " };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Null(result.SoilSalinityLevel);
        Assert.Null(result.AtmosphericHumidityLevel);
        Assert.Null(result.AverageHeightCm);
        Assert.Null(result.GrowthRate);
    }

    // ── WFO id extraction from sources ─────────────────────────────────────

    [Fact]
    public void Resolve_WfoSource_PopulatesWfoId()
    {
        var response = NewSpeciesResponse();
        response.Data!.Sources =
        [
            new TrefleSourceDto { Name = "USDA", Id = "ABC" },
            new TrefleSourceDto { Name = "WFO", Id = "wfo-0000936076" },
            new TrefleSourceDto { Name = "Other", Id = "X" },
        ];

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Equal("wfo-0000936076", result.WfoId);
    }

    [Fact]
    public void Resolve_WfoSource_LookupIsCaseInsensitive()
    {
        var response = NewSpeciesResponse();
        response.Data!.Sources = [new TrefleSourceDto { Name = "wfo", Id = "wfo-1" }];

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Equal("wfo-1", result.WfoId);
    }

    [Fact]
    public void Resolve_NoWfoSource_LeavesWfoIdNull()
    {
        var response = NewSpeciesResponse();
        response.Data!.Sources = [new TrefleSourceDto { Name = "USDA", Id = "ABC" }];

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Null(result.WfoId);
    }

    // ── Images — empty-string category trap + URL filtering ────────────────

    [Fact]
    public void Resolve_ImagesEmptyKeyDropped()
    {
        var response = NewSpeciesResponse();
        response.Data!.Images = new Dictionary<string, List<TrefleImageDto>>
        {
            [""] = [new TrefleImageDto { ImageUrl = "https://example.com/kew.jpg" }],
            ["flower"] = [new TrefleImageDto { ImageUrl = "https://example.com/f.jpg" }],
        };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Single(result.Images);
        Assert.Equal(PlantImageType.Flower, result.Images[0].ImageType);
    }

    [Fact]
    public void Resolve_ImagesBlankUrlsDropped()
    {
        var response = NewSpeciesResponse();
        response.Data!.Images = new Dictionary<string, List<TrefleImageDto>>
        {
            ["flower"] =
            [
                new TrefleImageDto { ImageUrl = null },
                new TrefleImageDto { ImageUrl = "   " },
                new TrefleImageDto { ImageUrl = "https://example.com/f.jpg" },
            ],
        };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Single(result.Images);
        Assert.Equal("https://example.com/f.jpg", result.Images[0].Url);
    }

    [Theory]
    [InlineData("flower", PlantImageType.Flower)]
    [InlineData("leaf", PlantImageType.Leaf)]
    [InlineData("fruit", PlantImageType.Fruit)]
    [InlineData("bark", PlantImageType.Bark)]
    [InlineData("habit", PlantImageType.Habit)]
    [InlineData("FLOWER", PlantImageType.Flower)] // case-insensitive
    [InlineData("unknown", PlantImageType.Other)] // unknown → Other
    [InlineData("other", PlantImageType.Other)]
    public void Resolve_ImageCategoryMapping(string trefleCategory, PlantImageType expected)
    {
        var response = NewSpeciesResponse();
        response.Data!.Images = new Dictionary<string, List<TrefleImageDto>>
        {
            [trefleCategory] = [new TrefleImageDto { ImageUrl = "https://x/img.jpg" }],
        };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Single(result.Images);
        Assert.Equal(expected, result.Images[0].ImageType);
    }

    [Fact]
    public void Resolve_ImagesPreservesLicenseAndCredit()
    {
        var response = NewSpeciesResponse();
        response.Data!.Images = new Dictionary<string, List<TrefleImageDto>>
        {
            ["leaf"] =
            [
                new TrefleImageDto
                {
                    ImageUrl = "https://x/l.jpg",
                    LicenseName = "CC BY-SA 4.0",
                    Copyright = "© Jane Doe",
                },
            ],
        };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Single(result.Images);
        Assert.Equal("CC BY-SA 4.0", result.Images[0].LicenseName);
        Assert.Equal("© Jane Doe", result.Images[0].Credit);
    }

    // ── Common names — ISO 639-2 → 639-1 canonicalisation + dedup ──────────

    [Theory]
    [InlineData("fra", "fr")]
    [InlineData("eng", "en")]
    [InlineData("deu", "de")]
    [InlineData("ger", "de")]
    [InlineData("spa", "es")]
    [InlineData("zho", "zh")]
    [InlineData("chi", "zh")]
    [InlineData("jpn", "ja")]
    [InlineData("rus", "ru")]
    [InlineData("ind", "id")]
    [InlineData("FR", "fr")] // already 2-char, just lowercased
    public void Resolve_CanonicalisesLanguageCodes(string input, string expected)
    {
        var response = NewSpeciesResponse();
        response.Data!.CommonNames = new Dictionary<string, List<string>>
        {
            [input] = ["Sample"],
        };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Single(result.CommonNames);
        Assert.Equal(expected, result.CommonNames[0].LanguageCode);
    }

    [Fact]
    public void Resolve_UnknownThreeCharLanguageCode_PassesThroughLowercase()
    {
        // "yue" (Cantonese) is not in the lookup table — should pass through
        // unchanged. Still BCP 47-valid (2-3 lowercase letters).
        var response = NewSpeciesResponse();
        response.Data!.CommonNames = new Dictionary<string, List<string>>
        {
            ["yue"] = ["蕃茄"],
        };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Single(result.CommonNames);
        Assert.Equal("yue", result.CommonNames[0].LanguageCode);
    }

    [Fact]
    public void Resolve_CommonNamesDedup_AcrossIsoVariants()
    {
        // Trefle emits the same name under "fra" and "fr" — both must
        // collapse to one (lang, name) row after canonicalisation.
        var response = NewSpeciesResponse();
        response.Data!.CommonNames = new Dictionary<string, List<string>>
        {
            ["fra"] = ["tomate"],
            ["fr"] = ["tomate", "Tomate"], // "Tomate" is a distinct casing — kept
        };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        var fr = result.CommonNames.Where(c => c.LanguageCode == "fr").ToArray();
        // HashSet uses ordinal equality, so "tomate" and "Tomate" are distinct.
        Assert.Equal(2, fr.Length);
        Assert.Contains(fr, c => c.Name == "tomate");
        Assert.Contains(fr, c => c.Name == "Tomate");
    }

    [Fact]
    public void Resolve_CommonNames_BlankAndEmptyDropped()
    {
        var response = NewSpeciesResponse();
        response.Data!.CommonNames = new Dictionary<string, List<string>>
        {
            ["en"] = ["", "  ", "tomato"],
            [""] = ["should-be-dropped"], // empty lang key
        };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Single(result.CommonNames);
        Assert.Equal("tomato", result.CommonNames[0].Name);
        Assert.Equal("en", result.CommonNames[0].LanguageCode);
    }

    [Fact]
    public void Resolve_CommonNames_NamesAreTrimmed()
    {
        var response = NewSpeciesResponse();
        response.Data!.CommonNames = new Dictionary<string, List<string>>
        {
            ["en"] = ["  tomato  "],
        };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Single(result.CommonNames);
        Assert.Equal("tomato", result.CommonNames[0].Name);
    }

    // ── Synonyms ───────────────────────────────────────────────────────────

    [Fact]
    public void Resolve_Synonyms_TrimmedAndDeduped()
    {
        var response = NewSpeciesResponse();
        response.Data!.Synonyms =
        [
            new TrefleSynonymDto { Name = "Lycopersicon esculentum", Author = "Mill." },
            new TrefleSynonymDto { Name = "  Lycopersicon esculentum  ", Author = "L." }, // dup after trim
            new TrefleSynonymDto { Name = "Lycopersicon lycopersicum", Author = null },
            new TrefleSynonymDto { Name = "", Author = "ignored" },
            new TrefleSynonymDto { Name = "   ", Author = "ignored" },
        ];

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Equal(2, result.Synonyms.Count);
        Assert.Equal("Lycopersicon esculentum", result.Synonyms[0].Name);
        Assert.Equal("Mill.", result.Synonyms[0].Authority);
        Assert.Equal("Lycopersicon lycopersicum", result.Synonyms[1].Name);
        Assert.Null(result.Synonyms[1].Authority);
    }

    // ── JSON list serialisation — null vs "[]" ─────────────────────────────

    [Fact]
    public void Resolve_FlowerColors_NullWhenEmpty()
    {
        var response = NewSpeciesResponse();
        response.Data!.Flower = new TrefleFlowerDto { Color = [] };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.Null(result.FlowerColorsJson);
    }

    [Fact]
    public void Resolve_FlowerColors_SerialisesToJsonArray()
    {
        var response = NewSpeciesResponse();
        response.Data!.Flower = new TrefleFlowerDto { Color = ["red", "pink"] };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.NotNull(result.FlowerColorsJson);
        var parsed = JsonSerializer.Deserialize<string[]>(result.FlowerColorsJson!);
        Assert.NotNull(parsed);
        Assert.Equal(["red", "pink"], parsed);
    }

    [Fact]
    public void Resolve_NativeAndIntroducedRegions_SerialiseIndependently()
    {
        var response = NewSpeciesResponse();
        response.Data!.Distribution = new TrefleDistributionDto
        {
            Native = ["FRA", "ITA"],
            Introduced = [],
        };

        var result = NewResolver().Resolve(response, rawJson: string.Empty);

        Assert.NotNull(result.NativeRegionsJson);
        Assert.Null(result.IntroducedRegionsJson);
    }

    private static TrefleSpeciesResponse NewSpeciesResponse() => new()
    {
        Data = new TrefleSpeciesData(),
    };
}
