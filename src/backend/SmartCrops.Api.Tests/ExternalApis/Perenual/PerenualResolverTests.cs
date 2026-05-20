using System.Text.Json;
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
        var result = Resolver.Resolve(null, "raw", requestedPerenualId: null);

        Assert.Null(result.PerenualId);
        Assert.Equal("NONE", result.MatchType);
        Assert.Equal("raw", result.RawResponseJson);
        Assert.Empty(result.Images);
        Assert.Empty(result.Pests);
        Assert.Null(result.LongDescriptionEn);
        Assert.False(result.HardinessRejectedAsSuspect);
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

        var result = Resolver.Resolve(response, "{}", requestedPerenualId: 728);

        Assert.Equal(728, result.PerenualId);
        Assert.Equal(728, result.RequestedPerenualId);
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
        Assert.False(result.HardinessRejectedAsSuspect);
        Assert.Equal(2, result.Pests.Count);
        Assert.Equal("Succulent plant.", result.LongDescriptionEn);
    }

    // ── Hardiness suspect guard (issue #66) ───────────────────────────────

    /// <summary>
    /// Direct evidence pattern from the tomato canonicalisation incident:
    /// requesting <c>/species/details/8759</c> returns the Solanum dulcamara
    /// entry (id 8758) which ships <c>{min:"2", max:"2"}</c>. The guard drops
    /// the values and flags <c>HardinessRejectedAsSuspect</c>.
    /// </summary>
    [Fact]
    public void Resolve_HardinessMinMax2_RejectsAsSuspectAndDropsValues()
    {
        // Direct evidence pattern from the Solanum dulcamara entry (Perenual id
        // 8758) that the /species/details/8759 tomato request canonicalises into.
        var response = new PerenualSpeciesResponse
        {
            Id = 8758,
            ScientificName = ["Solanum lycopersicum"],
            Hardiness = new PerenualHardinessDto { Min = "2", Max = "2" },
        };

        var result = Resolver.Resolve(response, "{}", requestedPerenualId: 8759);

        Assert.True(result.HardinessRejectedAsSuspect);
        Assert.Null(result.HardinessZoneMin);
        Assert.Null(result.HardinessZoneMax);
        // Free coverage: this fixture (id 8758 ≠ requested 8759) is also the
        // canonical-mismatch case from issue #73 — the flag must fire here too.
        Assert.True(result.IsCanonicalMismatchDangerous);
    }

    // ── Canonical id mismatch (issue #73) ─────────────────────────────────

    /// <summary>
    /// Issue #73: when Perenual canonicalises the requested id to a different
    /// <c>response.id</c>, the payload may belong to a merged/different species.
    /// Detection is on the id mismatch ALONE (Q2 audit showed the payload's
    /// <c>scientific_name</c> can falsely match), so the flag fires regardless
    /// of name agreement.
    /// </summary>
    [Fact]
    public void Resolve_CanonicalIdMismatch_SetsFlag()
    {
        var response = new PerenualSpeciesResponse
        {
            Id = 8758,
            // Same name as the request — Perenual's inconsistent record. Name
            // comparison would NOT catch this; the id mismatch does.
            ScientificName = ["Solanum lycopersicum"],
        };

        var result = Resolver.Resolve(response, "{}", requestedPerenualId: 8759);

        Assert.True(result.IsCanonicalMismatchDangerous);
    }

    /// <summary>Happy path: <c>response.id</c> equals the requested id → no mismatch.</summary>
    [Fact]
    public void Resolve_CanonicalIdMatch_FlagFalse()
    {
        var response = new PerenualSpeciesResponse
        {
            Id = 728,
            ScientificName = ["Aloe vera"],
        };

        var result = Resolver.Resolve(response, "{}", requestedPerenualId: 728);

        Assert.False(result.IsCanonicalMismatchDangerous);
    }

    /// <summary>NoMatch (null response) has no canonical id to compare → flag false.</summary>
    [Fact]
    public void Resolve_NoMatchResponse_FlagFalse()
    {
        var result = Resolver.Resolve(null, "raw", requestedPerenualId: 8759);

        Assert.Equal("NONE", result.MatchType);
        Assert.False(result.IsCanonicalMismatchDangerous);
    }

    /// <summary>
    /// Edge case: a null <c>requestedPerenualId</c> (no id was asked for) means
    /// there is nothing to compare against, so no mismatch is detectable even
    /// when the response carries an id.
    /// </summary>
    [Fact]
    public void Resolve_NullRequestedPerenualId_FlagFalse()
    {
        var response = new PerenualSpeciesResponse
        {
            Id = 8758,
            ScientificName = ["Solanum lycopersicum"],
        };

        var result = Resolver.Resolve(response, "{}", requestedPerenualId: null);

        Assert.False(result.IsCanonicalMismatchDangerous);
    }

    /// <summary>
    /// Sanity that legitimate USDA bands (Aloe vera 9-11) keep their values
    /// untouched — the guard is opt-in to a single observed corruption
    /// pattern, not a general post-filter.
    /// </summary>
    [Fact]
    public void Resolve_HardinessNormalRange_DoesNotTriggerGuard()
    {
        var response = new PerenualSpeciesResponse
        {
            Id = 728,
            ScientificName = ["Aloe vera"],
            Hardiness = new PerenualHardinessDto { Min = "9a", Max = "11" },
        };

        var result = Resolver.Resolve(response, "{}", requestedPerenualId: 728);

        Assert.False(result.HardinessRejectedAsSuspect);
        Assert.Equal(9, result.HardinessZoneMin);
        Assert.Equal(11, result.HardinessZoneMax);
    }

    /// <summary>
    /// Anti-generalisation contract test. Zone 3-3 is a real alpine band and
    /// must survive even though it shares the <c>min == max</c> shape with
    /// the rejected zone 2-2 pattern.
    /// </summary>
    [Fact]
    public void Resolve_HardinessMinMax3_DoesNotGeneraliseGuard()
    {
        // Sanity that the guard is stricty {min:"2", max:"2"} — other
        // single-zone bands (zone 3, zone 5, …) are NOT rejected because we
        // only have evidence the upstream record is wrong for the {2,2} case.
        var response = new PerenualSpeciesResponse
        {
            Id = 999,
            ScientificName = ["Picea glauca"],
            Hardiness = new PerenualHardinessDto { Min = "3", Max = "3" },
        };

        var result = Resolver.Resolve(response, "{}", requestedPerenualId: 999);

        Assert.False(result.HardinessRejectedAsSuspect);
        Assert.Equal(3, result.HardinessZoneMin);
        Assert.Equal(3, result.HardinessZoneMax);
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

    // ── Perenual Supreme xData parsers (Sprint 1.5 PR B Phase 2b) ──────────

    /// <summary>Parse a JSON literal into a lifetime-independent <see cref="JsonElement"/>.</summary>
    private static JsonElement El(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void Parse_XWateringBasedTemperature_HappyPath()
    {
        var (minC, maxC) = PerenualResolver.ParseWateringBasedTemperature(
            El("{\"unit\":\"celcius\",\"min\":18,\"max\":24}"));

        Assert.Equal(18, minC);
        Assert.Equal(24, maxC);
    }

    [Fact]
    public void Parse_XWateringBasedTemperature_MissingMin_PartialPair()
    {
        var (minC, maxC) = PerenualResolver.ParseWateringBasedTemperature(El("{\"max\":24}"));

        Assert.Null(minC);
        Assert.Equal(24, maxC);
    }

    [Fact]
    public void Parse_XWateringBasedTemperature_PolymorphicArray_ReturnsNull()
    {
        var (minC, maxC) = PerenualResolver.ParseWateringBasedTemperature(El("[]"));

        Assert.Null(minC);
        Assert.Null(maxC);
    }

    [Fact]
    public void Parse_XWateringPhLevel_FloatingPointPrecision()
    {
        // Tomato audit: max ships as 6.79999… — GetDecimal must preserve it,
        // NOT GetDouble (which would lose precision).
        var (min, max) = PerenualResolver.ParseWateringPhLevel(
            El("{\"min\":6.0,\"max\":6.79999999999999982236431605997495353221893310546875}"));

        Assert.Equal(6.0m, min);
        Assert.NotNull(max);
        Assert.True(max > 6.79m && max < 6.8m, $"expected ~6.7999…, got {max}");
    }

    [Fact]
    public void Parse_XWateringPhLevel_OutOfRange_ReturnsNull()
    {
        var (min, max) = PerenualResolver.ParseWateringPhLevel(El("{\"min\":-1,\"max\":99}"));

        Assert.Null(min);
        Assert.Null(max);
    }

    [Fact]
    public void Parse_XSunlightDuration_EmptyMaxString_HalfOpenRange()
    {
        // Bounds ship as STRINGS; empty max = half-open range (4/6 audit plants).
        var (min, max) = PerenualResolver.ParseSunlightDuration(
            El("{\"min\":\"6\",\"max\":\"\",\"unit\":\"hours\"}"));

        Assert.Equal(6, min);
        Assert.Null(max);
    }

    [Fact]
    public void Parse_XTemperatureTolerance_PolymorphicArray_ReturnsNull()
    {
        // Tomato ships [] for this field — must not throw, returns (null, null).
        var (minC, maxC) = PerenualResolver.ParseTemperatureTolerance(El("[]"));

        Assert.Null(minC);
        Assert.Null(maxC);
    }

    [Fact]
    public void Parse_XTemperatureTolerance_PolymorphicObject_HappyPath()
    {
        // Note the underscore keys (min_value/max_value), distinct from xWateringBasedTemperature.
        var (minC, maxC) = PerenualResolver.ParseTemperatureTolerance(
            El("{\"unit\":\"Celcius\",\"min_value\":-10,\"max_value\":30}"));

        Assert.Equal(-10, minC);
        Assert.Equal(30, maxC);
    }

    [Fact]
    public void Parse_XPlantSpacingRequirement_PolymorphicArray_ReturnsNull()
    {
        var (value, unit) = PerenualResolver.ParsePlantSpacing(El("[]"));

        Assert.Null(value);
        Assert.Null(unit);
    }

    [Fact]
    public void Parse_XPlantSpacingRequirement_PolymorphicObject_HappyPath()
    {
        var (value, unit) = PerenualResolver.ParsePlantSpacing(
            El("{\"unit\":\"inches\",\"value\":18}"));

        Assert.Equal(18, value);
        Assert.Equal("inches", unit);
    }

    [Fact]
    public void Parse_XWateringQuality_NonEmptyArray_SerialisesCompact()
    {
        var json = PerenualResolver.ParseStringArrayElement(
            El("[\"Rainwater\", \"Distilled Water\"]"));

        Assert.Equal("[\"Rainwater\",\"Distilled Water\"]", json);
    }

    [Fact]
    public void Parse_XWateringQuality_EmptyArray_ReturnsNull()
    {
        Assert.Null(PerenualResolver.ParseStringArrayElement(El("[]")));
    }

    [Fact]
    public void Parse_StringArrayElement_NonArray_ReturnsNull()
    {
        Assert.Null(PerenualResolver.ParseStringArrayElement(El("{\"k\":\"v\"}")));
    }

    [Fact]
    public void Resolve_XDataCompleteFlow_AloePayload_PopulatesAllFields()
    {
        var response = new PerenualSpeciesResponse
        {
            Id = 728,
            ScientificName = ["Aloe vera"],
            XWateringBasedTemperature = El("{\"unit\":\"celcius\",\"min\":18,\"max\":24}"),
            XWateringPhLevel = El("{\"min\":6.0,\"max\":8.0}"),
            XSunlightDuration = El("{\"min\":\"4\",\"max\":\"6\",\"unit\":\"hours\"}"),
            XTemperatureTolence = El("{\"unit\":\"Celcius\",\"min_value\":-10,\"max_value\":38}"),
            XPlantSpacingRequirement = El("{\"unit\":\"inches\",\"value\":18}"),
            XWateringQuality = El("[\"Rainwater\",\"Distilled Water\"]"),
            XWateringPeriod = El("[\"Morning\",\"Evening\"]"),
        };

        var result = Resolver.Resolve(response, "{}", requestedPerenualId: 728);

        Assert.Equal(18, result.XWateringBasedTempMinC);
        Assert.Equal(24, result.XWateringBasedTempMaxC);
        Assert.Equal(6.0m, result.XWateringPhMin);
        Assert.Equal(8.0m, result.XWateringPhMax);
        Assert.Equal(4, result.XSunlightHoursMin);
        Assert.Equal(6, result.XSunlightHoursMax);
        Assert.Equal(-10, result.XTemperatureToleranceMinC);
        Assert.Equal(38, result.XTemperatureToleranceMaxC);
        Assert.Equal(18, result.XPlantSpacingValue);
        Assert.Equal("inches", result.XPlantSpacingUnit);
        Assert.Equal("[\"Rainwater\",\"Distilled Water\"]", result.XWateringQualityJson);
        Assert.Equal("[\"Morning\",\"Evening\"]", result.XWateringPeriodJson);
    }
}
