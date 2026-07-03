using SmartCrops.Core.Models;

namespace SmartCrops.Api.Tests.Validation;

/// <summary>
/// Request-surface validation for the finder (SMA-255 T3): bounds, language,
/// enum vocabulary (the 400-before-the-engine injection guard) and range
/// sanity.
/// </summary>
public class PlantSearchQueryValidatorTests
{
    [Fact]
    public void Validate_Defaults_NoErrors()
    {
        Assert.Empty(PlantSearchQueryValidator.Validate(new PlantSearchQuery()));
    }

    [Theory]
    [InlineData("en")]
    [InlineData("fr")]
    public void Validate_SupportedLanguages_NoErrors(string language)
    {
        Assert.Empty(PlantSearchQueryValidator.Validate(new PlantSearchQuery { Language = language }));
    }

    [Theory]
    [InlineData("de")]
    [InlineData("EN")]
    [InlineData("")]
    public void Validate_UnsupportedLanguage_Errors(string language)
    {
        var errors = PlantSearchQueryValidator.Validate(new PlantSearchQuery { Language = language });

        Assert.Contains(errors, e => e.Contains("language"));
    }

    [Theory]
    [InlineData(0, 24)]
    [InlineData(-1, 24)]
    [InlineData(1, 0)]
    [InlineData(1, 101)]
    public void Validate_OutOfBoundsPagination_Errors(int page, int perPage)
    {
        var errors = PlantSearchQueryValidator.Validate(new PlantSearchQuery { Page = page, PerPage = perPage });

        Assert.NotEmpty(errors);
    }

    [Fact]
    public void Validate_UnknownEnumValue_ErrorNamesValueAndVocabulary()
    {
        var errors = PlantSearchQueryValidator.Validate(new PlantSearchQuery
        {
            CareLevels = ["SuperEasy"],
        });

        var error = Assert.Single(errors);
        Assert.Contains("SuperEasy", error);
        Assert.Contains("Easy", error);
    }

    [Fact]
    public void Validate_CaseMismatchEnumValue_Errors()
    {
        // The vocabulary is exact-match PascalCase — the same strings the
        // facet counts return; "easy" is not silently coerced.
        var errors = PlantSearchQueryValidator.Validate(new PlantSearchQuery
        {
            CareLevels = ["easy"],
        });

        var error = Assert.Single(errors);
        Assert.Contains("easy", error);
    }

    [Fact]
    public void Validate_QAtTheCap_NoError_OneOverErrors()
    {
        Assert.Empty(PlantSearchQueryValidator.Validate(new PlantSearchQuery { Q = new string('a', 200) }));

        var errors = PlantSearchQueryValidator.Validate(new PlantSearchQuery { Q = new string('a', 201) });

        var error = Assert.Single(errors);
        Assert.Contains("200", error);
    }

    [Fact]
    public void Validate_MultiSelectAtTheCap_NoError_OneOverErrors()
    {
        var atCap = Enumerable.Repeat("Easy", 20).ToArray();
        Assert.Empty(PlantSearchQueryValidator.Validate(new PlantSearchQuery { CareLevels = atCap }));

        var overCap = Enumerable.Repeat("Easy", 21).ToArray();
        var errors = PlantSearchQueryValidator.Validate(new PlantSearchQuery { CareLevels = overCap });

        var error = Assert.Single(errors);
        Assert.Contains("careLevels", error);
        Assert.Contains("20", error);
    }

    [Fact]
    public void Validate_PlantTypeIdsOverCap_Errors()
    {
        var errors = PlantSearchQueryValidator.Validate(new PlantSearchQuery
        {
            PlantTypeIds = Enumerable.Range(1, 21).ToArray(),
        });

        var error = Assert.Single(errors);
        Assert.Contains("plantTypeIds", error);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Validate_NonPositivePlantTypeIds_Errors(int badId)
    {
        var errors = PlantSearchQueryValidator.Validate(new PlantSearchQuery
        {
            PlantTypeIds = [1, badId],
        });

        var error = Assert.Single(errors);
        Assert.Contains("positive", error);
    }

    [Fact]
    public void Validate_PositivePlantTypeIds_NoErrors()
    {
        Assert.Empty(PlantSearchQueryValidator.Validate(new PlantSearchQuery { PlantTypeIds = [1, 2, 8] }));
    }

    [Fact]
    public void Validate_MinGreaterThanMax_Errors()
    {
        var errors = PlantSearchQueryValidator.Validate(new PlantSearchQuery
        {
            XWateringPhMin = 7.5m,
            XWateringPhMax = 6.0m,
        });

        var error = Assert.Single(errors);
        Assert.Contains("xWateringPh", error);
    }

    [Fact]
    public void Validate_ValidEnumSelections_NoErrors()
    {
        var errors = PlantSearchQueryValidator.Validate(new PlantSearchQuery
        {
            CareLevels = ["Easy", "Medium", "Difficult"],
            WateringNeedLevels = ["Low", "Average", "High", "Frequent"],
            GrowthRates = ["Low", "Moderate", "High"],
            LifeCycles = ["Annual", "Biennial", "Perennial", "HerbaceousPerennial"],
        });

        Assert.Empty(errors);
    }
}
