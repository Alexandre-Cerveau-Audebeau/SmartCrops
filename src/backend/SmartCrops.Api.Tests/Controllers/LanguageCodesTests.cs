using SmartCrops.Api.Controllers;

namespace SmartCrops.Api.Tests.Controllers;

/// <summary>
/// Contract locks for the shared lang-normalization helper (5.2 R2): one
/// behavior for every controller speaking the unified locale key.
/// </summary>
public class LanguageCodesTests
{
    [Theory]
    [InlineData(null, "en")] // absent -> default
    [InlineData("", "en")] // empty -> default
    [InlineData("  ", "en")] // whitespace-only -> default (would wildcard otherwise)
    [InlineData("this-is-way-too-long", "en")] // implausibly long (>10) -> default
    [InlineData("ABCDEFGHIJ", "abcdefghij")] // 10 characters, the bound itself -> kept, lower-cased
    [InlineData("abcdefghijk", "en")] // 11 characters, one past the bound -> default
    [InlineData("FR", "fr")] // canonicalized to lower-case
    [InlineData(" fr ", "fr")] // trimmed then matched
    [InlineData("fr", "fr")] // already canonical -> unchanged
    [InlineData("de", "de")] // a code no one maps passes through: no closed list here
    public void Normalize_BoundsAndCanonicalizes(string? input, string expected)
    {
        Assert.Equal(expected, LanguageCodes.Normalize(input));
    }
}
