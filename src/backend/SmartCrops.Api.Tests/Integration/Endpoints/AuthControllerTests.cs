using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-31 — registration mails a confirmation link through the stubbed
/// <c>IEmailService</c>, and <c>POST /api/auth/confirm-email</c> consumes it.
/// The link is asserted end-to-end: every test that confirms an address pulls the
/// token out of the captured email body rather than regenerating one, so a link
/// that would break in a real mail client fails the suite here.
/// <para>No gating is asserted because none exists — an unconfirmed account keeps
/// full access by product ruling; SMA-320 tracks turning the block on.</para>
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
    /// Registers an account, drops its registration-confirmation email from the stub
    /// (so reset assertions see only reset traffic), requests a reset, and returns the
    /// DECODED userId/token pulled from the mailed link — never regenerated.
    /// </summary>
    private async Task<(string Email, string UserId, string Token)> RegisterAndRequestResetAsync()
    {
        var email = NewEmail();
        await RegisterAsync(email);
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
}
