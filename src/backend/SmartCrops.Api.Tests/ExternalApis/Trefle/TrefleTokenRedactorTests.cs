using SmartCrops.Infrastructure.ExternalApis.Trefle;

namespace SmartCrops.Api.Tests.ExternalApis.Trefle;

/// <summary>
/// Unit tests for <see cref="TrefleTokenRedactor"/> (SMA-71). No real token is used —
/// a synthetic value, per the "no real secrets in tests" rule.
/// </summary>
public class TrefleTokenRedactorTests
{
    private const string Token = "synthetic-trefle-token";

    [Fact]
    public void Redact_ScrubsExactTokenAndTokenQueryParam()
    {
        var body = $"{{\"self\":\"/species/1?token={Token}\",\"echo\":\"{Token}\"}}";

        var scrubbed = TrefleTokenRedactor.Redact(body, Token);

        Assert.DoesNotContain(Token, scrubbed);
        Assert.Contains("token=REDACTED", scrubbed);
        // The standalone exact-token occurrence is scrubbed too (belt-and-braces).
        Assert.Contains("\"echo\":\"REDACTED\"", scrubbed);
    }

    [Fact]
    public void Redact_NullOrEmpty_ReturnsInputUnchanged()
    {
        Assert.Equal(string.Empty, TrefleTokenRedactor.Redact(null, Token));
        Assert.Equal(string.Empty, TrefleTokenRedactor.Redact(string.Empty, Token));
    }

    [Fact]
    public void Redact_BodyWithoutToken_IsUntouched()
    {
        const string clean = "{\"data\":{\"id\":1},\"meta\":{}}";

        Assert.Equal(clean, TrefleTokenRedactor.Redact(clean, Token));
    }

    [Fact]
    public void AssertRedacted_Throws_OnResidualToken_NamingOnlyTheParameter()
    {
        var leak = $"{{\"self\":\"/x?token={Token}\"}}";

        var ex = Assert.Throws<InvalidOperationException>(
            () => TrefleTokenRedactor.AssertRedacted(leak, "PlantTrefleData.RawResponseJson"));
        Assert.Contains("token", ex.Message);
        Assert.DoesNotContain(Token, ex.Message); // never echoes the secret value
    }

    [Fact]
    public void AssertRedacted_DoesNotThrow_OnRedactedOrTokenlessBody()
    {
        TrefleTokenRedactor.AssertRedacted("{\"self\":\"/x?token=REDACTED\"}", "ctx");
        TrefleTokenRedactor.AssertRedacted("{\"data\":{}}", "ctx");
        TrefleTokenRedactor.AssertRedacted(null, "ctx");
    }

    [Fact]
    public void RedactThenAssertRedacted_RoundTrips_NoPlaceholderDrift()
    {
        // The residual-guard lookahead is built FROM Placeholder, so anything Redact
        // produces must always pass AssertRedacted — they can't drift apart if the
        // const changes. Assert against the const itself, not a hardcoded literal.
        var body = $"{{\"self\":\"/x?token={Token}\"}}";
        var scrubbed = TrefleTokenRedactor.Redact(body, Token);

        Assert.Contains($"token={TrefleTokenRedactor.Placeholder}", scrubbed);
        TrefleTokenRedactor.AssertRedacted(scrubbed, "ctx"); // must not throw
    }
}
