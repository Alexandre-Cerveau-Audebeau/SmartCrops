using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Models;

namespace SmartCrops.Infrastructure.ExternalApis.Perenual;

/// <summary>
/// Pure logic that translates Perenual responses into
/// <see cref="PerenualEnrichmentResult"/>: best-match selection with cultivar
/// marker handling, USDA hardiness string → int parsing, feet/inches → cm
/// dimension conversion, pest susceptibility classification, and defensive
/// flattening of the species record's quirky JSON shapes.
///
/// <para>No I/O, no DB, no logging — every behaviour here is unit-testable
/// from in-memory inputs.</para>
/// </summary>
public partial class PerenualResolver
{
    private const decimal CmPerFoot = 30.48m;
    private const decimal CmPerInch = 2.54m;

    /// <summary>
    /// Pick the first search match whose <c>scientific_name</c> equals the
    /// query case-insensitively, ignoring cultivar markers in the candidate
    /// (apostrophes, <c>var.</c>, <c>f.</c>, <c>(Group)</c>). Returns
    /// <c>null</c> when the response is empty or no acceptable match exists.
    ///
    /// <para>Cultivar handling: if no exact match exists, candidates that
    /// reduce to the query when their cultivar marker is stripped are still
    /// accepted (e.g. <c>"Allium sativum 'Inchelium Red'"</c> matches the
    /// query <c>"Allium sativum"</c>). The first such match wins. This
    /// trades some precision for coverage — 7/30 D1 seed plants only have
    /// cultivar entries in Perenual's index.</para>
    /// </summary>
    public int? PickBestMatch(PerenualSpeciesListResponse? response, string scientificName)
    {
        if (response?.Data is not { Count: > 0 } matches)
        {
            return null;
        }

        // Pass 1: exact case-insensitive match on any of the candidate's
        // scientific_name entries.
        foreach (var match in matches)
        {
            if (match.ScientificName is null)
            {
                continue;
            }

            if (match.ScientificName.Any(n =>
                string.Equals(n, scientificName, StringComparison.OrdinalIgnoreCase)))
            {
                return match.Id;
            }
        }

        // Pass 2: cultivar-stripped match. A "stripped" candidate like
        // "Allium sativum 'Inchelium Red'" → "Allium sativum" satisfies the
        // query "Allium sativum". Original (un-stripped) names are not retried
        // here — Pass 1 already covered them.
        foreach (var match in matches)
        {
            if (match.ScientificName is null)
            {
                continue;
            }

            if (match.ScientificName.Any(n =>
                string.Equals(StripCultivarMarkers(n), scientificName, StringComparison.OrdinalIgnoreCase)))
            {
                return match.Id;
            }
        }

        return null;
    }

