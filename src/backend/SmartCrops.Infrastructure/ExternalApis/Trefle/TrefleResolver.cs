using System.Text.Json;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Models;

namespace SmartCrops.Infrastructure.ExternalApis.Trefle;

/// <summary>
/// Pure logic that translates Trefle responses into <see cref="TrefleEnrichmentResult"/>:
/// best-match selection from a search response, defensive flattening of the
/// species record's quirky JSON shapes, and ISO 639-2 → ISO 639-1 canonicalisation
/// for common-name language codes.
///
/// <para>No I/O, no DB, no logging — every behaviour here is unit-testable
/// from in-memory inputs.</para>
/// </summary>
public class TrefleResolver
{
    /// <summary>
    /// Pick the first search match whose <c>scientific_name</c> equals the
    /// query case-insensitively. Returns <c>null</c> when the response is
    /// empty or no exact match exists — we deliberately do not fall back to
    /// "closest match" because Trefle's search is permissive and a
    /// near-miss is almost always the wrong species.
    /// </summary>
    public int? PickBestMatch(TrefleSearchResponse? response, string scientificName)
    {
        if (response?.Data is not { Count: > 0 } matches)
        {
            return null;
        }

        var match = matches.FirstOrDefault(m =>
            string.Equals(m.ScientificName, scientificName, StringComparison.OrdinalIgnoreCase));
        return match?.Id;
    }

    /// <summary>
    /// Map a full species response to <see cref="TrefleEnrichmentResult"/>.
    /// A <c>null</c> response (or one with <c>data == null</c>) collapses to
    /// a <c>NONE</c> result with empty collections so the controller can
    /// rely on a stable shape.
    /// </summary>
    public TrefleEnrichmentResult Resolve(TrefleSpeciesResponse? speciesResponse, string rawJson)
    {
        var data = speciesResponse?.Data;
        if (data is null)
        {
            return new TrefleEnrichmentResult(
                TrefleId: null,
                TrefleSlug: null,
                WfoId: null,
                CanonicalName: null,
                RawResponseJson: rawJson,
                GrowthHabit: null,
                IsEdible: null,
                IsVegetable: null,
                LightLevel: null,
                SoilPhMin: null,
                SoilPhMax: null,
                MinTempC: null,
                MaxTempC: null,
                SoilNutriments: null,
                FlowerColorsJson: null,
                FoliageColorsJson: null,
                NativeRegionsJson: null,
                IntroducedRegionsJson: null,
                Images: Array.Empty<TrefleImage>(),
                CommonNames: Array.Empty<TrefleCommonName>(),
                Synonyms: Array.Empty<TrefleSynonym>(),
                MatchType: "NONE");
        }

        return new TrefleEnrichmentResult(
            TrefleId: data.Id,
            TrefleSlug: data.Slug,
            WfoId: ExtractWfoIdFromSources(data.Sources),
            CanonicalName: data.ScientificName,
            RawResponseJson: rawJson,
            GrowthHabit: data.Specifications?.GrowthHabit,
            IsEdible: data.Edible,
            IsVegetable: data.Vegetable,
            LightLevel: data.Growth?.Light,
            SoilPhMin: data.Growth?.PhMinimum,
            SoilPhMax: data.Growth?.PhMaximum,
            MinTempC: data.Growth?.MinimumTemperature?.DegC,
            MaxTempC: data.Growth?.MaximumTemperature?.DegC,
            SoilNutriments: data.Growth?.SoilNutriments,
            FlowerColorsJson: SerialiseStringList(data.Flower?.Color),
            FoliageColorsJson: SerialiseStringList(data.Foliage?.Color),
            NativeRegionsJson: SerialiseStringList(data.Distribution?.Native),
            IntroducedRegionsJson: SerialiseStringList(data.Distribution?.Introduced),
            Images: ExtractImages(data.Images),
            CommonNames: ExtractCommonNames(data.CommonNames),
            Synonyms: ExtractSynonyms(data.Synonyms),
            MatchType: "EXACT");
    }

    /// <summary>
    /// Trefle embeds a World Flora Online cross-reference in the <c>sources</c>
    /// array as an entry whose <c>name</c> is "WFO"; the <c>id</c> field on
    /// that entry is the WFO taxon id (e.g. "wfo-0000936076"). Returns
    /// <c>null</c> when the entry is absent.
    /// </summary>
    private static string? ExtractWfoIdFromSources(List<TrefleSourceDto>? sources)
    {
        if (sources is null)
        {
            return null;
        }

        return sources
            .FirstOrDefault(s => string.Equals(s.Name, "WFO", StringComparison.OrdinalIgnoreCase))
            ?.Id;
    }

    /// <summary>
    /// Serialise a non-empty string list to a JSON array; return <c>null</c>
    /// when the list is null or empty so the persistence layer stores
    /// <c>NULL</c> rather than the misleading literal <c>"[]"</c>.
    /// </summary>
    private static string? SerialiseStringList(List<string>? list)
    {
        if (list is not { Count: > 0 })
        {
            return null;
        }

        return JsonSerializer.Serialize(list);
    }

