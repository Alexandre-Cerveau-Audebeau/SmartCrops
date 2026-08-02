using SmartCrops.Api.Controllers;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-321 — the OAuth exchange code is percent-encoded at emission. Today's
/// codes are hex GUIDs that would survive raw interpolation, so the proof runs
/// on a HOSTILE code carrying '+', '/' and '=': the redirect query must show
/// their escaped forms only, and unescaping must round-trip to the exact
/// original — the property the exchange endpoint's dictionary lookup depends
/// on. Removing the escape from <see cref="AuthController.BuildAuthCallbackRedirect"/>
/// turns this red.
/// </summary>
public class AuthCallbackRedirectTests
{
    [Fact]
    public void HostileCode_IsEscapedInTheQuery_AndRoundTrips()
    {
        const string frontendUrl = "http://localhost:3000";
        const string code = "a+b/c=";

        var redirect = AuthController.BuildAuthCallbackRedirect(frontendUrl, code);

        var prefix = $"{frontendUrl}/auth/callback?code=";
        Assert.StartsWith(prefix, redirect);
        var query = redirect[prefix.Length..];
        Assert.Equal("a%2Bb%2Fc%3D", query);
        Assert.Equal(code, Uri.UnescapeDataString(query));
    }

    [Fact]
    public void HexGuidCode_TheProductionShape_PassesThroughUnchanged()
    {
        // The invariant that made the raw interpolation LOOK safe: a hex GUID
        // contains nothing EscapeDataString touches, so today's links are
        // byte-identical before and after the fix.
        var code = Guid.NewGuid().ToString("N");

        var redirect = AuthController.BuildAuthCallbackRedirect("http://localhost:3000", code);

        Assert.Equal($"http://localhost:3000/auth/callback?code={code}", redirect);
    }
}
