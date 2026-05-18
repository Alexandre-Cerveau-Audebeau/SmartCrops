using SmartCrops.Infrastructure.ExternalApis.Gbif;

namespace SmartCrops.Api.Tests.ExternalApis.Gbif;

/// <summary>
/// Pure unit tests for the GBIF dedup algorithm. No DB, no HTTP — exercises
/// only the key-selection logic documented in <see cref="GbifDedupResolver.Resolve"/>.
/// </summary>
public class GbifDedupResolverTests
{
    private const int DefaultThreshold = 80;

    private static GbifDedupResolver NewResolver(int threshold = DefaultThreshold) =>
        new(threshold);

    // ── EXACT — acceptedUsageKey > speciesKey > usageKey precedence ────────

    [Fact]
    public void Exact_PicksAcceptedUsageKey_WhenPresent()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "EXACT",
            AcceptedUsageKey = 111,
            SpeciesKey = 222,
            UsageKey = 333,
        };

        var result = NewResolver().Resolve(response);

        Assert.Equal(111, result.GbifTaxonKey);
    }

    [Fact]
    public void Exact_FallsBackToSpeciesKey_WhenAcceptedNull()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "EXACT",
            SpeciesKey = 222,
            UsageKey = 333,
        };

        var result = NewResolver().Resolve(response);

        Assert.Equal(222, result.GbifTaxonKey);
    }

    [Fact]
    public void Exact_FallsBackToUsageKey_WhenAcceptedAndSpeciesNull()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "EXACT",
            UsageKey = 333,
        };

        var result = NewResolver().Resolve(response);

        Assert.Equal(333, result.GbifTaxonKey);
    }

    [Fact]
    public void Exact_ReturnsNullKey_WhenAllThreeKeysMissing()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "EXACT",
            // No keys — pathological response, treat as no resolution.
        };

        var result = NewResolver().Resolve(response);

        Assert.Null(result.GbifTaxonKey);
        Assert.Equal("EXACT", result.MatchType); // MatchType preserved for caller logging
    }

    // ── FUZZY — confidence threshold ───────────────────────────────────────

    [Theory]
    [InlineData(80)]   // boundary inclusive
    [InlineData(85)]
    [InlineData(100)]
    public void Fuzzy_AcceptedAtOrAboveThreshold(int confidence)
    {
        var response = new GbifMatchResponse
        {
            MatchType = "FUZZY",
            Confidence = confidence,
            AcceptedUsageKey = 444,
        };

        var result = NewResolver().Resolve(response);

        Assert.Equal(444, result.GbifTaxonKey);
        Assert.Equal(confidence, result.Confidence);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(50)]
    [InlineData(79)]   // just under boundary
    public void Fuzzy_RejectedBelowThreshold(int confidence)
    {
        var response = new GbifMatchResponse
        {
            MatchType = "FUZZY",
            Confidence = confidence,
            AcceptedUsageKey = 444,
        };

        var result = NewResolver().Resolve(response);

        Assert.Null(result.GbifTaxonKey);
        Assert.Equal("FUZZY", result.MatchType);
    }

    [Fact]
    public void Fuzzy_RespectsCustomThreshold()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "FUZZY",
            Confidence = 60,
            AcceptedUsageKey = 444,
        };

        var lenient = NewResolver(threshold: 50);
        Assert.Equal(444, lenient.Resolve(response).GbifTaxonKey);

        var strict = NewResolver(threshold: 90);
        Assert.Null(strict.Resolve(response).GbifTaxonKey);
    }

    // ── HIGHERRANK — alternatives lookup for SPECIES rank ──────────────────

    [Fact]
    public void HigherRank_PicksSpeciesKey_FromFirstSpeciesRankAlternative()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "HIGHERRANK",
            Alternatives =
            [
                new GbifMatchResponse { Rank = "GENUS", SpeciesKey = 100 },
                new GbifMatchResponse { Rank = "SPECIES", SpeciesKey = 555 },
                new GbifMatchResponse { Rank = "SPECIES", SpeciesKey = 666 },
            ],
        };

        var result = NewResolver().Resolve(response);

        Assert.Equal(555, result.GbifTaxonKey);
    }

    [Fact]
    public void HigherRank_ReturnsNull_WhenNoSpeciesRankAlternative()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "HIGHERRANK",
            Alternatives =
            [
                new GbifMatchResponse { Rank = "GENUS", SpeciesKey = 100 },
                new GbifMatchResponse { Rank = "FAMILY", SpeciesKey = 200 },
            ],
        };

        var result = NewResolver().Resolve(response);

        Assert.Null(result.GbifTaxonKey);
    }

    [Fact]
    public void HigherRank_ReturnsNull_WhenAlternativesNull()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "HIGHERRANK",
            Alternatives = null,
        };

        var result = NewResolver().Resolve(response);

        Assert.Null(result.GbifTaxonKey);
    }

    // ── NONE / null response ───────────────────────────────────────────────

    [Fact]
    public void None_ReturnsAllNull()
    {
        var response = new GbifMatchResponse { MatchType = "NONE" };

        var result = NewResolver().Resolve(response);

        Assert.Null(result.GbifTaxonKey);
        Assert.Equal("NONE", result.MatchType);
    }

    [Fact]
    public void NullResponse_TreatedAsNone()
    {
        var result = NewResolver().Resolve(null);

        Assert.Null(result.GbifTaxonKey);
        Assert.Equal("NONE", result.MatchType);
        Assert.Null(result.Family);
    }

    [Fact]
    public void UnknownMatchType_ReturnsNullKey()
    {
        // Defensive: GBIF docs list EXACT/FUZZY/HIGHERRANK/NONE but a future
        // variant should fail closed rather than blow up.
        var response = new GbifMatchResponse
        {
            MatchType = "UNKNOWN_FUTURE_VALUE",
            AcceptedUsageKey = 999,
        };

        var result = NewResolver().Resolve(response);

        Assert.Null(result.GbifTaxonKey);
    }

    // ── Species epithet extraction ─────────────────────────────────────────

    [Fact]
    public void SpeciesEpithet_Extracted_WhenSpeciesMatchesGenusPrefix()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "EXACT",
            AcceptedUsageKey = 1,
            Genus = "Solanum",
            Species = "Solanum lycopersicum",
        };

        var result = NewResolver().Resolve(response);

        Assert.Equal("lycopersicum", result.SpeciesEpithet);
    }

    [Fact]
    public void SpeciesEpithet_Null_WhenSpeciesMissingGenusPrefix()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "EXACT",
            AcceptedUsageKey = 1,
            Genus = "Solanum",
            Species = "Lycopersicon esculentum",
        };

        var result = NewResolver().Resolve(response);

        Assert.Null(result.SpeciesEpithet);
    }

    [Fact]
    public void SpeciesEpithet_Null_WhenGenusOrSpeciesMissing()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "EXACT",
            AcceptedUsageKey = 1,
            Genus = "Solanum",
            Species = null,
        };

        var result = NewResolver().Resolve(response);

        Assert.Null(result.SpeciesEpithet);
    }

    [Fact]
    public void Family_And_Genus_PassedThrough()
    {
        var response = new GbifMatchResponse
        {
            MatchType = "EXACT",
            AcceptedUsageKey = 1,
            Family = "Solanaceae",
            Genus = "Solanum",
            CanonicalName = "Solanum lycopersicum",
        };

        var result = NewResolver().Resolve(response);

        Assert.Equal("Solanaceae", result.Family);
        Assert.Equal("Solanum", result.Genus);
        Assert.Equal("Solanum lycopersicum", result.CanonicalName);
    }
}