    /// <summary>
    /// Flatten Trefle's <c>images</c> dictionary into a list, mapping
    /// categories to <see cref="PlantImageType"/>. Handles two response traps:
    /// <list type="bullet">
    ///   <item>the dictionary may contain an empty-string key (Kew Gardens
    ///   uncategorised photos) — those entries are skipped;</item>
    ///   <item>individual image entries with a blank URL are skipped (would
    ///   violate the <c>CK_PlantImage_Url_NotBlank</c> CHECK constraint).</item>
    /// </list>
    /// </summary>
    private static IReadOnlyList<TrefleImage> ExtractImages(Dictionary<string, List<TrefleImageDto>>? images)
    {
        if (images is null)
        {
            return Array.Empty<TrefleImage>();
        }

        var result = new List<TrefleImage>();
        foreach (var (category, imageList) in images)
        {
            if (string.IsNullOrWhiteSpace(category) || imageList is null)
            {
                continue;
            }

            var type = MapCategoryToImageType(category);
            foreach (var img in imageList)
            {
                if (string.IsNullOrWhiteSpace(img.ImageUrl))
                {
                    continue;
                }

                result.Add(new TrefleImage(
                    Url: img.ImageUrl,
                    ImageType: type,
                    LicenseName: img.LicenseName,
                    Credit: img.Copyright));
            }
        }

        return result;
    }

    private static PlantImageType MapCategoryToImageType(string trefleCategory) =>
        trefleCategory.ToLowerInvariant() switch
        {
            "flower" => PlantImageType.Flower,
            "leaf" => PlantImageType.Leaf,
            "fruit" => PlantImageType.Fruit,
            "bark" => PlantImageType.Bark,
            "habit" => PlantImageType.Habit,
            _ => PlantImageType.Other,
        };

    /// <summary>
    /// Flatten Trefle's <c>common_names</c> dictionary into BCP 47-shaped rows.
    /// Trefle returns the same language under both ISO 639-2 ("fra") and
    /// ISO 639-1 ("fr") keys; we canonicalise to the 2-char form and dedup
    /// the resulting (lang, name) tuples so the per-language uniqueness
    /// expectations downstream hold.
    /// </summary>
    private static IReadOnlyList<TrefleCommonName> ExtractCommonNames(Dictionary<string, List<string>>? commonNames)
    {
        if (commonNames is null)
        {
            return Array.Empty<TrefleCommonName>();
        }

        var seen = new HashSet<(string Lang, string Name)>();
        var result = new List<TrefleCommonName>();
        foreach (var (rawLang, names) in commonNames)
        {
            if (string.IsNullOrWhiteSpace(rawLang) || names is null)
            {
                continue;
            }

            var canonical = CanonicaliseLanguageCode(rawLang.ToLowerInvariant());
            foreach (var name in names)
            {
                if (string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                var trimmed = name.Trim();
                if (seen.Add((canonical, trimmed)))
                {
                    result.Add(new TrefleCommonName(canonical, trimmed));
                }
            }
        }

        return result;
    }

    /// <summary>
    /// Map ISO 639-2 → ISO 639-1 for the top languages Trefle covers in
    /// practice. Unknown 3-char codes pass through unchanged — they are still
    /// accepted by the <c>CK_PlantCommonName_LanguageCode_Bcp47</c> CHECK
    /// constraint (the pattern allows 2-3 letter language subtags).
    /// </summary>
    private static string CanonicaliseLanguageCode(string code) => code switch
    {
        "fra" => "fr",
        "eng" => "en",
        "deu" or "ger" => "de",
        "spa" => "es",
        "ita" => "it",
        "por" => "pt",
        "nld" or "dut" => "nl",
        "swe" => "sv",
        "fin" => "fi",
        "dan" => "da",
        "nor" => "no",
        "pol" => "pl",
        "rus" => "ru",
        "zho" or "chi" => "zh",
        "jpn" => "ja",
        "kor" => "ko",
        "ara" => "ar",
        "tur" => "tr",
        "ell" or "gre" => "el",
        "ces" or "cze" => "cs",
        "hun" => "hu",
        "ron" or "rum" => "ro",
        "bul" => "bg",
        "ukr" => "uk",
        "heb" => "he",
        "ind" => "id",
        "tha" => "th",
        "vie" => "vi",
        _ => code,
    };

    private static IReadOnlyList<TrefleSynonym> ExtractSynonyms(List<TrefleSynonymDto>? synonyms)
    {
        if (synonyms is null)
        {
            return Array.Empty<TrefleSynonym>();
        }

        // Dedup by trimmed name — Trefle has been observed to duplicate
        // synonyms when the same name appears under multiple authorities,
        // and the DB index (PlantId, Synonym) is unique so a second insert
        // of the same string would blow up the transaction.
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<TrefleSynonym>();
        foreach (var s in synonyms)
        {
            if (string.IsNullOrWhiteSpace(s.Name))
            {
                continue;
            }

            var trimmed = s.Name.Trim();
            if (seen.Add(trimmed))
            {
                result.Add(new TrefleSynonym(trimmed, s.Author?.Trim()));
            }
        }

        return result;
    }
}