    /// <summary>
    /// Map a full species response to <see cref="PerenualEnrichmentResult"/>.
    /// A <c>null</c> response collapses to a NONE result with empty collections
    /// so the controller can rely on a stable shape.
    /// </summary>
    /// <param name="requestedPerenualId">
    /// Id originally passed to <c>/species/details/{id}</c> on the call that
    /// produced <paramref name="response"/>. Surfaces in
    /// <see cref="PerenualEnrichmentResult.RequestedPerenualId"/> so the
    /// controller can persist the audit trail when Perenual canonicalises
    /// server-side (cf. issue #67).
    /// </param>
    public PerenualEnrichmentResult Resolve(
        PerenualSpeciesResponse? response,
        string rawJson,
        int? requestedPerenualId)
    {
        if (response is null)
        {
            return NoMatch(rawJson, requestedPerenualId);
        }

        var canonicalName = response.ScientificName?.FirstOrDefault();
        // Server-side canonicalisation: when the id Perenual returns differs
        // from the one we asked for, the payload may belong to a different
        // (merged/duplicate) species. We flag on the id mismatch alone — NOT a
        // name comparison, which Perenual's inconsistent records defeat (see
        // PerenualEnrichmentResult.IsCanonicalMismatchDangerous + issue #73).
        var canonicalMismatch = requestedPerenualId is int reqId && response.Id != reqId;
        var hardinessSuspect = IsHardinessSuspect(response.Hardiness);
        // Guard fired → drop the (almost certainly wrong) values. The controller
        // gets a flag in the result and emits a structured warning post-commit.
        var hardiness = hardinessSuspect
            ? (Min: (int?)null, Max: (int?)null)
            : ParseHardiness(response.Hardiness);
        var heights = ConvertHeightToCm(response.Dimensions);
        var watering = ExtractWateringBenchmark(response.WateringGeneralBenchmark);
        var ediblePartsJson = SerialiseEdibleParts(response.EdibleFruit, response.EdibleLeaf);
        var images = ExtractImages(response);
        var pests = ExtractPests(response.PestSusceptibility);
        var hasSupreme = DetectSupremeData(response);
        // SMA-71 queryable arrays (plant_anatomy/attracts/soil/other_name).
        var arrays = ExtractQueryableArrays(response);

        // Perenual Supreme xData — parsed even on a canonical mismatch; the
        // controller (Phase 2c) gates persistence. Each helper is null-safe to
        // the heterogeneous wire shapes (polymorphic array vs object, empty
        // string bounds, float pH artefacts) confirmed in the Phase 1 audit.
        var xWateringTemp = ParseWateringBasedTemperature(response.XWateringBasedTemperature);
        var xPh = ParseWateringPhLevel(response.XWateringPhLevel);
        var xSunlight = ParseSunlightDuration(response.XSunlightDuration);
        var xTempTol = ParseTemperatureTolerance(response.XTemperatureTolence);
        var xSpacing = ParsePlantSpacing(response.XPlantSpacingRequirement);
        var xWateringQuality = ParseStringArrayElement(response.XWateringQuality);
        var xWateringPeriod = ParseStringArrayElement(response.XWateringPeriod);

        return new PerenualEnrichmentResult(
            PerenualId: response.Id,
            RequestedPerenualId: requestedPerenualId,
            Cultivar: NullIfBlank(response.Cultivar),
            PerenualType: NullIfBlank(response.Type),
            CanonicalScientificName: canonicalName,
            RawResponseJson: rawJson,
            HasSupremeData: hasSupreme,

            LifeCycle: ParseLifeCycle(response.Cycle),
            GrowthRate: ParseGrowthRate(response.GrowthRate),
            WateringNeed: ParseWateringNeed(response.Watering),
            CareLevel: ParseCareLevel(response.Maintenance ?? response.CareLevel),
            HardinessZoneMin: hardiness.Min,
            HardinessZoneMax: hardiness.Max,
            MinHeightCm: heights.Min,
            MaxHeightCm: heights.Max,
            IsEdible: ComputeIsEdible(response.EdibleFruit, response.EdibleLeaf),
            IsIndoor: response.Indoor,
            IsDroughtTolerant: response.DroughtTolerant,
            IsSaltTolerant: response.SaltTolerant,
            IsThorny: response.Thorny,
            IsInvasive: response.Invasive,
            IsTropical: response.Tropical,
            IsMedicinal: response.Medicinal,
            IsToxicToHumans: response.PoisonousToHumans,
            IsToxicToPets: response.PoisonousToPets,

            EdiblePartsJson: ediblePartsJson,
            PropagationInstructions: JoinList(response.Propagation, "; "),
            SowingInstructions: null,

            OriginCountries: JoinList(response.Origin, ", "),
            SunlightPreferences: JoinList(response.Sunlight, ", "),
            // Perenual ships pruning_month with heavy duplication (e.g. 38
            // entries for spinach, joined string > 200 chars). Distinct() is
            // order-preserving on the first occurrence, so the persisted list
            // matches Perenual's intended chronology without the noise. Raw
            // duplicates are kept in RawResponseJson for the audit trail.
            PruningMonths: JoinList(response.PruningMonth?.Distinct().ToList(), ","),
            Maintenance: NullIfBlank(response.Maintenance),
            FloweringSeason: NullIfBlank(response.FloweringSeason),
            HarvestSeason: NullIfBlank(response.HarvestSeason),
            PlantAnatomyJson: arrays.PlantAnatomyJson,
            AttractsJson: arrays.AttractsJson,
            SoilJson: arrays.SoilJson,
            OtherNamesJson: arrays.OtherNamesJson,
            HasEdibleFruit: response.EdibleFruit,
            HasEdibleLeaves: response.EdibleLeaf,
            IsCulinary: response.Cuisine,
            PropagationMethods: JoinList(response.Propagation, ", "),
            WateringBenchmark: watering.Value,
            WateringBenchmarkUnit: watering.Unit,

            Images: images,
            Pests: pests,
            LongDescriptionEn: NullIfBlank(response.Description),

            HardinessRejectedAsSuspect: hardinessSuspect,
            IsCanonicalMismatchDangerous: canonicalMismatch,
            MatchType: "EXACT",

            XWateringBasedTempMinC: xWateringTemp.MinC,
            XWateringBasedTempMaxC: xWateringTemp.MaxC,
            XWateringPhMin: xPh.Min,
            XWateringPhMax: xPh.Max,
            XSunlightHoursMin: xSunlight.Min,
            XSunlightHoursMax: xSunlight.Max,
            XTemperatureToleranceMinC: xTempTol.MinC,
            XTemperatureToleranceMaxC: xTempTol.MaxC,
            XPlantSpacingValue: xSpacing.Value,
            XPlantSpacingUnit: xSpacing.Unit,
            XWateringQualityJson: xWateringQuality,
            XWateringPeriodJson: xWateringPeriod,
            PerenualGenus: DerivePerenualGenus(canonicalName));
    }

