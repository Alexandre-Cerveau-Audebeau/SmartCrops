using SmartCrops.Infrastructure.ExternalApis.Gbif;

namespace SmartCrops.Api.Tests.ExternalApis.Gbif;

/// <summary>
/// Unit tests for <see cref="GbifVernacularSelector.SelectFrenchVernacular"/> using
/// fixtures shaped like real GBIF <c>vernacularNames</c> payloads (peppermint,
/// German iris, sage). Covers: fra-only filtering, casing/accent dedup, TAXREF
/// comma-concat splitting, preferred-flag precedence, frequency, deterministic
/// tie-breaks, and the empty/null cases.
/// </summary>
public class GbifVernacularSelectorTests
{
    private static GbifVernacularName V(string? name, string? lang, bool? preferred = null, string? source = null)
        => new() { VernacularName = name, Language = lang, Preferred = preferred, Source = source };

    [Fact]
    public void Mentha_DeduplicatesCaseAndAccent_PrefersAccentedVariant()
    {
        // Three fra entries collapse to ONE name; the accented variant is best-formed.
        var entries = new[]
        {
            V("Menthe poivree", "fra", source: "Catalogue of Life"),
            V("Menthe poivree", "fra", source: "Flora Helvetica"),
            V("menthe poivrée", "fra", source: "GRIN Taxonomy"),
            V("Peppermint", "eng"),
            V("Bahçe nanesi", "tur"),
        };

        Assert.Equal("menthe poivrée", GbifVernacularSelector.SelectFrenchVernacular(entries));
    }

    [Fact]
    public void Iris_SplitsTaxrefConcatenation_KeepsFirstSegment_NoResidualComma()
    {
        // TAXREF packs several names in one field; only the first segment survives,
        // and "Iris d'Allemagne" then wins on frequency (2 vs 1).
        var entries = new[]
        {
            V("Iris d'Allemagne, Flambe, Iris des jardins", "fra", source: "TAXREF"),
            V("Iris d'Allemagne", "fra", source: "DAISIE"),
            V("Iris des jardins", "fra", source: "Catalogue of Life"),
        };

        var result = GbifVernacularSelector.SelectFrenchVernacular(entries);

        Assert.Equal("Iris d'Allemagne", result);
        Assert.DoesNotContain(",", result);
    }

    [Fact]
    public void PreferredFlag_WinsOverMoreFrequentName()
    {
        // "Sauge" appears twice but the preferred entry must win regardless.
        var entries = new[]
        {
            V("Sauge", "fra"),
            V("Sauge", "fra"),
            V("Sauge officinale", "fra", preferred: true, source: "VASCAN"),
        };

        Assert.Equal("Sauge officinale", GbifVernacularSelector.SelectFrenchVernacular(entries));
    }

    [Fact]
    public void NoFrenchEntries_ReturnsNull()
    {
        var entries = new[]
        {
            V("Peppermint", "eng"),
            V("Pfefferminze", "deu"),
        };

        Assert.Null(GbifVernacularSelector.SelectFrenchVernacular(entries));
    }

    [Fact]
    public void EmptyInput_ReturnsNull()
    {
        Assert.Null(GbifVernacularSelector.SelectFrenchVernacular([]));
    }

    [Fact]
    public void AccentedVariant_BeatsUnaccented_EvenWhenLessFrequent()
    {
        // Same name, both forms; the accented "Cèdre" is the best-formed display of
        // the single collapsed group (frequency is shared, not split).
        var entries = new[]
        {
            V("Cedre", "fra"),
            V("Cedre", "fra"),
            V("Cèdre", "fra"),
        };

        Assert.Equal("Cèdre", GbifVernacularSelector.SelectFrenchVernacular(entries));
    }

    [Fact]
    public void EqualFrequency_NoPreferred_TieBreaksByShortestThenAlphabetical()
    {
        // Two distinct names, one occurrence each → shortest wins ("Thym" < "Serpolet").
        var entries = new[]
        {
            V("Serpolet", "fra"),
            V("Thym", "fra"),
        };

        Assert.Equal("Thym", GbifVernacularSelector.SelectFrenchVernacular(entries));
    }

    [Fact]
    public void BlankAndCommaOnlyNames_AreIgnored()
    {
        var entries = new[]
        {
            V("   ", "fra"),
            V(",", "fra"),
            V(null, "fra"),
            V("Lavande", "fra"),
        };

        Assert.Equal("Lavande", GbifVernacularSelector.SelectFrenchVernacular(entries));
    }

    [Fact]
    public void LanguageCodeFr_IsNotTreatedAsFrench()
    {
        // GBIF uses ISO 639-3 ("fra"); a stray "fr" must NOT be picked up.
        var entries = new[]
        {
            V("Faux ami", "fr"),
            V("Vrai nom", "fra"),
        };

        Assert.Equal("Vrai nom", GbifVernacularSelector.SelectFrenchVernacular(entries));
    }
}
