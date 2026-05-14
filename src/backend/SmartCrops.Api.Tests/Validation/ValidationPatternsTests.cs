namespace SmartCrops.Api.Tests.Validation;

using System.Text.RegularExpressions;
using SmartCrops.Core.Validation;

/// <summary>
/// Functional regex tests for <see cref="ValidationPatterns.Bcp47LanguageCodeLowercase"/>.
///
/// Complements <c>Bcp47CheckConstraintMigrationTests</c> (which guards the migration source against
/// accidental deletion/alteration) and the future Postgres enforcement tests tracked by issue #39
/// (Testcontainers). The three layers together provide:
/// <list type="bullet">
///   <item>Functional regex behavior (this class) — fast, deterministic, runs in every test cycle.</item>
///   <item>Migration source integrity (Bcp47CheckConstraintMigrationTests) — catches structural regressions.</item>
///   <item>Live Postgres CHECK enforcement (issue #39) — validates the regex against the actual database engine.</item>
/// </list>
/// </summary>
public class ValidationPatternsTests
{
    [Theory]
    [InlineData("en")]              // ISO 639-1, minimum 2-char language
    [InlineData("fr")]              // ISO 639-1
    [InlineData("fra")]             // ISO 639-3, 3-char language
    [InlineData("yue")]             // ISO 639-3, Cantonese
    [InlineData("en-us")]           // language + region (2-char)
    [InlineData("fr-fr")]           // language + region (lowercase, post-converter form)
    [InlineData("zh-hant")]         // language + script
    [InlineData("sr-latn-rs")]      // language + script + region (full form)
    [InlineData("es-419")]          // language + numeric region (UN M.49)
    [InlineData("fra-latn-fr")]     // 3-char language + script + region
    public void Bcp47LanguageCodeLowercase_Matches_ValidLowercaseTags(string tag)
    {
        Assert.Matches(ValidationPatterns.Bcp47LanguageCodeLowercase, tag);
    }

    [Theory]
    [InlineData("")]                    // empty
    [InlineData(" ")]                   // single whitespace
    [InlineData("fr fr")]               // internal whitespace
    [InlineData("a")]                   // 1-char language (too short)
    [InlineData("abcd")]                // 4-char language (no subtag)
    [InlineData("francais")]            // 8-char language
    [InlineData("EN-US")]               // uppercase language
    [InlineData("en-US")]               // mixed case (region uppercase)
    [InlineData("EN")]                  // uppercase language only
    [InlineData("en_US")]               // underscore separator
    [InlineData("en-USA")]              // 3-char region
    [InlineData("en-12")]               // numeric region with only 2 digits
    [InlineData("en-1234")]             // numeric region with 4 digits
    [InlineData("en-gb-oed")]           // variant subtag (intentionally unsupported)
    [InlineData("de-de-u-co-phonebk")]  // extension subtag (intentionally unsupported)
    [InlineData("zh-cn-x-custom")]      // private-use subtag (intentionally unsupported)
    [InlineData("i-klingon")]           // grandfathered tag (intentionally unsupported)
    [InlineData("-en")]                 // leading dash
    [InlineData("en-")]                 // trailing dash
    [InlineData("en--us")]              // double dash
    public void Bcp47LanguageCodeLowercase_DoesNotMatch_InvalidOrUnsupportedTags(string tag)
    {
        Assert.DoesNotMatch(ValidationPatterns.Bcp47LanguageCodeLowercase, tag);
    }
}