    /// <summary>
    /// Empty-collection NONE result for the no-match path. Keeps the
    /// controller's per-field dispatch logic uniform — callers always see a
    /// non-null record. <paramref name="requestedPerenualId"/> is preserved
    /// so the audit trail still records what we tried to fetch, even on a miss.
    /// </summary>
    public static PerenualEnrichmentResult NoMatch(string rawJson, int? requestedPerenualId = null) => new(
        PerenualId: null,
        RequestedPerenualId: requestedPerenualId,
        Cultivar: null,
        PerenualType: null,
        CanonicalScientificName: null,
        RawResponseJson: rawJson,
        HasSupremeData: false,
        LifeCycle: null,
        GrowthRate: null,
        WateringNeed: null,
        CareLevel: null,
        HardinessZoneMin: null,
        HardinessZoneMax: null,
        MinHeightCm: null,
        MaxHeightCm: null,
        IsEdible: null,
        IsIndoor: null,
        IsDroughtTolerant: null,
        IsSaltTolerant: null,
        IsThorny: null,
        IsInvasive: null,
        IsTropical: null,
        IsMedicinal: null,
        IsToxicToHumans: null,
        IsToxicToPets: null,
        EdiblePartsJson: null,
        PropagationInstructions: null,
        SowingInstructions: null,
        OriginCountries: null,
        SunlightPreferences: null,
        PruningMonths: null,
        Maintenance: null,
        FloweringSeason: null,
        HarvestSeason: null,
        PlantAnatomyJson: null,
        AttractsJson: null,
        SoilJson: null,
        OtherNamesJson: null,
        HasEdibleFruit: null,
        HasEdibleLeaves: null,
        IsCulinary: null,
        PropagationMethods: null,
        WateringBenchmark: null,
        WateringBenchmarkUnit: null,
        Images: Array.Empty<PerenualImage>(),
        Pests: Array.Empty<PerenualPest>(),
        LongDescriptionEn: null,
        HardinessRejectedAsSuspect: false,
        // No response → no canonical id to compare → no detectable mismatch.
        IsCanonicalMismatchDangerous: false,
        MatchType: "NONE",

        // No payload → no xData.
        XWateringBasedTempMinC: null,
        XWateringBasedTempMaxC: null,
        XWateringPhMin: null,
        XWateringPhMax: null,
        XSunlightHoursMin: null,
        XSunlightHoursMax: null,
        XTemperatureToleranceMinC: null,
        XTemperatureToleranceMaxC: null,
        XPlantSpacingValue: null,
        XPlantSpacingUnit: null,
        XWateringQualityJson: null,
        XWateringPeriodJson: null,
        PerenualGenus: null);

    // ── Perenual Supreme xData parsers (Sprint 1.5 PR B) ────────────────────
    // All null-safe to the heterogeneous wire shapes confirmed in the Phase 1
    // audit: polymorphic array-vs-object, empty-string bounds, float pH
    // artefacts. Range guards mirror the PlantPerenualData CHECK constraints so
    // a parsed value can never violate the DB on persistence.

