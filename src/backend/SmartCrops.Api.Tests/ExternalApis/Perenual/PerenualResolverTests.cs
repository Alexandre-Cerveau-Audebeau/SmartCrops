using SmartCrops.Core.Enums;
using SmartCrops.Infrastructure.ExternalApis.Perenual;

namespace SmartCrops.Api.Tests.ExternalApis.Perenual;

/// <summary>
/// Unit tests for <see cref="PerenualResolver"/>. Covers the pure-logic
/// helpers added in PR Perenual Phase 2: cultivar-marker stripping, USDA
/// hardiness parsing, feet/inches → cm conversion, pest classification
/// hierarchy, image dedup, supreme-data detection, enum mapping, and the
/// 2-pass best-match algorithm.
/// </summary>
public class PerenualResolverTests
{
    private static readonly PerenualResolver Resolver = new();

    // ── StripCultivarMarkers ──────────────────────────────────────────────

    [Theory]
    [InlineData("Allium sativum 'Inchelium Red'", "Allium sativum")]
    [InlineData("Fragaria 'Allstar'", "Fragaria")]
    [InlineData("Mentha piperita var. citrata", "Mentha piperita")]
    [InlineData("Mentha piperita f. citrata", "Mentha piperita")]
    [InlineData("Brassica oleracea (Acephala Group) 'Redbor'", "Brassica oleracea")]
    [InlineData("Solanum lycopersicum", "Solanum lycopersicum")] // no markers → unchanged
    public void StripCultivarMarkers_HandlesAllForms(string input, string expected)
    {
        Assert.Equal(expected, PerenualResolver.StripCultivarMarkers(input));
    }

    // ── ParseHardinessZone ────────────────────────────────────────────────

    [Theory]
    [InlineData("3a", 3)]
    [InlineData("10", 10)]
    [InlineData("9b", 9)]
    [InlineData("13", 13)]
    [InlineData("1a", 1)]
    public void ParseHardinessZone_AcceptsUsdaFormats(string raw, int expected)
    {
        Assert.Equal(expected, PerenualResolver.ParseHardinessZone(raw));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("xyz")]
    [InlineData("a3")] // leading letter — no digits prefix
    public void ParseHardinessZone_ReturnsNullOnInvalid(string? raw)
    {
        Assert.Null(PerenualResolver.ParseHardinessZone(raw));
    }

    // ── ConvertHeightToCm ─────────────────────────────────────────────────

    [Fact]
    public void ConvertHeightToCm_FeetToCm()
    {
        var dims = new List<PerenualDimensionsDto>
        {
            new() { Unit = "feet", MinValue = 1m, MaxValue = 3m },
        };

        var (min, max) = PerenualResolver.ConvertHeightToCm(dims);

        Assert.Equal(30, min); // 1 ft = 30.48 cm → rounds to 30
        Assert.Equal(91, max); // 3 ft = 91.44 cm → rounds to 91
    }

    [Fact]
    public void ConvertHeightToCm_InchesToCm()
    {
        var dims = new List<PerenualDimensionsDto>
        {
            new() { Unit = "inches", MinValue = 6m, MaxValue = 12m },
        };

        var (min, max) = PerenualResolver.ConvertHeightToCm(dims);

        Assert.Equal(15, min); // 6 in = 15.24 cm
        Assert.Equal(30, max); // 12 in = 30.48 cm
    }

    [Fact]
    public void ConvertHeightToCm_EmptyUnitSkipsEntry()
    {
        // Edge case (Phase 1 audit + Phase 4 smoke confirmation): Perenual
        // emits unit as empty string (NOT null) when dimensions aren't
        // reported. Skip the entry, fall through to next or return (null, null).
        var dims = new List<PerenualDimensionsDto>
        {
            new() { Unit = "", MinValue = 1m, MaxValue = 3m },
        };

        var (min, max) = PerenualResolver.ConvertHeightToCm(dims);

        Assert.Null(min);
        Assert.Null(max);
    }

    [Fact]
    public void ConvertHeightToCm_NullListReturnsNullPair()
    {
        var (min, max) = PerenualResolver.ConvertHeightToCm(null);

        Assert.Null(min);
        Assert.Null(max);
    }

    [Fact]
    public void ConvertHeightToCm_UnknownUnitSkipsEntry()
    {
        var dims = new List<PerenualDimensionsDto>
        {
            new() { Unit = "parsecs", MinValue = 1m, MaxValue = 2m },
        };

        var (min, max) = PerenualResolver.ConvertHeightToCm(dims);

        Assert.Null(min);
        Assert.Null(max);
    }

