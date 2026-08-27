using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SmartCrops.Api.Tests.Infrastructure;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-350 — characterization proof of the password policy the validator
/// enforces. The six values were the ASP.NET Core defaults and were never
/// written down in this repo, so the UI copy had no source of truth to track.
/// Pinning them in <c>AddIdentity</c> changes NO behaviour; this test exists so
/// a future silent framework-default change, or an accidental edit to the
/// pinned block, breaks the build instead of quietly contradicting the copy.
/// The backend pins six values; the UI deliberately states five of them, since
/// <c>RequiredUniqueChars = 1</c> is vacuous and can never be refused.
/// </summary>
public class IdentityPasswordPolicyTests
{
    /// <summary>
    /// Resolves the booted host's <see cref="IdentityOptions"/> and asserts the six pinned password values.
    /// </summary>
    [Fact]
    public void PasswordPolicy_PinsTheSixBackendValuesTheValidatorEnforces()
    {
        using WebApplicationFactory<Program> factory = new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            .WithInMemoryDatabase("IdentityPasswordPolicyTests")
            .Build();

        PasswordOptions password = factory.Services
            .GetRequiredService<IOptions<IdentityOptions>>()
            .Value
            .Password;

        Assert.Equal(6, password.RequiredLength);
        Assert.True(password.RequireDigit);
        Assert.True(password.RequireLowercase);
        Assert.True(password.RequireUppercase);
        Assert.True(password.RequireNonAlphanumeric);
        Assert.Equal(1, password.RequiredUniqueChars);
    }
}
