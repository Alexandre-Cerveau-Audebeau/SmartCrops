using System.Text.Json;
using SmartCrops.Infrastructure.ExternalApis.Perenual;

namespace SmartCrops.Api.Tests.ExternalApis.Perenual;

/// <summary>
/// Unit tests for <see cref="PerenualKeyRedactor"/> — the guarantee that the
/// Perenual API key never reaches the database via the SMA-71 literal capture.
/// Perenual echoes the key inside <c>care_guides</c> and
/// <c>hardiness_location.full_url</c>/<c>full_iframe</c> URLs, so a verbatim
/// body would otherwise persist the secret at rest.
/// </summary>
public class PerenualKeyRedactorTests
{
    // Synthetic, obviously-fake token — never a real credential (SMA-71 R2: the
    // production key value previously lived here and is now scrubbed from source).
    private const string Key = "sk-TEST-REDACT-DO-NOT-USE-FAKE";

    [Fact]
    public void Redact_RemovesExactKey_FromCareGuidesUrl()
    {
        var body = $"{{\"care_guides\":\"http://perenual.com/api/species-care-guide-list?species_id=728&key={Key}\"}}";

        var result = PerenualKeyRedactor.Redact(body, Key);

        Assert.DoesNotContain(Key, result);
        Assert.Contains("key=REDACTED", result);
    }

    [Fact]
    public void Redact_RemovesKey_FromAmpEncodedIframeSrc()
    {
        // hardiness_location.full_iframe embeds the key after an HTML-encoded
        // &amp; — the redactor must catch this form too.
        var body = $"{{\"full_iframe\":\"<iframe src='https://perenual.com/api/hardiness-map?species_id=728&amp;size=og&amp;key={Key}'></iframe>\"}}";

        var result = PerenualKeyRedactor.Redact(body, Key);

        Assert.DoesNotContain(Key, result);
        Assert.Contains("REDACTED", result);
    }

    [Fact]
    public void Redact_ScrubsUnknownKey_ViaQueryParamPattern()
    {
        // A key value other than the configured one is still scrubbed by the
        // generic key= pattern — defence in depth against a rotated key.
        var body = "{\"u\":\"https://x/y?key=sk-someOtherKey123&z=1\"}";

        var result = PerenualKeyRedactor.Redact(body, "a-different-configured-key");

        Assert.DoesNotContain("sk-someOtherKey123", result);
        Assert.Contains("key=REDACTED", result);
    }

    [Fact]
    public void Redact_KeepsBodyValidJson_AndPreservesOtherFields()
    {
        var body = $"{{\"care_guides\":\"http://x?key={Key}\",\"id\":728}}";

        var result = PerenualKeyRedactor.Redact(body, Key);

        using var doc = JsonDocument.Parse(result); // must not throw
        Assert.Equal(728, doc.RootElement.GetProperty("id").GetInt32());
    }

    [Fact]
    public void Redact_NoKeyPresent_ReturnsBodyUnchanged()
    {
        var body = "{\"id\":728,\"common_name\":\"aloe\"}";

        Assert.Equal(body, PerenualKeyRedactor.Redact(body, Key));
    }

    [Fact]
    public void Redact_NullOrEmpty_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, PerenualKeyRedactor.Redact(null, Key));
        Assert.Equal(string.Empty, PerenualKeyRedactor.Redact(string.Empty, Key));
    }

    // ── AssertRedacted: persistence-boundary fail-fast guard (SMA-71 R2) ──────

    [Fact]
    public void AssertRedacted_Throws_WhenKeyParamSurvives_WithoutLeakingTheValue()
    {
        var leaked = "{\"care_guides\":\"http://x?species_id=728&key=sk-someLeakedKey123\"}";

        var ex = Assert.Throws<InvalidOperationException>(
            () => PerenualKeyRedactor.AssertRedacted(leaked, "ctx"));

        // Names the parameter but NEVER the secret value.
        Assert.Contains("key=", ex.Message);
        Assert.Contains("ctx", ex.Message);
        Assert.DoesNotContain("sk-someLeakedKey123", ex.Message);
    }

    [Fact]
    public void AssertRedacted_Throws_WhenApiKeyParamSurvives()
    {
        var leaked = "{\"u\":\"http://x?api_key=secretvalue\"}";

        Assert.Throws<InvalidOperationException>(
            () => PerenualKeyRedactor.AssertRedacted(leaked, "ctx"));
    }

    [Fact]
    public void AssertRedacted_DoesNotThrow_WhenAlreadyRedacted()
    {
        PerenualKeyRedactor.AssertRedacted(
            "{\"care_guides\":\"http://x?key=REDACTED\",\"id\":728}", "ctx");
    }

    [Fact]
    public void AssertRedacted_DoesNotThrow_OnNullEmptyOrNoCredential()
    {
        PerenualKeyRedactor.AssertRedacted(null, "ctx");
        PerenualKeyRedactor.AssertRedacted(string.Empty, "ctx");
        PerenualKeyRedactor.AssertRedacted("{\"id\":728,\"soil\":[\"Well-drained\"]}", "ctx");
    }

    [Fact]
    public void Redact_Then_AssertRedacted_PassesForAKeyBearingBody()
    {
        // End-to-end: a body carrying key=, once Redact'd, clears the guard.
        var body = $"{{\"care_guides\":\"http://x?species_id=728&key={Key}\"}}";

        var redacted = PerenualKeyRedactor.Redact(body, Key);

        PerenualKeyRedactor.AssertRedacted(redacted, "ctx"); // must not throw
        Assert.DoesNotContain(Key, redacted);
    }
}