    [Fact]
    public void ConvertHeightToCm_PicksFirstUsableEntry()
    {
        // Phase 4 smoke discovery: Perenual ships dimensions as an array.
        // Multi-entry case with all-untagged Types: first entry with a
        // known unit AND at least one populated value wins; later entries
        // are ignored.
        var dims = new List<PerenualDimensionsDto>
        {
            new() { Unit = "", MinValue = 0m, MaxValue = 0m }, // skipped (empty unit)
            new() { Unit = "feet", MinValue = 2m, MaxValue = 4m }, // wins
            new() { Unit = "inches", MinValue = 6m, MaxValue = 12m }, // ignored
        };

        var (min, max) = PerenualResolver.ConvertHeightToCm(dims);

        Assert.Equal(61, min); // 2 ft = 60.96 cm
        Assert.Equal(122, max); // 4 ft = 121.92 cm
    }

    [Fact]
    public void ConvertHeightToCm_PrefersHeightTypedEntry()
    {
        // CR round 1 REVIEW_NEEDED fix: when a Spread (or other non-height)
        // entry ships first, the resolver must skip it and pick the
        // Height-typed entry — otherwise MinHeightCm/MaxHeightCm would
        // carry spread values, silently corrupting the read model.
        var dims = new List<PerenualDimensionsDto>
        {
            new() { Type = "Spread", Unit = "feet", MinValue = 5m, MaxValue = 10m },
            new() { Type = "Height", Unit = "feet", MinValue = 2m, MaxValue = 4m },
        };

        var (min, max) = PerenualResolver.ConvertHeightToCm(dims);

        Assert.Equal(61, min); // 2 ft = 60.96 cm → 61 (Height entry, not Spread)
        Assert.Equal(122, max); // 4 ft = 121.92 cm → 122
    }

    [Fact]
    public void ConvertHeightToCm_HeightTypeMatchIsCaseInsensitive()
    {
        var dims = new List<PerenualDimensionsDto>
        {
            new() { Type = "Spread", Unit = "feet", MinValue = 5m, MaxValue = 10m },
            new() { Type = "plant HEIGHT", Unit = "feet", MinValue = 1m, MaxValue = 3m },
        };

        var (min, max) = PerenualResolver.ConvertHeightToCm(dims);

        Assert.Equal(30, min);
        Assert.Equal(91, max);
    }

    [Fact]
    public void ConvertHeightToCm_FallsBackToFirstUsableIfNoHeightType()
    {
        // Preserves the prior smoke-validated behaviour for payloads where
        // dimension Type is null/blank (e.g. Aloe 728 in Phase 4 ships
        // dimensions with type=null but unit=feet).
        var dims = new List<PerenualDimensionsDto>
        {
            new() { Type = null, Unit = "feet", MinValue = 1m, MaxValue = 3m },
        };

        var (min, max) = PerenualResolver.ConvertHeightToCm(dims);

        Assert.Equal(30, min);
        Assert.Equal(91, max);
    }

    [Fact]
    public void ExtractImages_SkipsNullEntries()
    {
        // CR round 1 REVIEW_NEEDED fix: System.Text.Json can produce null
        // entries in other_images when the wire payload contains a literal
        // null. Without the guard, AddImage would NRE and the whole
        // enrichment transaction would roll back.
        var response = new PerenualSpeciesResponse
        {
            DefaultImage = null,
            OtherImages = new List<PerenualImageDto>
            {
                null!,
                new() { OriginalUrl = "https://wasabi/usable.jpg" },
                null!,
            },
        };

        var images = PerenualResolver.ExtractImages(response);

        Assert.Single(images);
        Assert.Equal("https://wasabi/usable.jpg", images[0].Url);
    }

    // ── ComputeIsEdible truth table ───────────────────────────────────────

    [Theory]
    [InlineData(true, null, true)]
    [InlineData(null, true, true)]
    [InlineData(true, true, true)]
    [InlineData(false, false, false)]
    [InlineData(false, null, false)]
    [InlineData(null, false, false)]
    [InlineData(null, null, null)]
    public void ComputeIsEdible_TruthTable(bool? fruit, bool? leaf, bool? expected)
    {
        Assert.Equal(expected, PerenualResolver.ComputeIsEdible(fruit, leaf));
    }

