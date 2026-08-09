using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using SmartCrops.Api.Controllers;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-390 R1 — the single Google ownership-proof policy, unit-proven without
/// an OAuth harness (the <c>BuildAuthCallbackRedirect</c> pattern): the
/// callback consults <see cref="AuthController.IsGoogleEmailUsable"/> ABOVE
/// the create/merge split, so these rows ARE the creation-branch policy the
/// GitHub Critical asked to cover — an absent or non-true
/// <c>email_verified</c> refuses a listed address before any account is
/// created, merged, granted or minted.
/// </summary>
public class GoogleEmailUsableTests
{
    private static ExternalLoginInfo Info(string? emailVerified)
    {
        var claims = new List<Claim> { new(ClaimTypes.Email, "someone@example.com") };
        if (emailVerified is not null)
            claims.Add(new Claim("email_verified", emailVerified));
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "Google"));
        return new ExternalLoginInfo(principal, "Google", "gkey-policy", "Google");
    }

    [Theory]
    [InlineData(null, false)]        // claim absent — no proof, refuse
    [InlineData("false", false)]     // explicit unverified — refuse
    [InlineData("not-a-bool", false)] // malformed claim — refuse, never guess
    [InlineData("true", true)]       // the proof
    [InlineData("True", true)]       // bool.TryParse is case-insensitive — IdP casing variance stays usable
    public void Policy_UsableOnlyWithATrueVerifiedClaim(string? emailVerified, bool expected)
    {
        Assert.Equal(expected, AuthController.IsGoogleEmailUsable(Info(emailVerified)));
    }
}
