using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SmartCrops.Api.Controllers;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-31 — registration mails a confirmation link through the stubbed
/// <c>IEmailService</c>, and <c>POST /api/auth/confirm-email</c> consumes it.
/// The link is asserted end-to-end: every test that confirms an address pulls the
/// token out of the captured email body rather than regenerating one, so a link
/// that would break in a real mail client fails the suite here.
/// <para>Since SMA-320 (go-live Lot 1b) the gate is ON: login answers a distinct
/// 403 for an unconfirmed account — only behind the correct password — and
/// resend-confirmation is the recovery path. The password-reset flow tests
/// confirm their account first (via <see cref="RegisterAndRequestResetAsync"/>)
/// because their end-to-end proof is a successful login.</para>
/// </summary>
public class AuthControllerTests : IntegrationTestBase
{
    public AuthControllerTests(PostgresFixture fixture) : base(fixture) { }

    // Satisfies both the DTO's [MinLength(6)] and Identity's default password
    // policy (digit + lower + upper + non-alphanumeric).
    private const string ValidPassword = "Str0ng!Pass";

    // Matches the link built by AuthController.SendConfirmationEmailAsync against
    // the fixture's Frontend:BaseUrl (TestWebAppBuilder.WithFrontendUrl default).
    // The captures stay PERCENT-ENCODED — decoding is the assertion's job.
    private static readonly Regex ConfirmLinkPattern = new(
        @"http://localhost:3000/confirm-email\?userId=(?<userId>[^&\s]+)&token=(?<token>[^\s]+)",
        RegexOptions.Compiled);

    // Same shape for the reset link mailed by forgot-password (SMA-323).
    private static readonly Regex ResetLinkPattern = new(
        @"http://localhost:3000/reset-password\?userId=(?<userId>[^&\s]+)&token=(?<token>[^\s]+)",
        RegexOptions.Compiled);

    private static string NewEmail() => $"register-{Guid.NewGuid():N}@example.com";

    private async Task<HttpResponseMessage> RegisterAsync(string email) =>
        await Client.PostAsJsonAsync("/api/auth/register", new { email, password = ValidPassword });

    private async Task<HttpResponseMessage> ConfirmAsync(string userId, string token) =>
        await Client.PostAsJsonAsync("/api/auth/confirm-email", new { userId, token });

    /// <summary>
    /// Pulls the single confirmation link out of the captured email, returning both
    /// the raw (still percent-encoded) query values and their decoded form.
    /// </summary>
    private (string RawUserId, string RawToken, string UserId, string Token) CapturedLink()
    {
        var sent = Assert.Single(Fixture.EmailStub.Sent);
        var match = ConfirmLinkPattern.Match(sent.TextBody);
        Assert.True(match.Success, $"No confirmation link in the email body:\n{sent.TextBody}");

        var rawUserId = match.Groups["userId"].Value;
        var rawToken = match.Groups["token"].Value;
        return (
            rawUserId,
            rawToken,
            Uri.UnescapeDataString(rawUserId),
            Uri.UnescapeDataString(rawToken));
    }

    private async Task<ApplicationUser?> FindUserAsync(string email)
    {
        using var scope = CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        return await users.FindByEmailAsync(email);
    }

    private async Task<HttpResponseMessage> ForgotAsync(string email) =>
        await Client.PostAsJsonAsync("/api/auth/forgot-password", new { email });

    private async Task<HttpResponseMessage> ResetAsync(string userId, string token, string newPassword) =>
        await Client.PostAsJsonAsync("/api/auth/reset-password", new { userId, token, newPassword });

    private async Task<HttpResponseMessage> ValidateAsync(string userId, string token) =>
        await Client.PostAsJsonAsync("/api/auth/reset-password/validate", new { userId, token });

    /// <summary>
    /// Registers an account, CONFIRMS it through the mailed link (SMA-320: the
    /// login gate would otherwise 403 the end-to-end login proofs these flows
    /// end on), drops the registration email from the stub (so reset assertions
    /// see only reset traffic), requests a reset, and returns the DECODED
    /// userId/token pulled from the mailed link — never regenerated.
    /// </summary>
    private async Task<(string Email, string UserId, string Token)> RegisterAndRequestResetAsync()
    {
        var email = NewEmail();
        await RegisterAsync(email);
        var (_, _, userIdFromLink, confirmToken) = CapturedLink();
        Assert.Equal(HttpStatusCode.NoContent, (await ConfirmAsync(userIdFromLink, confirmToken)).StatusCode);
        Fixture.EmailStub.Reset();
        Assert.Equal(HttpStatusCode.Accepted, (await ForgotAsync(email)).StatusCode);

        var sent = Assert.Single(Fixture.EmailStub.Sent);
        var match = ResetLinkPattern.Match(sent.TextBody);
        Assert.True(match.Success, $"No reset link in the email body:\n{sent.TextBody}");
        return (
            email,
            Uri.UnescapeDataString(match.Groups["userId"].Value),
            Uri.UnescapeDataString(match.Groups["token"].Value));
    }

    [Fact]
    public async Task Register_ValidPayload_Returns201AndMailsConfirmationLink()
    {
        var email = NewEmail();

        var response = await RegisterAsync(email);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var sent = Assert.Single(Fixture.EmailStub.Sent);
        Assert.Equal(email, sent.To);
        Assert.Contains("Confirm your SmartCrops email address", sent.Subject);
        Assert.Contains("http://localhost:3000/confirm-email?userId=", sent.TextBody);
        // The service identity is the sender; a confirmation mail has no reply-to.
        Assert.Null(sent.ReplyToAddress);
    }