    [Fact]
    public void SerialiseEdibleParts_BothTrue_ProducesJsonArray()
    {
        var json = PerenualResolver.SerialiseEdibleParts(true, true);

        Assert.Equal("[\"fruit\",\"leaf\"]", json);
    }

    [Fact]
    public void SerialiseEdibleParts_AllFalseOrNull_ReturnsNull()
    {
        Assert.Null(PerenualResolver.SerialiseEdibleParts(false, false));
        Assert.Null(PerenualResolver.SerialiseEdibleParts(null, null));
    }

    // ── ClassifyPest pathogen hierarchy ───────────────────────────────────

    [Theory]
    [InlineData("Tobacco Mosaic Virus", PlantPestType.Virus)]
    [InlineData("Root-knot Nematode", PlantPestType.Nematode)]
    [InlineData("Powdery Mildew", PlantPestType.Fungus)]
    [InlineData("Late Blight", PlantPestType.Fungus)]
    [InlineData("Wheat Rust", PlantPestType.Fungus)]
    [InlineData("Bacterial Leaf Spot", PlantPestType.Bacteria)]
    [InlineData("Spider Mite", PlantPestType.Mite)]
    [InlineData("Root Rot", PlantPestType.Disease)]
    [InlineData("Bacterial Wilt", PlantPestType.Bacteria)] // bacterial wins over wilt → Bacteria
    [InlineData("Aphids", PlantPestType.Insect)]
    [InlineData("Mealybugs", PlantPestType.Insect)]
    [InlineData("Scale Insects", PlantPestType.Insect)]
    [InlineData("Thrips", PlantPestType.Insect)]
    [InlineData("Some unclassified entry", PlantPestType.Other)]
    public void ClassifyPest_PathogenHierarchy(string name, PlantPestType expected)
    {
        Assert.Equal(expected, PerenualResolver.ClassifyPest(name));
    }

    [Fact]
    public void ClassifyPest_VirusWinsOverDisease()
    {
        // Per PlantPestType XML doc: "pathogen-specific values MUST be used
        // when Perenual identifies a causal agent — never collapse them into
        // Disease". This entry contains both "virus" and "disease" — Virus wins.
        Assert.Equal(PlantPestType.Virus, PerenualResolver.ClassifyPest("Cucumber mosaic virus disease"));
    }

    // ── ExtractPests trim + dedup ─────────────────────────────────────────

    [Fact]
    public void ExtractPests_TrimsLeadingAndTrailingSpaces()
    {
        // Edge case #5 from Phase 1 audit: Perenual ships entries like
        // " Root rot" with leading whitespace.
        var pests = PerenualResolver.ExtractPests(new List<string>
        {
            " Root rot",
            "Aphids  ",
            "  Mealybugs  ",
        });

        Assert.Collection(pests,
            p => Assert.Equal("Root rot", p.Name),
            p => Assert.Equal("Aphids", p.Name),
            p => Assert.Equal("Mealybugs", p.Name));
    }

    [Fact]
    public void ExtractPests_DedupsCaseInsensitive()
    {
        var pests = PerenualResolver.ExtractPests(new List<string>
        {
            "Aphids",
            "aphids",
            "APHIDS",
            "Spider Mite",
        });

        Assert.Equal(2, pests.Count);
        Assert.Contains(pests, p => p.Name == "Aphids");
        Assert.Contains(pests, p => p.Name == "Spider Mite");
    }

    [Fact]
    public void ExtractPests_DropsBlankAndNullEntries()
    {
        var pests = PerenualResolver.ExtractPests(new List<string>
        {
            "Aphids",
            "",
            "   ",
            "Mealybugs",
        });

        Assert.Equal(2, pests.Count);
    }

    [Fact]
    public void ExtractPests_NullListReturnsEmpty()
    {
        Assert.Empty(PerenualResolver.ExtractPests(null));
    }

    // ── PickBestMatch 2-pass ──────────────────────────────────────────────

    [Fact]
    public void PickBestMatch_ExactMatchInFirstPass()
    {
        var response = new PerenualSpeciesListResponse
        {
            Data =
            [
                new PerenualSpeciesListMatch { Id = 1, ScientificName = ["Other plant"] },
                new PerenualSpeciesListMatch { Id = 42, ScientificName = ["Solanum lycopersicum"] },
            ],
        };

        Assert.Equal(42, Resolver.PickBestMatch(response, "Solanum lycopersicum"));
    }

