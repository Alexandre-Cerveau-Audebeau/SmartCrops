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
        await RegisterAsync(NewEmail());
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
}
