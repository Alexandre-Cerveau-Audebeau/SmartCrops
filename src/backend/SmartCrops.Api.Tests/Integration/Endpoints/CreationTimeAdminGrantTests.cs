using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using SmartCrops.Api.Controllers;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-390 — the admin role is granted the moment a LISTED account is created,
/// on both creation paths, so the first JWT ever issued carries it and no
/// restart is needed. Dedicated factories on the shared container database
/// (the <c>AuthFrontendUrlValidationTests</c> pattern) because the grant is
/// driven by <c>AdminSeed:Emails</c>, which the shared fixture does not set —
/// and crucially these hosts run in "Testing", where the boot seeder NEVER
/// runs: a passing grant here is also the regression proof that the hook
/// ensures the Admin role row itself instead of depending on a boot.
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class CreationTimeAdminGrantTests
{
    private const string ValidPassword = "Str0ng!Pass";

    // Matches the link built by AuthController.SendConfirmationEmailAsync
    // against the factory's Frontend:BaseUrl (WithFrontendUrl default) — the
    // AuthControllerTests idiom: the token is pulled from the captured email,
    // never regenerated.
    private static readonly Regex ConfirmLinkPattern = new(
        @"http://localhost:3000/confirm-email\?userId=(?<userId>[^&\s]+)&token=(?<token>[^\s]+)",
        RegexOptions.Compiled);

    private readonly PostgresFixture _fixture;

    public CreationTimeAdminGrantTests(PostgresFixture fixture)
    {
        _fixture = fixture;
    }

    private WebApplicationFactory<Program> BuildFactory(string adminSeedEmails) =>
        new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("AdminSeed:Emails", adminSeedEmails)
            .WithConnectionString(_fixture.ConnectionString)
            .WithServices(services =>
            {
                services.RemoveAll<IEmailService>();
                services.AddSingleton<StubEmailService>();
                services.AddSingleton<IEmailService>(sp =>
                    sp.GetRequiredService<StubEmailService>());

                // The first-JWT-carries-the-role proof ends on the admin-only
                // reindex route — stub the engine like the shared fixture does.
                services.RemoveAll<ISearchIndexingService>();
                services.AddSingleton<StubSearchIndexingService>();
                services.AddSingleton<ISearchIndexingService>(sp =>
                    sp.GetRequiredService<StubSearchIndexingService>());
            })
            .Build();

    /// <summary>
    /// R1 non-mutating precondition capture (replaces the former role
    /// deletion, which cascaded membership off every other class in the
    /// sequential collection): record whether the shared Admin role row
    /// already exists. The test asserts the POST-state unconditionally; the
    /// "the hook created the role itself" attribution is only claimed when
    /// the captured value is false — the collection is sequential, so nothing
    /// can create it between this capture and the register call except the
    /// hook under test.
    /// </summary>
    private async Task<bool> AdminRolePreExistsAsync()
    {
        using var scope = _fixture.Factory.Services.CreateScope();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        return await roles.RoleExistsAsync(Roles.Admin);
    }

    /// <summary>Local copy of the AuthControllerTests seam helper: the
    /// ExternalLoginInfo the Google middleware would hand the callback.</summary>
    private static ExternalLoginInfo GoogleInfo(string email, string providerKey)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.Email, email),
            new("email_verified", "true"),
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "Google"));
        return new ExternalLoginInfo(principal, "Google", providerKey, "Google");
    }

    [Fact]
    public async Task Register_ListedEmail_GrantedAtCreation_AndFirstJwtCarriesRole()
    {
        var rolePreExisted = await AdminRolePreExistsAsync();
        var email = $"listed-{Guid.NewGuid():N}@example.com";
        await using var factory = BuildFactory(email);
        // https base: outside Development the auth cookie is Secure and the
        // CookieContainer only replays it over https (AuthControllerTests idiom).
        using var client = factory.CreateClient(
            new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });

        var register = await client.PostAsJsonAsync(
            "/api/auth/register", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        // Granted WITHOUT any restart, in a host whose boot seeder never ran.
        // When rolePreExisted is false, the sequential collection makes the
        // attribution exact: the hook's ensure-role step created the row (the
        // regression proof that the grant depends on no boot); when true, the
        // grant path is still fully exercised — only the creation attribution
        // is out of scope for this run. Deliberately NOT auto-confirmed
        // (register proves nothing about mailbox ownership; a born-confirmed
        // listed account would bypass the SMA-320 R2 squatter neutralization),
        // so the standard confirmation email must go out.
        using (var scope = factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            var user = await users.FindByEmailAsync(email);
            Assert.NotNull(user);
            Assert.False(user!.EmailConfirmed);
            Assert.True(await users.IsInRoleAsync(user, Roles.Admin));
            Assert.True(
                await roles.RoleExistsAsync(Roles.Admin),
                rolePreExisted
                    ? "Admin role must still exist after the grant."
                    : "The hook must have created the Admin role itself — the boot seeder never ran in this host.");
        }

        // Confirm through the mailed link (mailbox proof), then login: the
        // FIRST token ever minted carries the role — the admin-only reindex
        // answers 200, with no restart anywhere in the journey.
        var sent = Assert.Single(factory.Services.GetRequiredService<StubEmailService>().Sent);
        Assert.Equal(email, sent.To);
        var match = ConfirmLinkPattern.Match(sent.TextBody);
        Assert.True(match.Success, $"No confirmation link in the email body:\n{sent.TextBody}");
        var confirm = await client.PostAsJsonAsync("/api/auth/confirm-email", new
        {
            userId = Uri.UnescapeDataString(match.Groups["userId"].Value),
            token = Uri.UnescapeDataString(match.Groups["token"].Value),
        });
        Assert.Equal(HttpStatusCode.NoContent, confirm.StatusCode);

        var login = await client.PostAsJsonAsync(
            "/api/auth/login", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);

        var reindex = await client.PostAsync("/api/admin/search/reindex", null);
        Assert.Equal(HttpStatusCode.OK, reindex.StatusCode);
    }

    [Fact]
    public async Task Register_UnlistedEmail_TodaysFlowUnchanged()
    {
        var listed = $"listed-{Guid.NewGuid():N}@example.com";
        var unlisted = $"unlisted-{Guid.NewGuid():N}@example.com";
        await using var factory = BuildFactory(listed);
        using var client = factory.CreateClient();

        var register = await client.PostAsJsonAsync(
            "/api/auth/register", new { email = unlisted, password = ValidPassword });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(unlisted);
            Assert.NotNull(user);
            Assert.False(user!.EmailConfirmed);
            Assert.False(await users.IsInRoleAsync(user, Roles.Admin));
        }

        // The confirmation email still goes out — today's flow, unchanged.
        var sent = Assert.Single(factory.Services.GetRequiredService<StubEmailService>().Sent);
        Assert.Equal(unlisted, sent.To);
    }

    [Fact]
    public async Task GoogleProvisioning_ListedEmail_GrantedAtCreation_AndRepeatGrantIsNoOp()
    {
        var email = $"glisted-{Guid.NewGuid():N}@example.com";
        // Hand-built config exercising the seeder-mirrored semantics: CSV,
        // trimmed entries, case-insensitive match.
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AdminSeed:Emails"] = $" {email.ToUpperInvariant()} , someone-else@example.com ",
            })
            .Build();

        using var scope = _fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();

        // The exact first-sign-in sequence GoogleCallback runs (the merge-test
        // seam — no fake-Google harness exists): born-confirmed create,
        // AddLoginAsync, then the SMA-390 hook.
        var user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true };
        Assert.True((await users.CreateAsync(user)).Succeeded);
        Assert.True((await users.AddLoginAsync(user, GoogleInfo(email, $"gkey-{Guid.NewGuid():N}"))).Succeeded);
        await AuthController.EnsureAdminRoleIfListedAsync(users, roles, config, user, NullLogger.Instance);

        Assert.True(await users.IsInRoleAsync(user, Roles.Admin));

        // Listed account already holding the role → strict no-op, no duplicate.
        await AuthController.EnsureAdminRoleIfListedAsync(users, roles, config, user, NullLogger.Instance);
        Assert.Single(await users.GetRolesAsync(user), Roles.Admin);

        // R1 hygiene: the shared collection database must not inherit this
        // account — the membership row cascades with the user.
        Assert.True((await users.DeleteAsync(user)).Succeeded);
    }

    [Fact]
    public async Task GrantThatCannotSucceed_NeverEscapes_TheSoftFailContract()
    {
        // R1 (the review's soft-fail coverage ask): the doctrine is that a
        // grant failure never fails account creation — Register answers 201
        // with the account committed even when the role write cannot land.
        // The simplest faithful form (there is no seam to make AddToRoleAsync
        // fail under the real host over HTTP without fake stores): invoke the
        // catch-all-wrapped helper for a DELETED user — the store rejects the
        // membership write (a failed IdentityResult or a thrown store
        // exception, depending on provider flush order), and the helper must
        // swallow either. That swallow IS what protects Register's 201.
        var email = $"ghost-{Guid.NewGuid():N}@example.com";
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AdminSeed:Emails"] = email,
            })
            .Build();
        using var scope = _fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var user = new ApplicationUser { UserName = email, Email = email };
        Assert.True((await users.CreateAsync(user)).Succeeded);
        Assert.True((await users.DeleteAsync(user)).Succeeded);

        var escaped = await Record.ExceptionAsync(() =>
            AuthController.EnsureAdminRoleIfListedAsync(users, roles, config, user, NullLogger.Instance));

        Assert.Null(escaped);
    }
}