    [Fact]
    public void PickBestMatch_ExactMatchIsCaseInsensitive()
    {
        var response = new PerenualSpeciesListResponse
        {
            Data = [new PerenualSpeciesListMatch { Id = 42, ScientificName = ["SOLANUM LYCOPERSICUM"] }],
        };

        Assert.Equal(42, Resolver.PickBestMatch(response, "Solanum lycopersicum"));
    }

    [Fact]
    public void PickBestMatch_FallsBackToCultivarStripped()
    {
        // Real D1 case: Allium sativum 682 returns cultivar 'Inchelium Red'.
        // The query "Allium sativum" should still match via Pass 2.
        var response = new PerenualSpeciesListResponse
        {
            Data =
            [
                new PerenualSpeciesListMatch { Id = 682, ScientificName = ["Allium sativum 'Inchelium Red'"] },
            ],
        };

        Assert.Equal(682, Resolver.PickBestMatch(response, "Allium sativum"));
    }

    [Fact]
    public void PickBestMatch_ExactBeatsCultivarStripped()
    {
        // If both an exact and a cultivar-stripped match exist, the exact one wins.
        var response = new PerenualSpeciesListResponse
        {
            Data =
            [
                new PerenualSpeciesListMatch { Id = 1, ScientificName = ["Allium sativum 'Inchelium Red'"] },
                new PerenualSpeciesListMatch { Id = 2, ScientificName = ["Allium sativum"] },
            ],
        };

        Assert.Equal(2, Resolver.PickBestMatch(response, "Allium sativum"));
    }

    [Fact]
    public void PickBestMatch_EmptyListReturnsNull()
    {
        // Rosmarinus officinalis 0-match case (edge case #7 from Phase 1 audit).
        var response = new PerenualSpeciesListResponse { Data = [] };

        Assert.Null(Resolver.PickBestMatch(response, "Rosmarinus officinalis"));
    }

    [Fact]
    public void PickBestMatch_NullResponseReturnsNull()
    {
        Assert.Null(Resolver.PickBestMatch(null, "Anything"));
    }

    [Fact]
    public void PickBestMatch_NoMatchReturnsNull_DoesNotFallbackToFirst()
    {
        // Decision: no fallback to first match when neither exact nor cultivar
        // matches. Matches PR design intent (Option B simple).
        var response = new PerenualSpeciesListResponse
        {
            Data =
            [
                new PerenualSpeciesListMatch { Id = 1, ScientificName = ["Something completely different"] },
            ],
        };

        Assert.Null(Resolver.PickBestMatch(response, "Solanum lycopersicum"));
    }

    // ── Resolve null → NoMatch shape ──────────────────────────────────────

    [Fact]
    public void Resolve_NullResponseReturnsNoMatch()
    {
        var result = Resolver.Resolve(null, "raw");

        Assert.Null(result.PerenualId);
        Assert.Equal("NONE", result.MatchType);
        Assert.Equal("raw", result.RawResponseJson);
        Assert.Empty(result.Images);
        Assert.Empty(result.Pests);
        Assert.Null(result.LongDescriptionEn);
    }

    [Fact]
    public void Resolve_PopulatedResponseProducesExactResult()
    {
        var response = new PerenualSpeciesResponse
        {
            Id = 728,
            ScientificName = ["Aloe vera"],
            Type = "Herb",
            Cycle = "Perennial",
            Watering = "Minimum",
            Maintenance = "Low",
            Indoor = true,
            DroughtTolerant = true,
            Medicinal = true,
            EdibleLeaf = false,
            EdibleFruit = false,
            Hardiness = new PerenualHardinessDto { Min = "9a", Max = "11" },
            PestSusceptibility = ["Mealybugs", " Root rot"],
            Description = "Succulent plant.",
        };

        var result = Resolver.Resolve(response, "{}");

        Assert.Equal(728, result.PerenualId);
        Assert.Equal("Aloe vera", result.CanonicalScientificName);
        Assert.Equal("EXACT", result.MatchType);
        Assert.Equal(PlantLifeCycle.Perennial, result.LifeCycle);
        Assert.Equal(PlantWateringNeed.Low, result.WateringNeed);
        Assert.Equal(PlantCareLevel.Easy, result.CareLevel);
        Assert.True(result.IsIndoor);
        Assert.True(result.IsDroughtTolerant);
        Assert.True(result.IsMedicinal);
        Assert.False(result.IsEdible);
        Assert.Equal(9, result.HardinessZoneMin);
        Assert.Equal(11, result.HardinessZoneMax);
        Assert.Equal(2, result.Pests.Count);
        Assert.Equal("Succulent plant.", result.LongDescriptionEn);
    }

