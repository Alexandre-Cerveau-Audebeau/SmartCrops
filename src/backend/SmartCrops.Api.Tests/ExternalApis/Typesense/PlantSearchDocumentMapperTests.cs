using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Infrastructure.ExternalApis.Typesense;

namespace SmartCrops.Api.Tests.ExternalApis.Typesense;

/// <summary>
/// Unit tests for the Plant → Typesense document mapping (SMA-255 T2) — pure
/// mapper, no I/O. The contract under test is the "absence never excludes"
/// null handling: null enums → "unknown", null booleans → 3-state "unknown",
/// null numerics → omitted value + companion &lt;field&gt;Known=false — plus
/// the PlantListItemMapper-style localized resolution (fr falls back to en).
/// </summary>
public class PlantSearchDocumentMapperTests
{
    private static Plant PlantWith(Action<Plant>? mutate = null)
    {
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = "Solanum lycopersicum",
            PlantTypeId = 3,
        };
        mutate?.Invoke(plant);
        return plant;
    }

    private static PlantTranslation Translation(string language, string commonName, string? description = null)
        => new() { Language = language, CommonName = commonName, Description = description };

    // ── Identity ──────────────────────────────────────────────────────────

    [Fact]
    public void ToDocument_MapsIdentity_GuidStringScientificNameAndPlantTypeId()
    {
        var plant = PlantWith();

        var doc = PlantSearchDocumentMapper.ToDocument(plant);

        Assert.Equal(plant.Id.ToString(), doc.Id);
        Assert.Equal("Solanum lycopersicum", doc.ScientificName);
        Assert.Equal(3, doc.PlantTypeId);
    }

    // ── Localized resolution (requested lang + en fallback) ───────────────

    [Fact]
    public void ToDocument_BothTranslations_EachLanguageKeepsItsOwnText()
    {
        var plant = PlantWith(p =>
        {
            p.Translations.Add(Translation("en", "Tomato", "A red fruit."));
            p.Translations.Add(Translation("fr", "Tomate", "Un fruit rouge."));
        });

        var doc = PlantSearchDocumentMapper.ToDocument(plant);

        Assert.Equal("Tomato", doc.CommonNameEn);
        Assert.Equal("Tomate", doc.CommonNameFr);
        Assert.Equal("A red fruit.", doc.DescriptionEn);
        Assert.Equal("Un fruit rouge.", doc.DescriptionFr);
    }

    [Fact]
    public void ToDocument_MissingFrench_FrenchFieldsFallBackToEnglish()
    {
        var plant = PlantWith(p =>
            p.Translations.Add(Translation("en", "Tomato", "A red fruit.")));

        var doc = PlantSearchDocumentMapper.ToDocument(plant);

        Assert.Equal("Tomato", doc.CommonNameFr);
        Assert.Equal("A red fruit.", doc.DescriptionFr);
    }

    [Fact]
    public void ToDocument_MissingEnglish_EnglishFieldsStayNull_NoReverseFallback()
    {
        var plant = PlantWith(p =>
            p.Translations.Add(Translation("fr", "Tomate", "Un fruit rouge.")));

        var doc = PlantSearchDocumentMapper.ToDocument(plant);

        Assert.Null(doc.CommonNameEn);
        Assert.Null(doc.DescriptionEn);
        Assert.Equal("Tomate", doc.CommonNameFr);
        Assert.Equal("Un fruit rouge.", doc.DescriptionFr);
    }

    [Fact]
    public void ToDocument_NoTranslations_AllLocalizedFieldsNull()
    {
        var doc = PlantSearchDocumentMapper.ToDocument(PlantWith());

        Assert.Null(doc.CommonNameEn);
        Assert.Null(doc.CommonNameFr);
        Assert.Null(doc.DescriptionEn);
        Assert.Null(doc.DescriptionFr);
    }

    // ── Booleans: 3-state string facet ────────────────────────────────────

    [Theory]
    [InlineData(true, "true")]
    [InlineData(false, "false")]
    [InlineData(null, "unknown")]
    public void ToDocument_BooleanFacet_IsTriState(bool? value, string expected)
    {
        var plant = PlantWith(p => p.IsToxicToPets = value);

        var doc = PlantSearchDocumentMapper.ToDocument(plant);

        Assert.Equal(expected, doc.IsToxicToPets);
    }

    [Fact]
    public void ToDocument_AllBooleansNull_AllTenFacetsAreUnknown()
    {
        var doc = PlantSearchDocumentMapper.ToDocument(PlantWith());

        var facets = new[]
        {
            doc.IsEdible, doc.IsToxicToHumans, doc.IsToxicToPets, doc.IsIndoor,
            doc.IsDroughtTolerant, doc.IsMedicinal, doc.IsSaltTolerant,
            doc.IsThorny, doc.IsTropical, doc.IsInvasive,
        };

        Assert.All(facets, f => Assert.Equal(PlantSearchDocumentMapper.Unknown, f));
    }

    // ── Enums: name-or-"unknown" facet ────────────────────────────────────

    [Fact]
    public void ToDocument_NullEnums_AllFourFacetsAreUnknown()
    {
        var doc = PlantSearchDocumentMapper.ToDocument(PlantWith());

        Assert.Equal("unknown", doc.CareLevel);
        Assert.Equal("unknown", doc.WateringNeedLevel);
        Assert.Equal("unknown", doc.GrowthRate);
        Assert.Equal("unknown", doc.LifeCycle);
    }

    [Fact]
    public void ToDocument_EnumValues_MapToEnumMemberNames()
    {
        var plant = PlantWith(p =>
        {
            p.CareLevel = PlantCareLevel.Medium;
            p.WateringNeedLevel = PlantWateringNeed.Frequent;
            p.GrowthRate = PlantGrowthRate.Moderate;
            p.LifeCycle = PlantLifeCycle.HerbaceousPerennial;
        });

        var doc = PlantSearchDocumentMapper.ToDocument(plant);

        Assert.Equal("Medium", doc.CareLevel);
        Assert.Equal("Frequent", doc.WateringNeedLevel);
        Assert.Equal("Moderate", doc.GrowthRate);
        Assert.Equal("HerbaceousPerennial", doc.LifeCycle);
    }

    // ── Numerics: omitted value + <field>Known companion ──────────────────

    [Fact]
    public void ToDocument_AllNumericsNull_ValuesNullAndKnownFalse()
    {
        // No PerenualData at all is the harshest null case: every xData facet
        // must degrade exactly like a null column.
        var doc = PlantSearchDocumentMapper.ToDocument(PlantWith());

        Assert.Null(doc.HardinessZoneMin);
        Assert.False(doc.HardinessZoneMinKnown);
        Assert.Null(doc.HardinessZoneMax);
        Assert.False(doc.HardinessZoneMaxKnown);
        Assert.Null(doc.MinHeightCm);
        Assert.False(doc.MinHeightCmKnown);
        Assert.Null(doc.MaxHeightCm);
        Assert.False(doc.MaxHeightCmKnown);
        Assert.Null(doc.XSunlightHoursMin);
        Assert.False(doc.XSunlightHoursMinKnown);
        Assert.Null(doc.XSunlightHoursMax);
        Assert.False(doc.XSunlightHoursMaxKnown);
        Assert.Null(doc.XWateringPhMin);
        Assert.False(doc.XWateringPhMinKnown);
        Assert.Null(doc.XWateringPhMax);
        Assert.False(doc.XWateringPhMaxKnown);
        Assert.Null(doc.XWateringBasedTempMinC);
        Assert.False(doc.XWateringBasedTempMinCKnown);
        Assert.Null(doc.XWateringBasedTempMaxC);
        Assert.False(doc.XWateringBasedTempMaxCKnown);
        Assert.Null(doc.XPlantSpacingValue);
        Assert.False(doc.XPlantSpacingValueKnown);
        Assert.Null(doc.XTemperatureToleranceMinC);
        Assert.False(doc.XTemperatureToleranceMinCKnown);
        Assert.Null(doc.XTemperatureToleranceMaxC);
        Assert.False(doc.XTemperatureToleranceMaxCKnown);
    }

    [Fact]
    public void ToDocument_PartiallyFilledPerenualData_MixesKnownAndUnknownPerField()
    {
        var plant = PlantWith(p => p.PerenualData = new PlantPerenualData
        {
            XSunlightHoursMin = 6,
            // XSunlightHoursMax deliberately left null: Known flags are
            // per-field, not per-record.
        });

        var doc = PlantSearchDocumentMapper.ToDocument(plant);

        Assert.Equal(6, doc.XSunlightHoursMin);
        Assert.True(doc.XSunlightHoursMinKnown);
        Assert.Null(doc.XSunlightHoursMax);
        Assert.False(doc.XSunlightHoursMaxKnown);
    }

    [Fact]
    public void ToDocument_FullyPopulatedPlant_MapsEveryField()
    {
        var plant = PlantWith(p =>
        {
            p.Translations.Add(Translation("en", "Tomato", "A red fruit."));
            p.Translations.Add(Translation("fr", "Tomate", "Un fruit rouge."));
            p.IsEdible = true;
            p.IsToxicToHumans = false;
            p.IsToxicToPets = true;
            p.IsIndoor = false;
            p.IsDroughtTolerant = true;
            p.IsMedicinal = false;
            p.IsSaltTolerant = true;
            p.IsThorny = false;
            p.IsTropical = true;
            p.IsInvasive = false;
            p.CareLevel = PlantCareLevel.Easy;
            p.WateringNeedLevel = PlantWateringNeed.Average;
            p.GrowthRate = PlantGrowthRate.High;
            p.LifeCycle = PlantLifeCycle.Annual;
            p.HardinessZoneMin = 4;
            p.HardinessZoneMax = 9;
            p.MinHeightCm = 30;
            p.MaxHeightCm = 180;
            p.PerenualData = new PlantPerenualData
            {
                XSunlightHoursMin = 6,
                XSunlightHoursMax = 8,
                XWateringPhMin = 6.0m,
                XWateringPhMax = 6.8m,
                XWateringBasedTempMinC = 15,
                XWateringBasedTempMaxC = 30,
                XPlantSpacingValue = 45,
                XTemperatureToleranceMinC = -2,
                XTemperatureToleranceMaxC = 35,
            };
        });

        var doc = PlantSearchDocumentMapper.ToDocument(plant);

        Assert.Equal(plant.Id.ToString(), doc.Id);
        Assert.Equal("Solanum lycopersicum", doc.ScientificName);
        Assert.Equal("Tomato", doc.CommonNameEn);
        Assert.Equal("Tomate", doc.CommonNameFr);
        Assert.Equal("A red fruit.", doc.DescriptionEn);
        Assert.Equal("Un fruit rouge.", doc.DescriptionFr);
        Assert.Equal(3, doc.PlantTypeId);
        Assert.Equal("true", doc.IsEdible);
        Assert.Equal("false", doc.IsToxicToHumans);
        Assert.Equal("true", doc.IsToxicToPets);
        Assert.Equal("false", doc.IsIndoor);
        Assert.Equal("true", doc.IsDroughtTolerant);
        Assert.Equal("false", doc.IsMedicinal);
        Assert.Equal("true", doc.IsSaltTolerant);
        Assert.Equal("false", doc.IsThorny);
        Assert.Equal("true", doc.IsTropical);
        Assert.Equal("false", doc.IsInvasive);
        Assert.Equal("Easy", doc.CareLevel);
        Assert.Equal("Average", doc.WateringNeedLevel);
        Assert.Equal("High", doc.GrowthRate);
        Assert.Equal("Annual", doc.LifeCycle);
        Assert.Equal(4, doc.HardinessZoneMin);
        Assert.True(doc.HardinessZoneMinKnown);
        Assert.Equal(9, doc.HardinessZoneMax);
        Assert.True(doc.HardinessZoneMaxKnown);
        Assert.Equal(30, doc.MinHeightCm);
        Assert.True(doc.MinHeightCmKnown);
        Assert.Equal(180, doc.MaxHeightCm);
        Assert.True(doc.MaxHeightCmKnown);
        Assert.Equal(6, doc.XSunlightHoursMin);
        Assert.True(doc.XSunlightHoursMinKnown);
        Assert.Equal(8, doc.XSunlightHoursMax);
        Assert.True(doc.XSunlightHoursMaxKnown);
        Assert.Equal(6.0f, doc.XWateringPhMin);
        Assert.True(doc.XWateringPhMinKnown);
        Assert.Equal(6.8f, doc.XWateringPhMax);
        Assert.True(doc.XWateringPhMaxKnown);
        Assert.Equal(15, doc.XWateringBasedTempMinC);
        Assert.True(doc.XWateringBasedTempMinCKnown);
        Assert.Equal(30, doc.XWateringBasedTempMaxC);
        Assert.True(doc.XWateringBasedTempMaxCKnown);
        Assert.Equal(45, doc.XPlantSpacingValue);
        Assert.True(doc.XPlantSpacingValueKnown);
        Assert.Equal(-2, doc.XTemperatureToleranceMinC);
        Assert.True(doc.XTemperatureToleranceMinCKnown);
        Assert.Equal(35, doc.XTemperatureToleranceMaxC);
        Assert.True(doc.XTemperatureToleranceMaxCKnown);
    }

    [Fact]
    public void ToDocument_SchemaAndDocument_AgreeOnFieldRoster()
    {
        // Guard against schema/document drift: every non-id field declared in
        // the collection schema must exist as a JsonPropertyName on the
        // document, and vice versa (id is Typesense's reserved implicit field).
        var schemaFields = PlantsSearchCollection.Build().Fields
            .Select(f => f.Name)
            .OrderBy(n => n)
            .ToList();

        var documentFields = typeof(PlantSearchDocument).GetProperties()
            .Select(p => ((System.Text.Json.Serialization.JsonPropertyNameAttribute)p
                .GetCustomAttributes(typeof(System.Text.Json.Serialization.JsonPropertyNameAttribute), false)
                .Single()).Name)
            .Where(n => n != "id")
            .OrderBy(n => n)
            .ToList();

        Assert.Equal(schemaFields, documentFields);
    }
}