    /// <summary>
    /// Parse <c>xWateringBasedTemperature {min, max}</c> (JSON numbers) into a
    /// Celsius pair. The unit is the literal <c>"celcius"</c> (Perenual typo) on
    /// every audited plant, so no conversion is applied. Non-object shapes and
    /// out-of-range values (outside -50..60) collapse to <c>null</c>.
    /// </summary>
    public static (int? MinC, int? MaxC) ParseWateringBasedTemperature(JsonElement el)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            return (null, null);
        }
        return EnsureOrderedRange(ReadIntInRange(el, "min", -50, 60), ReadIntInRange(el, "max", -50, 60));
    }

    /// <summary>
    /// Parse <c>xWateringPhLevel {min, max}</c> into a decimal pair, using
    /// <see cref="JsonElement.TryGetDecimal"/> to preserve precision on float
    /// artefacts (e.g. <c>6.79999…</c>). Values outside 0..14 collapse to null.
    /// </summary>
    public static (decimal? Min, decimal? Max) ParseWateringPhLevel(JsonElement el)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            return (null, null);
        }
        return EnsureOrderedRange(ReadDecimalInRange(el, "min", 0m, 14m), ReadDecimalInRange(el, "max", 0m, 14m));
    }

    /// <summary>
    /// Parse <c>xSunlightDuration {min, max}</c> — bounds ship as STRINGS
    /// (e.g. <c>"6"</c>) and the max is frequently the empty string <c>""</c>
    /// (half-open range, observed on 4/6 audit plants) which yields a null max.
    /// Values outside 0..24 collapse to null.
    /// </summary>
    public static (int? Min, int? Max) ParseSunlightDuration(JsonElement el)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            return (null, null);
        }
        return EnsureOrderedRange(ReadIntInRange(el, "min", 0, 24), ReadIntInRange(el, "max", 0, 24));
    }

    /// <summary>
    /// Parse <c>xTemperatureTolence {min_value, max_value}</c> (note the
    /// underscore keys, distinct from xWateringBasedTemperature, and Perenual's
    /// "Tolence" typo preserved on the DTO). Ships as a polymorphic empty array
    /// <c>[]</c> on some plants (e.g. tomato) — any non-object shape → null.
    /// Values outside -50..60 collapse to null.
    /// </summary>
    public static (int? MinC, int? MaxC) ParseTemperatureTolerance(JsonElement el)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            return (null, null);
        }
        return EnsureOrderedRange(ReadIntInRange(el, "min_value", -50, 60), ReadIntInRange(el, "max_value", -50, 60));
    }

    /// <summary>
    /// Parse <c>xPlantSpacingRequirement {value, unit}</c>. Ships as a
    /// polymorphic empty array <c>[]</c> on some plants — any non-object shape
    /// → (null, null). Negative values collapse to null (CHECK: value &gt;= 0).
    /// </summary>
    public static (int? Value, string? Unit) ParsePlantSpacing(JsonElement el)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            return (null, null);
        }
        var value = ReadIntInRange(el, "value", 0, int.MaxValue);
        string? unit = el.TryGetProperty("unit", out var u) && u.ValueKind == JsonValueKind.String
            ? NullIfBlank(u.GetString())
            : null;
        return (value, unit);
    }

    /// <summary>
    /// Serialise a Perenual JSON array to a compact JSON-array string for jsonb
    /// storage. Non-array shapes and empty arrays return <c>null</c> (no value to
    /// show). Element type-agnostic: used for the xData string arrays
    /// (xWateringQuality / xWateringPeriod) AND the SMA-71 queryable arrays —
    /// attracts/soil (strings) and plant_anatomy (<c>{part, color[]}</c> objects).
    /// </summary>
    public static string? ParseStringArrayElement(JsonElement el)
    {
        if (el.ValueKind != JsonValueKind.Array || el.GetArrayLength() == 0)
        {
            return null;
        }
        return JsonSerializer.Serialize(el);
    }

    /// <summary>
    /// SMA-71 — extract the four Perenual-exclusive queryable arrays
    /// (<c>plant_anatomy</c>, <c>attracts</c>, <c>soil</c>, <c>other_name</c>)
    /// from a species response into compact jsonb-ready JSON strings (empty/absent
    /// → <c>null</c>). Pure function of the response, so the live enrichment path
    /// (<see cref="Resolve"/>) and the literal-reprocessing backfill share ONE
    /// mapping — re-running it over the same stored literal is idempotent.
    /// </summary>
    public static PerenualQueryableArrays ExtractQueryableArrays(PerenualSpeciesResponse response) => new(
        PlantAnatomyJson: ParseStringArrayElement(response.PlantAnatomy),
        AttractsJson: ParseStringArrayElement(response.Attracts),
        SoilJson: ParseStringArrayElement(response.Soil),
        // other_name is mapped as List<string> (not JsonElement); serialise the
        // same way — null on null/empty so the contract matches the array fields.
        OtherNamesJson: SerialiseStringList(response.OtherName));

    /// <summary>
    /// Serialise a string list to a compact JSON-array string for jsonb storage,
    /// returning <c>null</c> on a null or empty list (parity with
    /// <see cref="ParseStringArrayElement"/> for the JsonElement-shaped arrays).
    /// </summary>
    public static string? SerialiseStringList(List<string>? items)
        => items is { Count: > 0 } ? JsonSerializer.Serialize(items) : null;

    /// <summary>
    /// Derive the genus from a Perenual scientific name (the first
    /// <c>scientific_name</c> entry, surfaced as
    /// <see cref="PerenualEnrichmentResult.CanonicalScientificName"/>). Perenual
    /// ships no dedicated genus field, so we take the first whitespace-delimited
    /// token: <c>"Solanum lycopersicum"</c> → <c>"Solanum"</c>. Returns
    /// <c>null</c> on null/blank input or when there is no whitespace separator
    /// (a single token can't be split into genus + epithet reliably). Used by
    /// the canonical-mismatch genus gate. See issue #75.
    /// </summary>
    public static string? DerivePerenualGenus(string? scientificName)
    {
        if (string.IsNullOrWhiteSpace(scientificName))
        {
            return null;
        }
        var trimmed = scientificName.Trim();
        var spaceIdx = trimmed.IndexOf(' ');
        return spaceIdx <= 0 ? null : trimmed[..spaceIdx];
    }

    /// <summary>
    /// Validate that a parsed min/max pair is ordered (min ≤ max). When both
    /// bounds are non-null and reversed (min &gt; max), null BOTH rather than
    /// swap — we don't know the upstream semantics, so we refuse to impute a
    /// guess (same conservative philosophy as the hardiness sentinel and genus
    /// gate). Also prevents reversed-but-in-range pairs from violating the
    /// PlantPerenualData min/max CHECK constraints on write. See CR PR #76 r1.
    /// </summary>
    private static (T? Min, T? Max) EnsureOrderedRange<T>(T? min, T? max)
        where T : struct, IComparable<T>
    {
        if (min.HasValue && max.HasValue && min.Value.CompareTo(max.Value) > 0)
        {
            return (null, null);
        }
        return (min, max);
    }

    /// <summary>
    /// Read an integer property from <paramref name="obj"/> tolerating both JSON
    /// number and numeric-string encodings. Returns <c>null</c> when the
    /// property is absent, unparseable, or outside <c>[min, max]</c>.
    /// </summary>
    private static int? ReadIntInRange(JsonElement obj, string name, int min, int max)
    {
        if (!obj.TryGetProperty(name, out var prop))
        {
            return null;
        }
        int? value = prop.ValueKind switch
        {
            JsonValueKind.Number when prop.TryGetInt32(out var n) => n,
            JsonValueKind.String when int.TryParse(
                prop.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var s) => s,
            _ => null,
        };
        return value is null || value < min || value > max ? null : value;
    }

    /// <summary>
    /// Read a decimal property from <paramref name="obj"/> tolerating both JSON
    /// number and numeric-string encodings, preserving full decimal precision.
    /// Returns <c>null</c> when absent, unparseable, or outside <c>[min, max]</c>.
    /// </summary>
    private static decimal? ReadDecimalInRange(JsonElement obj, string name, decimal min, decimal max)
    {
        if (!obj.TryGetProperty(name, out var prop))
        {
            return null;
        }
        decimal? value = prop.ValueKind switch
        {
            JsonValueKind.Number when prop.TryGetDecimal(out var n) => n,
            JsonValueKind.String when decimal.TryParse(
                prop.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var s) => s,
            _ => null,
        };
        return value is null || value < min || value > max ? null : value;
    }

    /// <summary>
    /// Parse a USDA hardiness zone string like <c>"3a"</c>, <c>"10"</c>, or
    /// <c>"9b"</c> into the leading integer. Letter suffix is ignored. Returns
    /// <c>null</c> on null/empty/unparseable input.
    /// </summary>
    public static int? ParseHardinessZone(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var trimmed = raw.Trim();
        var digits = new string(trimmed.TakeWhile(char.IsDigit).ToArray());
        if (digits.Length == 0)
        {
            return null;
        }

        return int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v) ? v : null;
    }

    /// <summary>
    /// Parse the upstream hardiness object into a <c>(min, max)</c> integer
    /// pair via <see cref="ParseHardinessZone"/>. Does not apply the
    /// suspect-pattern guard — callers run <see cref="IsHardinessSuspect"/>
    /// first and skip this when it fires.
    /// </summary>
    public static (int? Min, int? Max) ParseHardiness(PerenualHardinessDto? hardiness)
    {
        if (hardiness is null)
        {
            return (null, null);
        }

        return (ParseHardinessZone(hardiness.Min), ParseHardinessZone(hardiness.Max));
    }

    /// <summary>
    /// True when the upstream hardiness payload looks like a Perenual data
    /// corruption artefact rather than a real USDA zone band. The Resolver
    /// then drops the values and flags <see cref="PerenualEnrichmentResult.HardinessRejectedAsSuspect"/>
    /// so the controller can surface a warning.
    ///
    /// <para>Currently guards exactly <c>{min:"2", max:"2"}</c> — the pattern
    /// observed live on the Solanum dulcamara entry (Perenual id 8758) that
    /// receives every <c>/species/details/8759</c> request thanks to the
    /// upstream's server-side canonicalisation. We deliberately do not
    /// generalise: zone 2-2 IS a valid alpine band for some species, and we
    /// only reject it here because of the specific evidence we have on
    /// tomato. Future patterns require explicit extension. See issue #66.</para>
    /// </summary>
    public static bool IsHardinessSuspect(PerenualHardinessDto? hardiness)
    {
        if (hardiness is null)
        {
            return false;
        }
        return hardiness.Min == "2" && hardiness.Max == "2";
    }

    /// <summary>
    /// Convert Perenual dimensions to centimetres. Perenual emits
    /// <c>dimensions</c> as a list of measurement entries (Height, Spread,
    /// …) with <c>unit</c> as <c>"feet"</c>, <c>"inches"</c>, or empty
    /// string (NOT null). The first entry with a recognised unit and at
    /// least one of (min_value, max_value) populated is converted; others
    /// are dropped. Returns <c>(null, null)</c> when the list is empty or
    /// no entry has a usable unit.
    ///
    /// <para>The converted pair passes through <see cref="EnsureOrderedRange"/>
    /// before return, so a reversed (min &gt; max) source — e.g. Perenual's
    /// Anemone nemorosa <c>{feet, min:5, max:1.5}</c> → 152cm &gt; 46cm — is
    /// nulled on BOTH bounds rather than propagated. This mirrors the xData
    /// pairs and stops a reversed height from violating
    /// <c>CK_Plants_Height_Range</c> on persistence (which would roll back the
    /// whole Perenual enrichment). See SMA-64.</para>
    /// </summary>
    public static (int? Min, int? Max) ConvertHeightToCm(List<PerenualDimensionsDto>? dims)
    {
        if (dims is null)
        {
            return (null, null);
        }

        // Pass 1: prefer an entry explicitly tagged as Height (CR round 1
        // correctness fix). Phase 4 smoke worked by chance because Aloe ships
        // a single untagged Height entry first; a plant shipping Spread first
        // (or in addition) would mislead the height denormalisation.
        foreach (var dim in dims)
        {
            if (dim?.Type is not null
                && dim.Type.Contains("height", StringComparison.OrdinalIgnoreCase))
            {
                if (TryConvertDimension(dim) is { } heightHit)
                {
                    return EnsureOrderedRange(heightHit.Min, heightHit.Max);
                }
            }
        }

        // Pass 2: first usable entry of any type (preserves the prior
        // behaviour for payloads where dimension Type is null/blank).
        foreach (var dim in dims)
        {
            if (TryConvertDimension(dim) is { } anyHit)
            {
                return EnsureOrderedRange(anyHit.Min, anyHit.Max);
            }
        }

        return (null, null);
    }

    private static (int? Min, int? Max)? TryConvertDimension(PerenualDimensionsDto? dim)
    {
        if (dim is null || string.IsNullOrEmpty(dim.Unit))
        {
            return null;
        }

        decimal? perUnitCm = dim.Unit.ToLowerInvariant() switch
        {
            "feet" => CmPerFoot,
            "foot" => CmPerFoot,
            "inches" => CmPerInch,
            "inch" => CmPerInch,
            "cm" => 1m,
            "centimeters" => 1m,
            _ => null,
        };
        if (perUnitCm is null)
        {
            return null;
        }

        int? min = dim.MinValue is decimal mn ? (int)Math.Round(mn * perUnitCm.Value, MidpointRounding.AwayFromZero) : null;
        int? max = dim.MaxValue is decimal mx ? (int)Math.Round(mx * perUnitCm.Value, MidpointRounding.AwayFromZero) : null;
        if (min is null && max is null)
        {
            return null;
        }
        return (min, max);
    }

    /// <summary>
    /// Extract <c>watering_general_benchmark</c> into <c>(Value, Unit)</c>.
    /// Perenual wraps the value in escaped quotes (e.g. <c>"\"7-10\""</c>);
    /// the wrapping quotes are stripped before persistence so downstream
    /// consumers see the clean range string.
    /// </summary>
    public static (string? Value, string? Unit) ExtractWateringBenchmark(PerenualWateringBenchmarkDto? benchmark)
    {
        if (benchmark is null)
        {
            return (null, null);
        }

        var rawValue = benchmark.Value?.Trim();
        if (rawValue is { Length: >= 2 } && rawValue.StartsWith('"') && rawValue.EndsWith('"'))
        {
            rawValue = rawValue[1..^1];
        }
        return (NullIfBlank(rawValue), NullIfBlank(benchmark.Unit));
    }

    /// <summary>
    /// <c>IsEdible</c> is true when either fruit or leaf is edible. A single
    /// <c>true</c> wins; both <c>false</c> yields <c>false</c>; all-null
    /// yields <c>null</c> so the Plant-precedence merge does not overwrite a
    /// curated value with "unknown".
    /// </summary>
    public static bool? ComputeIsEdible(bool? edibleFruit, bool? edibleLeaf)
    {
        if (edibleFruit == true || edibleLeaf == true)
        {
            return true;
        }
        if (edibleFruit is null && edibleLeaf is null)
        {
            return null;
        }
        return false;
    }

    /// <summary>
    /// Build the JSON edible-parts payload (e.g. <c>["fruit","leaf"]</c>) from
    /// the two booleans. Returns <c>null</c> when neither is true so the
    /// persistence layer stores <c>NULL</c> rather than a misleading <c>"[]"</c>.
    /// </summary>
    public static string? SerialiseEdibleParts(bool? edibleFruit, bool? edibleLeaf)
    {
        var parts = new List<string>();
        if (edibleFruit == true) parts.Add("fruit");
        if (edibleLeaf == true) parts.Add("leaf");
        return parts.Count == 0 ? null : JsonSerializer.Serialize(parts);
    }

    /// <summary>Map Perenual's <c>cycle</c> string to <see cref="PlantLifeCycle"/>; unknown/blank → <c>null</c>.</summary>
    public static PlantLifeCycle? ParseLifeCycle(string? raw) => raw?.ToLowerInvariant().Trim() switch
    {
        null or "" => null,
        "herbaceous perennial" => PlantLifeCycle.HerbaceousPerennial,
        "perennial" => PlantLifeCycle.Perennial,
        "annual" => PlantLifeCycle.Annual,
        "biennial" => PlantLifeCycle.Biennial,
        _ => null,
    };

    /// <summary>Map Perenual's <c>growth_rate</c> string to <see cref="PlantGrowthRate"/>; unknown/blank → <c>null</c>.</summary>
    public static PlantGrowthRate? ParseGrowthRate(string? raw) => raw?.ToLowerInvariant().Trim() switch
    {
        null or "" => null,
        "low" or "slow" => PlantGrowthRate.Low,
        "moderate" or "medium" => PlantGrowthRate.Moderate,
        "high" or "fast" => PlantGrowthRate.High,
        _ => null,
    };

    /// <summary>Map Perenual's <c>watering</c> string to <see cref="PlantWateringNeed"/>; unknown/blank → <c>null</c>.</summary>
    public static PlantWateringNeed? ParseWateringNeed(string? raw) => raw?.ToLowerInvariant().Trim() switch
    {
        null or "" => null,
        "minimum" or "minimal" or "low" => PlantWateringNeed.Low,
        "average" or "moderate" or "medium" => PlantWateringNeed.Average,
        "frequent" => PlantWateringNeed.Frequent,
        "high" => PlantWateringNeed.High,
        _ => null,
    };

    /// <summary>Map Perenual's <c>maintenance</c>/<c>care_level</c> string to <see cref="PlantCareLevel"/>; unknown/blank → <c>null</c>.</summary>
    public static PlantCareLevel? ParseCareLevel(string? raw) => raw?.ToLowerInvariant().Trim() switch
    {
        null or "" => null,
        "low" or "easy" => PlantCareLevel.Easy,
        "moderate" or "medium" => PlantCareLevel.Medium,
        "high" or "difficult" => PlantCareLevel.Difficult,
        _ => null,
    };

    /// <summary>
    /// Classify a pest susceptibility string into <see cref="PlantPestType"/>.
    /// Perenual mixes disease and arthropod entries in the same list; we
    /// use simple keyword heuristics to bucket them. Pathogen-specific values
    /// (<see cref="PlantPestType.Fungus"/>, <see cref="PlantPestType.Bacteria"/>,
    /// <see cref="PlantPestType.Virus"/>, <see cref="PlantPestType.Mite"/>,
    /// <see cref="PlantPestType.Nematode"/>) are checked before the generic
    /// <see cref="PlantPestType.Disease"/> bucket so a causal agent is never
    /// collapsed into the catch-all (per <see cref="PlantPestType"/> XML doc).
    /// Unknown entries default to <see cref="PlantPestType.Other"/>.
    /// </summary>
    public static PlantPestType ClassifyPest(string name)
    {
        var lower = name.ToLowerInvariant();

        if (lower.Contains("virus"))
        {
            return PlantPestType.Virus;
        }
        if (lower.Contains("nematode"))
        {
            return PlantPestType.Nematode;
        }
        if (lower.Contains("fungus") || lower.Contains("fungal")
            || lower.Contains("mildew") || lower.Contains("mold")
            || lower.Contains("rust") || lower.Contains("blight"))
        {
            return PlantPestType.Fungus;
        }
        if (lower.Contains("bacteria") || lower.Contains("bacterial"))
        {
            return PlantPestType.Bacteria;
        }
        if (lower.Contains("mite"))
        {
            return PlantPestType.Mite;
        }
        if (lower.Contains("rot") || lower.Contains("wilt") || lower.Contains("disease"))
        {
            return PlantPestType.Disease;
        }
        if (lower.Contains("aphid") || lower.Contains("beetle") || lower.Contains("worm")
            || lower.Contains("bug") || lower.Contains("moth") || lower.Contains("fly")
            || lower.Contains("caterpillar") || lower.Contains("mealybug")
            || lower.Contains("scale insect") || lower.Contains("thrip")
            || lower.Contains("weevil") || lower.Contains("borer")
            || lower.Contains("leafhopper") || lower.Contains("whitefly"))
        {
            return PlantPestType.Insect;
        }
        return PlantPestType.Other;
    }

    /// <summary>
    /// Extract pest susceptibility entries with leading/trailing whitespace
    /// trimmed (Perenual has been observed to ship strings like
    /// <c>" Root rot"</c> with leading spaces). Empty entries are dropped;
    /// the (Name, Type) tuple is deduped case-insensitively to keep the
    /// transaction-scoped delete-then-insert from blowing up on the
    /// (PlantId, Name) uniqueness expectation.
    /// </summary>
    public static IReadOnlyList<PerenualPest> ExtractPests(List<string>? pests)
    {
        if (pests is null)
        {
            return Array.Empty<PerenualPest>();
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<PerenualPest>();
        foreach (var raw in pests)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                continue;
            }
            var trimmed = raw.Trim();
            if (seen.Add(trimmed))
            {
                result.Add(new PerenualPest(trimmed, ClassifyPest(trimmed)));
            }
        }
        return result;
    }

    /// <summary>
    /// Flatten the <c>default_image</c> + <c>other_images</c> arrays into a
    /// single list. Each image's primary URL is taken from <c>OriginalUrl</c>
    /// (Perenual's full-resolution URL), with <c>RegularUrl</c> fallback. The
    /// thumbnail comes from <c>Thumbnail</c>. Entries with no usable URL are
    /// skipped. Duplicate URLs are dropped to keep the per-plant insert batch
    /// idempotent.
    ///
    /// <para>The image URLs point at Wasabi S3 storage and do NOT embed the
    /// Perenual API key — safe to persist verbatim.</para>
    /// </summary>
    public static IReadOnlyList<PerenualImage> ExtractImages(PerenualSpeciesResponse response)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<PerenualImage>();

        if (response.DefaultImage is not null)
        {
            AddImage(response.DefaultImage, seen, result);
        }
        if (response.OtherImages is not null)
        {
            foreach (var img in response.OtherImages)
            {
                // System.Text.Json can produce null entries when the wire
                // payload contains a literal null inside the array
                // (e.g. `other_images: [null, {...}]`). Skip to avoid an
                // NRE in AddImage. CR round 1 defensive fix.
                if (img is null)
                {
                    continue;
                }
                AddImage(img, seen, result);
            }
        }

        return result;
    }

    private static void AddImage(PerenualImageDto img, HashSet<string> seen, List<PerenualImage> result)
    {
        var url = NullIfBlank(img.OriginalUrl) ?? NullIfBlank(img.RegularUrl) ?? NullIfBlank(img.MediumUrl);
        if (url is null || !seen.Add(url))
        {
            return;
        }

        result.Add(new PerenualImage(
            Url: url,
            ThumbnailUrl: NullIfBlank(img.Thumbnail),
            LicenseName: NullIfBlank(img.LicenseName),
            LicenseUrl: NullIfBlank(img.LicenseUrl)));
    }

    /// <summary>
    /// Detect whether the response contains Supreme-tier xData fields. The
    /// JsonElement check covers both presence (kind != Undefined) and the
    /// observed empty-array placeholder Perenual returns for Free-tier
    /// accounts on premium fields.
    /// </summary>
    public static bool DetectSupremeData(PerenualSpeciesResponse response)
    {
        return HasNonEmptyData(response.XWateringQuality)
            || HasNonEmptyData(response.XWateringPeriod)
            || HasNonEmptyData(response.XWateringAvgVolumeRequirement)
            || HasNonEmptyData(response.XWateringDepthRequirement)
            || HasNonEmptyData(response.XWateringBasedTemperature)
            || HasNonEmptyData(response.XWateringPhLevel)
            || HasNonEmptyData(response.XSunlightDuration)
            || HasNonEmptyData(response.XTemperatureTolence)
            || HasNonEmptyData(response.XPlantSpacingRequirement);
    }

    private static bool HasNonEmptyData(JsonElement el)
    {
        if (el.ValueKind == JsonValueKind.Undefined || el.ValueKind == JsonValueKind.Null)
        {
            return false;
        }
        if (el.ValueKind == JsonValueKind.Array && el.GetArrayLength() == 0)
        {
            return false;
        }
        return true;
    }

    /// <summary>
    /// Join a list with <paramref name="separator"/>, trimming entries and
    /// dropping blanks. Returns <c>null</c> (not <c>""</c>) when the input is
    /// null/empty or contains only blanks, so the persistence layer stores
    /// <c>NULL</c> rather than an empty string.
    /// </summary>
    public static string? JoinList(List<string>? items, string separator)
    {
        if (items is null || items.Count == 0)
        {
            return null;
        }
        var filtered = items.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()).ToList();
        return filtered.Count == 0 ? null : string.Join(separator, filtered);
    }

    /// <summary>Trim a string, collapsing null/whitespace-only input to <c>null</c>.</summary>
    public static string? NullIfBlank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    /// <summary>
    /// Strip cultivar markers from a candidate scientific name:
    /// <list type="bullet">
    ///   <item>cultivar group: <c>"Brassica oleracea (Acephala Group) 'Redbor'"</c> → <c>"Brassica oleracea"</c></item>
    ///   <item>variety: <c>"Mentha piperita var. citrata"</c> → <c>"Mentha piperita"</c></item>
    ///   <item>form: <c>"Mentha piperita f. citrata"</c> → <c>"Mentha piperita"</c></item>
    ///   <item>cultivar quote: <c>"Allium sativum 'Inchelium Red'"</c> → <c>"Allium sativum"</c></item>
    /// </list>
    /// </summary>
    public static string StripCultivarMarkers(string raw)
    {
        // Order matters: strip the rightmost-first markers (cultivar group,
        // var., f.) before the cultivar quote so a name with both is reduced
        // correctly.
        var stripped = CultivarGroupRegex().Replace(raw, "");
        stripped = VarietyOrFormRegex().Replace(stripped, "");
        stripped = CultivarQuoteRegex().Replace(stripped, "");
        return stripped.Trim();
    }

    [GeneratedRegex(@"\s*\([^)]*Group[^)]*\).*$", RegexOptions.IgnoreCase, "en-US")]
    private static partial Regex CultivarGroupRegex();

    [GeneratedRegex(@"\s+(var\.|f\.)\s+.*$", RegexOptions.IgnoreCase, "en-US")]
    private static partial Regex VarietyOrFormRegex();

    [GeneratedRegex(@"\s+'[^']*'.*$", RegexOptions.IgnoreCase, "en-US")]
    private static partial Regex CultivarQuoteRegex();
}

/// <summary>
/// SMA-71 — the four Perenual-exclusive queryable arrays serialised to
/// jsonb-ready JSON strings (each <c>null</c> when the upstream array was
/// empty/absent). Produced by <see cref="PerenualResolver.ExtractQueryableArrays"/>
/// and consumed by both the live enrichment write and the literal-reprocessing
/// backfill.
/// </summary>
public readonly record struct PerenualQueryableArrays(
    string? PlantAnatomyJson,
    string? AttractsJson,
    string? SoilJson,
    string? OtherNamesJson);