    // ── Enum parsers ──────────────────────────────────────────────────────

    [Theory]
    [InlineData("Perennial", PlantLifeCycle.Perennial)]
    [InlineData("perennial", PlantLifeCycle.Perennial)]
    [InlineData("Herbaceous Perennial", PlantLifeCycle.HerbaceousPerennial)]
    [InlineData("Annual", PlantLifeCycle.Annual)]
    [InlineData("Biennial", PlantLifeCycle.Biennial)]
    public void ParseLifeCycle_Known(string raw, PlantLifeCycle expected)
    {
        Assert.Equal(expected, PerenualResolver.ParseLifeCycle(raw));
    }

    [Theory]
    [InlineData("Frequent", PlantWateringNeed.Frequent)]
    [InlineData("Average", PlantWateringNeed.Average)]
    [InlineData("Minimum", PlantWateringNeed.Low)]
    [InlineData("Low", PlantWateringNeed.Low)]
    [InlineData("High", PlantWateringNeed.High)]
    public void ParseWateringNeed_Known(string raw, PlantWateringNeed expected)
    {
        Assert.Equal(expected, PerenualResolver.ParseWateringNeed(raw));
    }

    [Theory]
    [InlineData("Low", PlantCareLevel.Easy)]
    [InlineData("Moderate", PlantCareLevel.Medium)]
    [InlineData("High", PlantCareLevel.Difficult)]
    public void ParseCareLevel_Known(string raw, PlantCareLevel expected)
    {
        Assert.Equal(expected, PerenualResolver.ParseCareLevel(raw));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("xyz")]
    public void ParseLifeCycle_NullOrUnknownReturnsNull(string? raw)
    {
        Assert.Null(PerenualResolver.ParseLifeCycle(raw));
    }

    // ── ExtractImages ─────────────────────────────────────────────────────

    [Fact]
    public void ExtractImages_DefaultPlusOtherImages_PreservesOrderAndDedups()
    {
        var response = new PerenualSpeciesResponse
        {
            DefaultImage = new PerenualImageDto
            {
                OriginalUrl = "https://wasabi/default.jpg",
                Thumbnail = "https://wasabi/default-thumb.jpg",
                LicenseName = "CC BY 4.0",
            },
            OtherImages =
            [
                new PerenualImageDto { OriginalUrl = "https://wasabi/other1.jpg" },
                new PerenualImageDto { OriginalUrl = "https://wasabi/default.jpg" }, // dup of default
                new PerenualImageDto { OriginalUrl = "https://wasabi/other2.jpg" },
            ],
        };

        var images = PerenualResolver.ExtractImages(response);

        Assert.Equal(3, images.Count);
        Assert.Equal("https://wasabi/default.jpg", images[0].Url);
        Assert.Equal("CC BY 4.0", images[0].LicenseName);
        Assert.Equal("https://wasabi/other1.jpg", images[1].Url);
        Assert.Equal("https://wasabi/other2.jpg", images[2].Url);
    }

    [Fact]
    public void ExtractImages_FallsBackThroughUrlPriority()
    {
        // OriginalUrl absent → fall back to RegularUrl → MediumUrl.
        var response = new PerenualSpeciesResponse
        {
            DefaultImage = new PerenualImageDto { RegularUrl = "https://wasabi/regular.jpg" },
            OtherImages = [new PerenualImageDto { MediumUrl = "https://wasabi/medium.jpg" }],
        };

        var images = PerenualResolver.ExtractImages(response);

        Assert.Equal(2, images.Count);
        Assert.Equal("https://wasabi/regular.jpg", images[0].Url);
        Assert.Equal("https://wasabi/medium.jpg", images[1].Url);
    }

    [Fact]
    public void ExtractImages_NoUsableUrlSkipsEntry()
    {
        var response = new PerenualSpeciesResponse
        {
            DefaultImage = new PerenualImageDto { OriginalUrl = "  " },
            OtherImages = [new PerenualImageDto { OriginalUrl = "https://wasabi/other.jpg" }],
        };

        var images = PerenualResolver.ExtractImages(response);

        Assert.Single(images);
        Assert.Equal("https://wasabi/other.jpg", images[0].Url);
    }
}