    [Fact]
    public async Task Register_ValidPayload_MailedLinkCarriesPercentEncodedToken()
    {
        await RegisterAsync(NewEmail());

        var (rawUserId, rawToken, userId, token) = CapturedLink();

        // Identity's default provider returns standard base64, so a raw token can
        // carry '+' and '/'. Unencoded, '+' decodes back as a space and silently
        // invalidates the link — the regression this asserts.
        Assert.DoesNotContain("+", rawToken);
        Assert.DoesNotContain(" ", rawToken);
        // Round-trip: what is in the URL is exactly the escaped form of the token.
        Assert.Equal(rawToken, Uri.EscapeDataString(token));
        Assert.Equal(rawUserId, Uri.EscapeDataString(userId));
    }

    [Fact]
    public async Task Register_RelayThrows_StillReturns201AndKeepsTheAccount()
    {
        Fixture.EmailStub.ThrowOnSend = true;
        var email = NewEmail();

        var response = await RegisterAsync(email);

        // An SMTP outage must never cost the user their account.
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Empty(Fixture.EmailStub.Sent);
        var user = await FindUserAsync(email);
        Assert.NotNull(user);
        Assert.False(user!.EmailConfirmed);
    }

    [Fact]
    public async Task Register_BeforeConfirmation_LeavesEmailUnconfirmed()
    {
        var email = NewEmail();

        await RegisterAsync(email);

        var user = await FindUserAsync(email);
        Assert.NotNull(user);
        Assert.False(user!.EmailConfirmed);
    }

    [Fact]
    public async Task ConfirmEmail_TokenFromMailedLink_Returns204AndFlipsEmailConfirmed()
    {
        var email = NewEmail();
        await RegisterAsync(email);
        var (_, _, userId, token) = CapturedLink();

        var response = await ConfirmAsync(userId, token);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var user = await FindUserAsync(email);
        Assert.NotNull(user);
        Assert.True(user!.EmailConfirmed);
    }

    [Fact]
    public async Task ConfirmEmail_GarbageToken_Returns400()
    {
        await RegisterAsync(NewEmail());
        var (_, _, userId, _) = CapturedLink();

        var response = await ConfirmAsync(userId, "not-a-real-token");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Invalid or expired confirmation link.", body);
    }

