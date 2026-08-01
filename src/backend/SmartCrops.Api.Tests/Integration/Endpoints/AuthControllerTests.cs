using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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
            // is the baseline the anonymization must move (R3).
            seededUpdatedAt = await db.PlantSuggestions.AsNoTracking()
                .Where(s => s.Id == suggestion.Id)
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