    [Fact]
    public async Task ConfirmEmail_UnknownUserId_ReturnsSameStatusAsGarbageToken()
    {
        await RegisterAsync(NewEmail());
        var (_, _, userId, _) = CapturedLink();

        var garbageToken = await ConfirmAsync(userId, "not-a-real-token");
        var unknownUser = await ConfirmAsync(Guid.NewGuid().ToString(), "not-a-real-token");

        // Identical responses: the endpoint must not leak which ids exist.
        Assert.Equal(garbageToken.StatusCode, unknownUser.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, unknownUser.StatusCode);
        Assert.Equal(
            await garbageToken.Content.ReadAsStringAsync(),
            await unknownUser.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ConfirmEmail_UnknownUserId_WithWellFormedToken_ReturnsSameResponseAsGarbageToken()
    {
        var email = NewEmail();
        await RegisterAsync(email);
        var (_, _, userId, token) = CapturedLink();

        var garbage = await ConfirmAsync(userId, "not-a-real-token");
        var unknownWithRealToken = await ConfirmAsync(Guid.NewGuid().ToString(), token);

        // R2 timing equalization: the miss path now RUNS a validation instead of
        // short-circuiting. A well-formed token (decryptable, but embedding a
        // different user's id) must come back indistinguishable from garbage —
        // and must not have confirmed anyone as a side effect.
        Assert.Equal(HttpStatusCode.BadRequest, unknownWithRealToken.StatusCode);
        Assert.Equal(
            await garbage.Content.ReadAsStringAsync(),
            await unknownWithRealToken.Content.ReadAsStringAsync());

        // R3 (converged 84e3259a / 0f0a359d): assert the invariant the comment above
        // promises — neither probe run may have flipped the real account.
        var registeredUser = await FindUserAsync(email);
        Assert.NotNull(registeredUser);
        Assert.False(registeredUser!.EmailConfirmed);
    }

    [Fact]
    public async Task ConfirmEmail_CalledTwice_Returns204BothTimes()
    {
        var email = NewEmail();
        await RegisterAsync(email);
        var (_, _, userId, token) = CapturedLink();

        var first = await ConfirmAsync(userId, token);
        var second = await ConfirmAsync(userId, token);

        // Idempotent: a second click on the same link is not an error. The token
        // itself is single-use (the security stamp moved), so the 204 comes from
        // the already-confirmed short-circuit, not from re-validating it.
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);
        var user = await FindUserAsync(email);
        Assert.NotNull(user);
        Assert.True(user!.EmailConfirmed);
    }

    [Fact]
    public async Task ConfirmEmail_MissingFields_Returns400()
    {
        var response = await Client.PostAsJsonAsync("/api/auth/confirm-email", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Login_UnconfirmedAccount_CorrectPassword_Returns403WithMachineReadableCode()
    {
        var email = NewEmail();
        await RegisterAsync(email);

        var response = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = ValidPassword });

        // SMA-320: the gate answers a DISTINCT, machine-readable status — never
        // the generic invalid-credentials 401 — so the SPA can offer the resend.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("email_not_confirmed", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Login_UnconfirmedAccount_WrongPassword_StaysGeneric401()
    {
        var email = NewEmail();
        await RegisterAsync(email);

        var response = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = "Wr0ng!Pass" });

        // The deliberate ordering of the gate: the distinct 403 is only ever
        // revealed BEHIND the correct password. A wrong password on an
        // unconfirmed account must be indistinguishable from any other failed
        // login — no confirmation-state oracle for password guessers.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.DoesNotContain("email_not_confirmed", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Login_ConfirmedAccount_Returns204()
    {
        var email = NewEmail();
        await RegisterAsync(email);
        var (_, _, userId, token) = CapturedLink();
        Assert.Equal(HttpStatusCode.NoContent, (await ConfirmAsync(userId, token)).StatusCode);

        var response = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = ValidPassword });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task Register_IssuesNoSession_UntilConfirmedAndLoggedIn()
    {
        // R1 (GitHub Major): registration used to hand out a working cookie
        // while the Login gate was locked — the garage-door hole. One
        // end-to-end fact: the cookie-enabled client stays anonymous after
        // register, and only confirm + login open the session.
        // The client is https-based: outside Development the auth cookie is
        // Secure, and the CookieContainer only replays it over https — the
        // default http TestServer client would 401 forever AFTER login too,
        // which is not the fact under test.
        using var client = Fixture.Factory.CreateClient(
            new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        var email = NewEmail();
        var register = await client.PostAsJsonAsync("/api/auth/register", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        var meAfterRegister = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, meAfterRegister.StatusCode);

        var (_, _, userId, token) = CapturedLink();
        Assert.Equal(HttpStatusCode.NoContent, (await ConfirmAsync(userId, token)).StatusCode);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);

        var meAfterLogin = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, meAfterLogin.StatusCode);
    }

    [Fact]
    public async Task StampedToken_ForUnconfirmedAccount_IsInert_UntilConfirmation()
    {
        // R1: the OnTokenValidated lock reads LIVE state, not the token — the
        // SAME stamped token is refused before confirmation and honored after.
        var email = NewEmail();
        await RegisterAsync(email);
        var user = await FindUserAsync(email);
        Assert.NotNull(user);
        var stamped = Fixture.GenerateStampedToken(user!.Id, user.SecurityStamp!);

        using var before = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        before.Headers.Authorization = new AuthenticationHeaderValue("Bearer", stamped);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client.SendAsync(before)).StatusCode);

        var (_, _, userId, token) = CapturedLink();
        Assert.Equal(HttpStatusCode.NoContent, (await ConfirmAsync(userId, token)).StatusCode);

        using var after = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        after.Headers.Authorization = new AuthenticationHeaderValue("Bearer", stamped);
        Assert.Equal(HttpStatusCode.OK, (await Client.SendAsync(after)).StatusCode);
    }

    /// <summary>
    /// Builds the ExternalLoginInfo the Google middleware would hand the
    /// callback (no fake-Google harness exists — R2's safe-merge contract is
    /// proven by driving <see cref="AuthController.EnsureSafeGoogleMergeAsync"/>
    /// plus <c>AddLoginAsync</c>, the exact sequence the callback runs).
    /// <paramref name="emailVerified"/> null = claim absent.
    /// </summary>
    private static ExternalLoginInfo GoogleInfo(string email, string? emailVerified, string providerKey)
    {
        var claims = new List<Claim> { new(ClaimTypes.Email, email) };
        if (emailVerified is not null)
            claims.Add(new Claim("email_verified", emailVerified));
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "Google"));
        return new ExternalLoginInfo(principal, "Google", providerKey, "Google");
    }

    /// <summary>
    /// AspNetUserLogins is keyed on (LoginProvider, ProviderKey) and the
    /// fixture database is shared: keys follow the same unique-by-convention
    /// rule as NewEmail so no two tests — or runs — can ever collide (R3).
    /// </summary>
    private static string NewProviderKey(string label) => $"{label}-{Guid.NewGuid():N}";

    [Fact]
    public async Task GoogleMerge_PreHijackedUnconfirmedAccount_KillsPasswordAndConfirms()
    {
        // The attack: the attacker pre-registers the victim's email with a
        // known password; the victim later signs in with Google. The merge
        // must kill the latent password and confirm the account.
        var email = NewEmail();
        await RegisterAsync(email);

        using (var scope = CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(email);
            Assert.NotNull(user);

            var key = NewProviderKey("gkey-hijack");
            Assert.True(await AuthController.EnsureSafeGoogleMergeAsync(users, user!, GoogleInfo(email, "true", key), NullLogger.Instance));
            Assert.True((await users.AddLoginAsync(user!, GoogleInfo(email, "true", key))).Succeeded);

            Assert.False(await users.HasPasswordAsync(user!));
            Assert.True(user!.EmailConfirmed);
        }

        // The pre-registered password is DEAD — and dead as the generic 401,
        // not the unconfirmed 403 (the account is confirmed now).
        var login = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
    }

    [Fact]
    public async Task GoogleMerge_RotatesStamp_KillingPreMergeTokens()
    {
        var email = NewEmail();
        await RegisterAsync(email);
        string preMergeToken;
        string postMergeToken;
        using (var scope = CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(email);
            Assert.NotNull(user);
            preMergeToken = Fixture.GenerateStampedToken(user!.Id, user.SecurityStamp!);

            Assert.True(await AuthController.EnsureSafeGoogleMergeAsync(users, user, GoogleInfo(email, "true", NewProviderKey("gkey-rotate")), NullLogger.Instance));

            // The tracked instance carries the rotated stamp — the same read
            // the callback's token minting performs after the merge.
            postMergeToken = Fixture.GenerateStampedToken(user.Id, user.SecurityStamp!);
        }

        // Every pre-merge stamped token — the attacker's included — dies at
        // the OnTokenValidated lock on the stamp mismatch.
        using var before = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        before.Headers.Authorization = new AuthenticationHeaderValue("Bearer", preMergeToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client.SendAsync(before)).StatusCode);

        // A fresh post-merge session works: rotated stamp + confirmed account.
        using var after = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        after.Headers.Authorization = new AuthenticationHeaderValue("Bearer", postMergeToken);
        Assert.Equal(HttpStatusCode.OK, (await Client.SendAsync(after)).StatusCode);
    }

    [Theory]
    [InlineData("true", true)]
    [InlineData("True", true)]
    [InlineData("TRUE", true)]
    [InlineData("false", false)]
    [InlineData(null, false)]
    [InlineData("garbage", false)]
    public async Task GoogleMerge_VerifiedClaim_GatesTheMerge(string? verifiedRaw, bool expectMerge)
    {
        // Pins OUR TryParse consumption of the mapped claim (R3): MapJsonKey
        // stringifies the userinfo boolean, and the exact casing must not
        // matter — while anything unparsable or false refuses the merge and
        // leaves the account completely untouched.
        var email = NewEmail();
        await RegisterAsync(email);

        using var scope = CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email);
        Assert.NotNull(user);

        var merged = await AuthController.EnsureSafeGoogleMergeAsync(
            users, user!, GoogleInfo(email, verifiedRaw, NewProviderKey("gkey-claim")), NullLogger.Instance);

        Assert.Equal(expectMerge, merged);
        var fresh = await users.FindByEmailAsync(email);
        Assert.NotNull(fresh);
        Assert.Equal(expectMerge, fresh!.EmailConfirmed);
        Assert.Equal(expectMerge, !await users.HasPasswordAsync(fresh));
        Assert.Empty(await users.GetLoginsAsync(fresh));
    }

    [Fact]
    public async Task GoogleMerge_PasswordlessUnconfirmedAccount_ConfirmsWithoutRemovingAnything()
    {
        // The HasPasswordAsync guard's FALSE branch (R3): a Google-only
        // account left behind by a failed AddLoginAsync — no password to
        // remove, and RemovePasswordAsync must never be called (it fails on
        // an absent password and would turn every such merge into a refusal).
        var email = NewEmail();

        using var scope = CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.True((await users.CreateAsync(new ApplicationUser { UserName = email, Email = email })).Succeeded);
        var user = await users.FindByEmailAsync(email);
        Assert.NotNull(user);
        Assert.False(user!.EmailConfirmed);
        Assert.False(await users.HasPasswordAsync(user));

        Assert.True(await AuthController.EnsureSafeGoogleMergeAsync(
            users, user, GoogleInfo(email, "true", NewProviderKey("gkey-passwordless")), NullLogger.Instance));

        Assert.True(user.EmailConfirmed);
        Assert.False(await users.HasPasswordAsync(user));
    }

    [Fact]
    public async Task GoogleMerge_EmailMismatch_RefusedAndAccountUntouched()
    {
        // The precondition guard (R3): `user` must be the account the Google
        // identity NAMES. A mismatched pair — a future caller bug — must
        // never neutralize an unrelated account's password.
        var email = NewEmail();
        await RegisterAsync(email);

        using var scope = CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email);
        Assert.NotNull(user);

        var refused = await AuthController.EnsureSafeGoogleMergeAsync(
            users, user!, GoogleInfo(NewEmail(), "true", NewProviderKey("gkey-mismatch")), NullLogger.Instance);

        Assert.False(refused);
        var fresh = await users.FindByEmailAsync(email);
        Assert.NotNull(fresh);
        Assert.False(fresh!.EmailConfirmed);
        Assert.True(await users.HasPasswordAsync(fresh));
        Assert.Empty(await users.GetLoginsAsync(fresh));
    }

    [Fact]
    public async Task GoogleMerge_ConfirmedAccount_PreservesPasswordAndLinks()
    {
        var email = NewEmail();
        await RegisterAsync(email);
        var (_, _, userId, token) = CapturedLink();
        Assert.Equal(HttpStatusCode.NoContent, (await ConfirmAsync(userId, token)).StatusCode);

        using (var scope = CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(email);
            Assert.NotNull(user);
            Assert.True(user!.EmailConfirmed);
            var stampBefore = user.SecurityStamp;

            var key = NewProviderKey("gkey-confirmed");
            Assert.True(await AuthController.EnsureSafeGoogleMergeAsync(users, user, GoogleInfo(email, "true", key), NullLogger.Instance));
            Assert.True((await users.AddLoginAsync(user, GoogleInfo(email, "true", key))).Succeeded);

            // The standard model: verified-email linking into a confirmed
            // account touches nothing — password kept, stamp kept, link added.
            Assert.True(await users.HasPasswordAsync(user));
            Assert.Equal(stampBefore, user.SecurityStamp);
            Assert.Single(await users.GetLoginsAsync(user));
        }

        var login = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
    }

    private async Task<HttpResponseMessage> ResendAsync(string email) =>
        await Client.PostAsJsonAsync("/api/auth/resend-confirmation", new { email });

    [Fact]
    public async Task ResendConfirmation_UnconfirmedAccount_Returns200AndMailsAFreshWorkingLink()
    {
        var email = NewEmail();
        await RegisterAsync(email);
        Fixture.EmailStub.Reset();

        var response = await ResendAsync(email);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Exactly one send, and the FRESH link works end-to-end: confirm with
        // it, then the gate lets the login through.
        var (_, _, userId, token) = CapturedLink();
        Assert.Equal(HttpStatusCode.NoContent, (await ConfirmAsync(userId, token)).StatusCode);
        var login = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
    }

    [Fact]
    public async Task ResendConfirmation_UnknownEmail_Returns200GenericAndSendsNothing()
    {
        var known = NewEmail();
        await RegisterAsync(known);
        Fixture.EmailStub.Reset();
        var knownResponse = await ResendAsync(known);
        var mailedForKnown = Fixture.EmailStub.Sent.Count;
        Fixture.EmailStub.Reset();

        var unknownResponse = await ResendAsync(NewEmail());

        // The anti-enumeration mirror of ForgotPassword: same status, same body
        // whether the address exists or not — the only observable difference is
        // the mail itself.
        Assert.Equal(1, mailedForKnown);
        Assert.Empty(Fixture.EmailStub.Sent);
        Assert.Equal(HttpStatusCode.OK, unknownResponse.StatusCode);
        Assert.Equal(
            await knownResponse.Content.ReadAsStringAsync(),
            await unknownResponse.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ResendConfirmation_AlreadyConfirmed_Returns200GenericAndSendsNothing()
    {
        var email = NewEmail();
        await RegisterAsync(email);
        var (_, _, userId, token) = CapturedLink();
        Assert.Equal(HttpStatusCode.NoContent, (await ConfirmAsync(userId, token)).StatusCode);
        Fixture.EmailStub.Reset();
        var unknownProbe = await ResendAsync(NewEmail());

        var response = await ResendAsync(email);

        // A confirmed account gets NO mail — nothing useful to resend — and the
        // exact same generic body as the unknown-address branch (the previous
        // test ties that one to the unconfirmed branch: all three identical).
        Assert.Empty(Fixture.EmailStub.Sent);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(
            await unknownProbe.Content.ReadAsStringAsync(),
            await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ResendConfirmation_MissingFields_Returns400()
    {
        var response = await Client.PostAsJsonAsync("/api/auth/resend-confirmation", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ForgotPassword_KnownAddress_SendsOneEncodedResetLink()
    {
        var email = NewEmail();
        await RegisterAsync(email);
        Fixture.EmailStub.Reset();

        var response = await ForgotAsync(email);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var sent = Assert.Single(Fixture.EmailStub.Sent);
        Assert.Equal(email, sent.To);
        Assert.Contains("Reset your SmartCrops password", sent.Subject);
        Assert.Null(sent.ReplyToAddress);
        var match = ResetLinkPattern.Match(sent.TextBody);
        Assert.True(match.Success, $"No reset link in the email body:\n{sent.TextBody}");
        // Same percent-encoding contract as the confirmation link: a raw Identity
        // token carries '+' / '/', which would break unencoded.
        var rawToken = match.Groups["token"].Value;
        Assert.DoesNotContain("+", rawToken);
        Assert.DoesNotContain(" ", rawToken);
        Assert.Equal(rawToken, Uri.EscapeDataString(Uri.UnescapeDataString(rawToken)));
    }

    [Fact]
    public async Task ForgotPassword_UnknownAddress_SendsNothingAndAnswersIdentically()
    {
        var known = NewEmail();
        await RegisterAsync(known);
        Fixture.EmailStub.Reset();

        var knownResponse = await ForgotAsync(known);
        var mailedForKnown = Fixture.EmailStub.Sent.Count;
        Fixture.EmailStub.Reset();
        var unknownResponse = await ForgotAsync(NewEmail());

        // The endpoint must not disclose whether the address exists: same status,
        // same (empty) body — the only observable difference is the mail itself.
        Assert.Equal(1, mailedForKnown);
        Assert.Empty(Fixture.EmailStub.Sent);
        Assert.Equal(HttpStatusCode.Accepted, unknownResponse.StatusCode);
        Assert.Equal(knownResponse.StatusCode, unknownResponse.StatusCode);
        Assert.Equal(
            await knownResponse.Content.ReadAsStringAsync(),
            await unknownResponse.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ForgotPassword_MissingFields_Returns400()
    {
        var response = await Client.PostAsJsonAsync("/api/auth/forgot-password", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ResetPassword_TokenFromMailedLink_Returns204AndNewPasswordLogsIn()
    {
        var (email, userId, token) = await RegisterAndRequestResetAsync();

        var response = await ResetAsync(userId, token, "N3w!Passw0rd");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        // End-to-end proof: the NEW password logs in, the OLD one no longer does.
        var newLogin = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = "N3w!Passw0rd" });
        Assert.Equal(HttpStatusCode.NoContent, newLogin.StatusCode);
        var oldLogin = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);
    }

    [Fact]
    public async Task ResetPassword_ReplayedToken_Fails()
    {
        var (email, userId, token) = await RegisterAndRequestResetAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await ResetAsync(userId, token, "N3w!Passw0rd")).StatusCode);

        var replay = await ResetAsync(userId, token, "0ther!Passw0rd");

        // Deliberately NOT idempotent (unlike confirm-email): ResetPasswordAsync
        // rotated the stamp, so a consumed token must die on replay — and the
        // replayed attempt must not have changed the password again.
        Assert.Equal(HttpStatusCode.BadRequest, replay.StatusCode);
        var stillNew = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = "N3w!Passw0rd" });
        Assert.Equal(HttpStatusCode.NoContent, stillNew.StatusCode);
    }

    [Fact]
    public async Task ResetPassword_WeakPassword_Returns400WithIdentityDescriptions()
    {
        var (_, userId, token) = await RegisterAndRequestResetAsync();

        // Passes the DTO's [MinLength(6)] but violates Identity's default policy
        // (no digit, no uppercase, no special character).
        var response = await ResetAsync(userId, token, "weakpassword");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        // The raw IdentityError[] must reach the client so the page can show WHY.
        Assert.Contains("PasswordRequiresUpper", body);
        Assert.Contains("uppercase", body);
    }

    [Fact]
    public async Task ResetPassword_UnknownUserId_ReturnsSameResponseAsGarbageToken()
    {
        var (email, userId, _) = await RegisterAndRequestResetAsync();

        var garbage = await ResetAsync(userId, "not-a-real-token", "N3w!Passw0rd");
        var unknown = await ResetAsync(Guid.NewGuid().ToString(), "not-a-real-token", "N3w!Passw0rd");

        // The unknown-id branch fabricates the same InvalidToken IdentityError a real
        // user with a bad token gets — status AND body must be indistinguishable.
        Assert.Equal(HttpStatusCode.BadRequest, garbage.StatusCode);
        Assert.Equal(garbage.StatusCode, unknown.StatusCode);
        Assert.Equal(
            await garbage.Content.ReadAsStringAsync(),
            await unknown.Content.ReadAsStringAsync());
        // The transient probe behind the unknown-id branch (R2) must be write-free:
        // the real account still signs in with its original password.
        var login = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
    }

    [Fact]
    public async Task ResetPassword_MissingFields_Returns400()
    {
        var response = await Client.PostAsJsonAsync("/api/auth/reset-password", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ValidateResetToken_TokenFromMailedLink_Returns204()
    {
        var (_, userId, token) = await RegisterAndRequestResetAsync();

        var response = await ValidateAsync(userId, token);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task ValidateResetToken_GarbageToken_Returns400()
    {
        var (_, userId, _) = await RegisterAndRequestResetAsync();

        var response = await ValidateAsync(userId, "not-a-real-token");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ValidateResetToken_UnknownUserId_ReturnsSameResponseAsGarbageToken()
    {
        var (_, userId, token) = await RegisterAndRequestResetAsync();

        var garbage = await ValidateAsync(userId, "not-a-real-token");
        var unknown = await ValidateAsync(Guid.NewGuid().ToString(), "not-a-real-token");

        Assert.Equal(HttpStatusCode.BadRequest, garbage.StatusCode);
        Assert.Equal(garbage.StatusCode, unknown.StatusCode);
        Assert.Equal(
            await garbage.Content.ReadAsStringAsync(),
            await unknown.Content.ReadAsStringAsync());
        // The transient probe behind the unknown-id branch (R2) must be
        // side-effect-free: the genuine mailed token is still alive afterwards.
        Assert.Equal(HttpStatusCode.NoContent, (await ValidateAsync(userId, token)).StatusCode);
    }

    [Fact]
    public async Task ValidateResetToken_ThenResetWithSameToken_StillSucceeds()
    {
        var (email, userId, token) = await RegisterAndRequestResetAsync();

        var validate = await ValidateAsync(userId, token);
        var reset = await ResetAsync(userId, token, "N3w!Passw0rd");

        // THE invariant of R1-bis: verification must NOT consume the token — the
        // page pre-validates on load, then the user submits the SAME token.
        Assert.Equal(HttpStatusCode.NoContent, validate.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        var login = await Client.PostAsJsonAsync("/api/auth/login", new { email, password = "N3w!Passw0rd" });
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
    }

    [Fact]
    public async Task ValidateResetToken_ConsumedToken_Returns400()
    {
        var (_, userId, token) = await RegisterAndRequestResetAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await ResetAsync(userId, token, "N3w!Passw0rd")).StatusCode);

        var response = await ValidateAsync(userId, token);

        // The exact scenario that motivated R1-bis: reopening an already-consumed
        // link must be told apart from a live one BEFORE any form renders.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ── SMA-341: account deletion (art. 17) + data export (art. 20) ──────────

    private void AuthAs(string userId) =>
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));

    /// <summary>
    /// R2: explicit credential clear for tests whose NAME promises anonymity.
    /// Today each test instance gets a fresh Client (InitializeAsync), so no
    /// header can leak between tests — but AuthAs writes into the shared
    /// default headers, and a test that claims to send an anonymous request
    /// must not depend on that lifecycle detail staying true. The clear makes
    /// anonymity a property of the test, not of the fixture's plumbing.
    /// </summary>
    private void AuthAsAnonymous() =>
        Client.DefaultRequestHeaders.Authorization = null;

    private async Task<HttpResponseMessage> DeleteAccountAsync(string confirmation)
    {
        // DELETE with a JSON body — HttpClient has no DeleteAsJsonAsync.
        var request = new HttpRequestMessage(HttpMethod.Delete, "/api/auth/account")
        {
            Content = JsonContent.Create(new { confirmation }),
        };
        return await Client.SendAsync(request);
    }

    private async Task<(string Email, string UserId)> RegisterUserAsync()
    {
        var email = NewEmail();
        Assert.Equal(HttpStatusCode.Created, (await RegisterAsync(email)).StatusCode);
        var user = await FindUserAsync(email);
        Assert.NotNull(user);
        return (email, user!.Id);
    }

    private async Task<Guid> SeedGardenWithPlacementAsync(string userId, string name)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = new Garden { Id = Guid.NewGuid(), Name = name, UserId = userId };
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = $"Hedera helix {Guid.NewGuid():N}",
            PlantTypeId = 1,
        };
        db.Gardens.Add(garden);
        db.Plants.Add(plant);
        db.GardenPlacements.Add(new GardenPlacement
        {
            Id = Guid.NewGuid(),
            GardenId = garden.Id,
            PlantId = plant.Id,
            StartRow = 0,
            StartCol = 0,
            SpanRows = 1,
            SpanCols = 1,
            Notes = "sunny corner",
            PlacedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
        return garden.Id;
    }

    [Fact]
    public async Task DeleteAccount_UserWithGardens_RemovesUserGardensAndPlacements()
    {
        var (email, userId) = await RegisterUserAsync();
        var gardenId = await SeedGardenWithPlacementAsync(userId, "Balcony");
        Fixture.EmailStub.Reset();
        AuthAs(userId);

        var response = await DeleteAccountAsync(email);

        // THE RESTRICT case: Gardens → AspNetUsers blocks a bare DeleteAsync, so
        // a user who owns a garden must still be deletable end-to-end — this is
        // the test that would have caught the whole problem.
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await FindUserAsync(email));
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(0, await db.Gardens.CountAsync(g => g.UserId == userId));
        // Scoped to THIS test's garden (R2): a service-wide count against the
        // shared fixture DB collides with neighbours that deliberately keep
        // placements alive ("Kept", "Mine"/"NotMine"). The scoped count is also
        // the invariant actually under test: the cascade behind Gardens fired.
        Assert.Equal(0, await db.GardenPlacements.CountAsync(p => p.GardenId == gardenId));
        var sent = Assert.Single(Fixture.EmailStub.Sent);
        Assert.Equal(email, sent.To);
        Assert.Contains("account has been deleted", sent.Subject);
    }

    [Fact]
    public async Task DeleteAccount_ConfirmationCaseInsensitiveAndTrimmed_Succeeds()
    {
        var (email, userId) = await RegisterUserAsync();
        AuthAs(userId);

        // Product ruling: the brake is the ACT of typing — casing and stray
        // whitespace must not fail a genuine confirmation.
        var response = await DeleteAccountAsync($"  {email.ToUpperInvariant()}  ");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await FindUserAsync(email));
    }

    [Fact]
    public async Task DeleteAccount_WrongConfirmation_Returns400AndDeletesNothing()
    {
        var (email, userId) = await RegisterUserAsync();
        var gardenId = await SeedGardenWithPlacementAsync(userId, "Kept");
        AuthAs(userId);

        var response = await DeleteAccountAsync("someone-else@example.com");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull(await FindUserAsync(email));
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.NotNull(await db.Gardens.FindAsync(gardenId));
    }

    [Fact]
    public async Task DeleteAccount_RelayThrows_StillDeletesTheAccount()
    {
        var (email, userId) = await RegisterUserAsync();
        await SeedGardenWithPlacementAsync(userId, "Doomed");
        Fixture.EmailStub.Reset();
        Fixture.EmailStub.ThrowOnSend = true;
        AuthAs(userId);

        var response = await DeleteAccountAsync(email);

        // The account is already gone when the mail goes out — a delivery
        // failure must not fail the deletion.
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await FindUserAsync(email));
        Assert.Empty(Fixture.EmailStub.Sent);
    }

    [Fact]
    public async Task DeleteAccount_Anonymous_Returns401()
    {
        // The name promises anonymity — make it a property of the test (R2).
        AuthAsAnonymous();

        var response = await DeleteAccountAsync("whoever@example.com");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteAccount_AnonymizesPlantSuggestionsInsteadOfOrphaningThem()
    {
        var (email, userId) = await RegisterUserAsync();
        Guid suggestionId;
        Guid reviewedSuggestionId;
        DateTime seededUpdatedAt;
        DateTime seededReviewedUpdatedAt;
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var plant = new Plant
            {
                Id = Guid.NewGuid(),
                ScientificName = $"Salvia officinalis {Guid.NewGuid():N}",
                PlantTypeId = 1,
            };
            var suggestion = new PlantSuggestion
            {
                Id = Guid.NewGuid(),
                PlantId = plant.Id,
                UserId = userId,
                FieldName = "CommonName",
                SuggestedValue = "Sage",
            };
            // Second row exercising the SYMMETRIC branch (R2): the user only
            // REVIEWED this one. ReviewedBy carries no foreign key, so without
            // this assertion an admin deleting their own account would leave
            // their identity stamped on every moderation record they touched —
            // and dropping either ExecuteUpdateAsync would stay green.
            var reviewed = new PlantSuggestion
            {
                Id = Guid.NewGuid(),
                PlantId = plant.Id,
                UserId = null,
                ReviewedBy = userId,
                FieldName = "CommonName",
                SuggestedValue = "Garden sage",
            };
            db.Plants.Add(plant);
            db.PlantSuggestions.Add(suggestion);
            db.PlantSuggestions.Add(reviewed);
            await db.SaveChangesAsync();
            suggestionId = suggestion.Id;
            reviewedSuggestionId = reviewed.Id;
            // DB truth, not the tracked instance: the stored pre-deletion stamp
            // is the baseline the anonymization must move (R3). Both rows get a
            // baseline (R4): asserting only the authored one would let a
            // regression in the ReviewedBy chain's stamping pass unnoticed.
            seededUpdatedAt = await db.PlantSuggestions.AsNoTracking()
                .Where(s => s.Id == suggestion.Id)
                .Select(s => s.UpdatedAt)
                .SingleAsync();
            seededReviewedUpdatedAt = await db.PlantSuggestions.AsNoTracking()
                .Where(s => s.Id == reviewed.Id)
                .Select(s => s.UpdatedAt)
                .SingleAsync();
        }
        AuthAs(userId);

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteAccountAsync(email)).StatusCode);

        // PlantSuggestions.UserId / ReviewedBy are free strings with NO foreign
        // key: the deletion must sever the link to the person (anonymize) while
        // the botanical contribution itself survives.
        using var check = CreateScope();
        var checkDb = check.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var kept = await checkDb.PlantSuggestions.FindAsync(suggestionId);
        Assert.NotNull(kept);
        Assert.Null(kept!.UserId);
        // ExecuteUpdateAsync bypasses UpdateTimestampInterceptor (set-based
        // SQL, no tracked entities), so the endpoint stamps UpdatedAt itself
        // (R3) — a stale stamp would make the audit trail claim the row was
        // last touched before its own anonymization.
        Assert.NotEqual(seededUpdatedAt, kept.UpdatedAt);
        var keptReviewed = await checkDb.PlantSuggestions.FindAsync(reviewedSuggestionId);
        Assert.NotNull(keptReviewed);
        Assert.Null(keptReviewed!.ReviewedBy);
        Assert.NotEqual(seededReviewedUpdatedAt, keptReviewed.UpdatedAt);
        // CONTRACTUAL, not incidental (R4): the endpoint takes ONE anonymizedAt
        // for both ExecuteUpdate chains on purpose — one logical anonymization
        // event, one instant. This equality pins that; loosen it only if the
        // two chains are ever deliberately decoupled.
        Assert.Equal(kept.UpdatedAt, keptReviewed.UpdatedAt);
    }

    [Fact]
    public async Task ExportAccount_Anonymous_Returns401()
    {
        // The name promises anonymity — make it a property of the test (R2).
        AuthAsAnonymous();

        var response = await Client.GetAsync("/api/auth/account/export");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ExportAccount_ContainsOwnGardensAndNotAnotherUsers()
    {
        var (_, ownerId) = await RegisterUserAsync();
        var (_, otherId) = await RegisterUserAsync();
        await SeedGardenWithPlacementAsync(ownerId, "Mine");
        await SeedGardenWithPlacementAsync(otherId, "NotMine");
        // Arts. 17/20 scope parity (R2): one suggestion the owner AUTHORED
        // (exported) and one they merely REVIEWED as an admin (excluded — a
        // moderation record about someone else's contribution).
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var plant = new Plant
            {
                Id = Guid.NewGuid(),
                ScientificName = $"Thymus vulgaris {Guid.NewGuid():N}",
                PlantTypeId = 1,
            };
            db.Plants.Add(plant);
            db.PlantSuggestions.Add(new PlantSuggestion
            {
                Id = Guid.NewGuid(),
                PlantId = plant.Id,
                UserId = ownerId,
                FieldName = "CommonName",
                // Localized (R3): Language identifies the locale when FieldName
                // targets translated data — the export must preserve it.
                Language = "fr",
                SuggestedValue = "Authored by owner",
            });
            db.PlantSuggestions.Add(new PlantSuggestion
            {
                Id = Guid.NewGuid(),
                PlantId = plant.Id,
                UserId = otherId,
                ReviewedBy = ownerId,
                FieldName = "CommonName",
                SuggestedValue = "Merely reviewed by owner",
            });
            await db.SaveChangesAsync();
        }
        AuthAs(ownerId);

        var response = await Client.GetAsync("/api/auth/account/export");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // File-download contract (the codebase's first): attachment disposition
        // with a dated filename, so a browser saves instead of rendering.
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Matches(
            @"smartcrops-export-\d{4}-\d{2}-\d{2}\.json",
            response.Content.Headers.ContentDisposition?.FileName ?? "");
        // Defence in depth (R3): a personal-data document must not be kept by
        // the browser's disk cache or any intermediary.
        Assert.True(response.Headers.CacheControl?.NoStore);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.Equal(
            AccountExportResponse.CurrentSchemaVersion,
            root.GetProperty("schemaVersion").GetInt32());
        Assert.True(root.TryGetProperty("exportedAt", out _));
        var gardenNames = root.GetProperty("gardens").EnumerateArray()
            .Select(g => g.GetProperty("name").GetString())
            .ToList();
        Assert.Contains("Mine", gardenNames);
        Assert.DoesNotContain("NotMine", gardenNames);
        // Placements ride along with their notes — they are the user's words.
        var placements = root.GetProperty("gardens")[0].GetProperty("placements");
        Assert.Equal("sunny corner", placements[0].GetProperty("notes").GetString());
        // Authored suggestions are the caller's data; reviewed-only ones are not.
        var suggestionValues = root.GetProperty("suggestions").EnumerateArray()
            .Select(s => s.GetProperty("suggestedValue").GetString())
            .ToList();
        Assert.Contains("Authored by owner", suggestionValues);
        Assert.DoesNotContain("Merely reviewed by owner", suggestionValues);
        // The locale rides along (R3): without it, two otherwise identical
        // suggestions for different locales are the same row in the file.
        Assert.Equal("fr", root.GetProperty("suggestions")[0].GetProperty("language").GetString());
    }
}
