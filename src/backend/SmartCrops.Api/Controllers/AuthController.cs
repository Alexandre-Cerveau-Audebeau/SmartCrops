using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SmartCrops.Api.Configuration;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Email;

namespace SmartCrops.Api.Controllers;

public record RegisterRequest([Required, EmailAddress] string Email, [Required, MinLength(6)] string Password);
public record LoginRequest([Required, EmailAddress] string Email, [Required] string Password);
public record AuthResponse(string Token, DateTime Expiration);
/// <summary>Shape returned by <c>GET /api/auth/me</c>. <see cref="IsAdmin"/> (SMA-33)
/// lets the frontend hide admin-only UI; it is UX only — backend authorization is
/// enforced by <c>[Authorize(Roles = "Admin")]</c>.</summary>
public record MeResponse(string UserId, string? Email, string? DisplayName, bool IsAdmin);
public record ExchangeCodeRequest([Required] string Code);
public record UserProfileResponse(string Email, string? DisplayName, string? FirstName, string? LastName, string? City, bool HasPassword);
public record UpdateProfileRequest(
    [StringLength(100)] string? DisplayName,
    [StringLength(50)] string? FirstName,
    [StringLength(50)] string? LastName,
    [StringLength(100)] string? City);
public record ChangePasswordRequest([Required] string CurrentPassword, [Required, MinLength(6)] string NewPassword);
/// <summary>Payload of <c>POST /api/auth/confirm-email</c> (SMA-31). Both values come
/// straight from the confirmation link's query string, URL-decoded by the SPA.</summary>
public record ConfirmEmailRequest([Required] string UserId, [Required] string Token);
/// <summary>Payload of <c>POST /api/auth/forgot-password</c> (SMA-323).</summary>
public record ForgotPasswordRequest([Required, EmailAddress] string Email);
/// <summary>Payload of <c>POST /api/auth/resend-confirmation</c> (SMA-320).</summary>
public record ResendConfirmationRequest([Required, EmailAddress] string Email);
/// <summary>Payload of <c>POST /api/auth/reset-password</c> (SMA-323). UserId/Token come
/// from the reset link's query string, URL-decoded by the SPA; the new password floor
/// mirrors <see cref="ChangePasswordRequest"/>.</summary>
public record ResetPasswordRequest([Required] string UserId, [Required] string Token, [Required, MinLength(6)] string NewPassword);
/// <summary>Payload of <c>POST /api/auth/reset-password/validate</c> (SMA-323 R1-bis).</summary>
public record ValidateResetTokenRequest([Required] string UserId, [Required] string Token);
/// <summary>Payload of <c>DELETE /api/auth/account</c> (SMA-341). The confirmation is
/// the account's OWN email address, typed by the user — uniform across account types
/// by product ruling (Google-only accounts have no password to re-prove).</summary>
public record DeleteAccountRequest([Required] string Confirmation);

// ── GDPR art. 20 export shapes (SMA-341) ────────────────────────────────────
// The export carries the user's PERSONAL data only: profile fields, gardens and
// placements (with notes), and the plant suggestions they AUTHORED. Catalogue
// data (plant names, botany) is public reference data, not theirs — placements
// and suggestions carry the PlantId reference alone. CellsJson /
// LightScheduleJson are exported as the raw stored strings: faithful to what
// the service holds, and immune to legacy payloads a re-parse could choke on.
public record AccountExportProfile(string Email, string? DisplayName, string? FirstName, string? LastName, string? City);
/// <summary>One plant suggestion the user AUTHORED (R2, arts. 17/20 scope
/// parity): the deletion path anonymizes these rows as the person's data, so
/// the portability export must carry them too — the two articles cover one
/// data set. <see cref="Language"/> (R3) identifies the locale when
/// <see cref="FieldName"/> targets translated data — without it, two otherwise
/// identical suggestions for different locales are the same row in the file.</summary>
public record AccountExportSuggestion(Guid PlantId, string FieldName, string? Language, string SuggestedValue, string? Reason, string Status, DateTime CreatedAt);
public record AccountExportPlacement(Guid PlantId, int StartRow, int StartCol, int SpanRows, int SpanCols, string? Notes, DateTime PlacedAt);
public record AccountExportGarden(
    Guid Id,
    string Name,
    string? Description,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int? LayoutWidth,
    int? LayoutHeight,
    string? CellSize,
    string? CellsJson,
    string? Orientation,
    string? GardenType,
    string? LightScheduleJson,
    string? Hemisphere,
    string? LatitudeBand,
    List<AccountExportPlacement> Placements);
/// <summary>Top-level export document: <see cref="ExportedAt"/> dates it,
/// <see cref="SchemaVersion"/> versions it — an undatable, unversionable
/// portability export ages badly.</summary>
public record AccountExportResponse(DateTime ExportedAt, int SchemaVersion, AccountExportProfile Profile, List<AccountExportGarden> Gardens, List<AccountExportSuggestion> Suggestions)
{
    /// <summary>The version external consumers pin against (R2): named HERE,
    /// beside the contract it versions, rather than as a bare literal in the
    /// endpoint. Bump on any breaking shape change.</summary>
    public const int CurrentSchemaVersion = 1;
}

[ApiController]
[Route("api/[controller]")]
public class AuthController(
    UserManager<ApplicationUser> userManager,
    SignInManager<ApplicationUser> signInManager,
    IConfiguration configuration,
    IAuthenticationSchemeProvider schemeProvider,
    IHostEnvironment hostEnvironment,
    IEmailService emailService,
    ILogger<AuthController> logger,
    IOptions<FrontendOptions> frontendOptions,
    IOptions<SmtpOptions> smtpOptions,
    SmartCropsDbContext dbContext,
    IWebHostEnvironment env) : ControllerBase
{
    private static readonly PasswordHasher<ApplicationUser> _dummyHasher = new();
    private static readonly string _dummyHash = _dummyHasher.HashPassword(new ApplicationUser(), "DummyPassword123!");
    private static readonly ConcurrentDictionary<string, (string Token, DateTime Expiry, string Binding)> _authCodes = new();

    // Indented on purpose: the export is a file the USER opens, not a wire
    // payload — legibility beats the few saved bytes.
    private static readonly JsonSerializerOptions ExportJson =
        new(JsonSerializerDefaults.Web) { WriteIndented = true };

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request, CancellationToken ct)
    {
        var user = new ApplicationUser { UserName = request.Email, Email = request.Email };
        var result = await userManager.CreateAsync(user, request.Password);

        if (!result.Succeeded)
            return BadRequest(result.Errors);

        await SendConfirmationEmailAsync(user, request.Email, ct);

        // SMA-320 R1: no session for a fresh account. The account starts
        // unconfirmed, and both locks (the Login gate and the OnTokenValidated
        // check) would reject its token anyway — handing out an inert cookie
        // would only manufacture confusing half-logged-in states. Registration
        // still succeeds and the confirmation email still goes out; the 201
        // keeps its empty body (the SPA routes the user toward Login).
        return StatusCode(201);
    }

    /// <summary>
    /// SMA-31: mails the account-confirmation link. Registration is NOT gated on the
    /// result — the account already exists and the caller is about to be signed in, so
    /// an SMTP outage must never cost the user their account. Any delivery failure is
    /// logged server-side and swallowed; the endpoint still returns 201. Re-sending a
    /// link after a failed delivery is SMA-320's problem, not this method's.
    /// </summary>
    private async Task SendConfirmationEmailAsync(ApplicationUser user, string email, CancellationToken ct)
    {
        try
        {
            var token = await userManager.GenerateEmailConfirmationTokenAsync(user);

            // Both values MUST be percent-encoded: the Identity token is base64-ish and
            // routinely contains '+' and '/', which would otherwise be decoded as a
            // space / path separator and silently invalidate the link.
            var link = $"{ResolveFrontendBaseUrl()}/confirm-email" +
                $"?userId={Uri.EscapeDataString(user.Id)}" +
                $"&token={Uri.EscapeDataString(token)}";

            // Plain text only — IEmailService carries no HTML body and no templating,
            // and the backend has no localization, so the copy is English (see SMA-31).
            var textBody =
                "Welcome to SmartCrops!\n\n" +
                "Please confirm your email address by opening the link below:\n\n" +
                $"{link}\n\n" +
                "If you did not create a SmartCrops account, you can safely ignore this message.\n";

            // Registration latency must not inherit the relay's worst case: this 5 s
            // cap is DELIBERATELY tighter than SmtpEmailService's own 10 s sequence
            // budget (SMA-30, sized for the contact form) — not a duplicate of it. A
            // timeout lands in the catch below like any other delivery failure.
            using var sendCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            sendCts.CancelAfter(TimeSpan.FromSeconds(5));

            await emailService.SendAsync(
                email,
                "Confirm your SmartCrops email address",
                textBody,
                ct: sendCts.Token);
        }
        catch (Exception ex)
        {
            // Deliberately catches everything, cancellation included: the account is
            // already committed, so there is nothing to roll back and nothing the
            // caller could usefully do with the error.
            logger.LogError(ex, "Registration confirmation email delivery failed for '{Email}'", MaskEmail(email));
        }
    }

    /// <summary>
    /// R2 of SMA-323: builds the throwaway user that the unknown-id branches of
    /// <see cref="ConfirmEmail"/>, <see cref="ResetPassword"/> and
    /// <see cref="ValidateResetToken"/> probe with before answering. Identity reads
    /// Id/SecurityStamp straight off the instance during token validation and never
    /// hits the store, and a genuine token embeds the REAL user's id and stamp —
    /// both mismatch here — so the probe can never succeed and every caller
    /// discards its result. Its only job is temporal: the miss path pays the same
    /// token-validation cost as a real account, so response time stops disclosing
    /// which account ids exist.
    /// </summary>
    private static ApplicationUser CreateProbeUser(string userId) => new()
    {
        Id = userId,
        SecurityStamp = Guid.NewGuid().ToString("N"),
    };

    /// <summary>
    /// SMA-31: confirms an email address from the link mailed at registration.
    /// POST (not GET) because the SPA page owns the exchange, mirroring how the OAuth
    /// callback POSTs its code back. Idempotent — a second click on the same link
    /// returns 204 rather than an error. Deliberately opaque: an unknown user id and a
    /// bad token return the identical 400, and the unknown-user branch validates a
    /// token of equivalent shape before answering, so neither the body nor the
    /// response time reveals which account ids exist (R2).
    /// </summary>
    [HttpPost("confirm-email")]
    public async Task<IActionResult> ConfirmEmail([FromBody] ConfirmEmailRequest request)
    {
        var user = await userManager.FindByIdAsync(request.UserId);
        if (user is null)
        {
            // Timing equalization: run the same confirmation path against a transient
            // user before returning the identical 400 — see CreateProbeUser for why
            // the probe is safe, cannot succeed, and its result is discarded.
            _ = await userManager.ConfirmEmailAsync(CreateProbeUser(request.UserId), request.Token);
            return BadRequest(new { error = "Invalid or expired confirmation link." });
        }

        if (user.EmailConfirmed)
            return NoContent();

        var result = await userManager.ConfirmEmailAsync(user, request.Token);
        if (!result.Succeeded)
            return BadRequest(new { error = "Invalid or expired confirmation link." });

        return NoContent();
    }

    /// <summary>
    /// SMA-320: re-mails the confirmation link for an account whose address was
    /// never confirmed — the recovery path for the 403 the login gate answers.
    /// Mirrors <see cref="ForgotPassword"/>'s anti-enumeration shape: the
    /// response is the identical generic 200 whether the address is unknown,
    /// already confirmed, or unconfirmed — only the mail itself differs. Shares
    /// the "passwordReset" rate-limit budget rather than adding a fourth sister
    /// policy: same anti-enumeration threat class, one throttling door. Like its
    /// sibling, the send branch pays inline SMTP while a miss returns instantly —
    /// the same known timing side-channel, owed the same structural fix
    /// (decoupled delivery, SMA-325), deliberately not papered over here.
    /// </summary>
    [HttpPost("resend-confirmation")]
    [EnableRateLimiting("passwordReset")]
    public async Task<IActionResult> ResendConfirmation([FromBody] ResendConfirmationRequest request, CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(request.Email);

        if (user is not null && !user.EmailConfirmed)
        {
            // Generates a FRESH confirmation token and reuses the registration
            // path's escaped-link construction; delivery failures are logged and
            // swallowed there, so the generic 200 below discloses nothing.
            await SendConfirmationEmailAsync(user, request.Email, ct);
        }

        return Ok(new { message = "If an account exists and is unconfirmed, a confirmation email has been sent." });
    }

    /// <summary>
    /// SMA-323: mails a password-reset link. Always answers 202 with no body — whether
    /// the address exists (and whether mail went out) is deliberately not disclosed.
    /// EmailConfirmed is NOT checked: a user who never confirmed still owns the
    /// account. Google-only accounts (no local password) get a link too — Identity
    /// lets them set a first password, a legitimate recovery path.
    /// </summary>
    [HttpPost("forgot-password")]
    [EnableRateLimiting("passwordReset")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request, CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(request.Email);

        // The response is identical either way, but an existing account pays up to 5 s
        // of inline SMTP while a miss returns instantly — a timing side-channel
        // remains. Deliberately NOT papered over with an artificial delay: the
        // structural fix is decoupled delivery (SMA-325), which makes both paths
        // return immediately.
        if (user is not null)
        {
            await SendPasswordResetEmailAsync(user, request.Email, ct);
        }

        return Accepted();
    }

    /// <summary>
    /// SMA-323: mails the password-reset link. Mirrors
    /// <see cref="SendConfirmationEmailAsync"/>: the caller is never failed by a
    /// delivery problem (the endpoint's 202 discloses nothing), the send is capped at
    /// 5 s (tighter than SmtpEmailService's 10 s SMA-30 budget — not a duplicate),
    /// and any failure is logged with the masked address, then swallowed.
    /// </summary>
    private async Task SendPasswordResetEmailAsync(ApplicationUser user, string email, CancellationToken ct)
    {
        try
        {
            var token = await userManager.GeneratePasswordResetTokenAsync(user);

            // Both values MUST be percent-encoded: the Identity token is base64-ish and
            // routinely contains '+' and '/', which would otherwise be decoded as a
            // space / path separator and silently invalidate the link.
            var link = $"{ResolveFrontendBaseUrl()}/reset-password" +
                $"?userId={Uri.EscapeDataString(user.Id)}" +
                $"&token={Uri.EscapeDataString(token)}";

            // Plain text only — IEmailService carries no HTML body and no templating,
            // and the backend has no localization, so the copy is English (SMA-323).
            var textBody =
                "Hello,\n\n" +
                "A password reset was requested for your SmartCrops account. Open the link below to choose a new password:\n\n" +
                $"{link}\n\n" +
                "If you did not request this, you can safely ignore this message — your password is unchanged.\n";

            using var sendCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            sendCts.CancelAfter(TimeSpan.FromSeconds(5));

            await emailService.SendAsync(
                email,
                "Reset your SmartCrops password",
                textBody,
                ct: sendCts.Token);
        }
        catch (Exception ex)
        {
            // Deliberately catches everything, cancellation included: the 202 is
            // already owed and discloses nothing, so there is no error to surface.
            logger.LogError(ex, "Password-reset email delivery failed for '{Email}'", MaskEmail(email));
        }
    }

    /// <summary>
    /// SMA-323: consumes the reset link mailed by <see cref="ForgotPassword"/>.
    /// Deliberately NOT idempotent, unlike confirm-email: ResetPasswordAsync rotates
    /// the security stamp, so a consumed token fails on replay — that is the point of
    /// a reset token. An unknown user id returns the same body — and, through the
    /// transient probe (R2), the same response time — as an invalid token (never
    /// reveal which ids exist); a refused password returns the raw IdentityError[]
    /// like ChangePassword, so the client can show WHY. Behind the shared
    /// "passwordReset" budget since R2: this is the endpoint that consumes the token
    /// and pays for Identity hashing, so it is the one most worth throttling.
    /// </summary>
    [HttpPost("reset-password")]
    [EnableRateLimiting("passwordReset")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        var user = await userManager.FindByIdAsync(request.UserId);
        if (user is null)
        {
            // Timing equalization (R2): probe through the same reset path a real
            // user takes — safe because ResetPasswordAsync validates the token
            // BEFORE the password, so nothing can ever be written — and answer
            // exactly what a real user with a dead token gets.
            // The manager's ErrorDescriber is the DI-configured one (R4): a custom
            // or localized describer (SMA-32) must reach these responses, which a
            // locally constructed instance would silently bypass.
            _ = await userManager.ResetPasswordAsync(CreateProbeUser(request.UserId), request.Token, request.NewPassword);
            return BadRequest(new[] { userManager.ErrorDescriber.InvalidToken() });
        }

        var result = await userManager.ResetPasswordAsync(user, request.Token, request.NewPassword);
        if (!result.Succeeded)
            return BadRequest(result.Errors);

        // No UpdateSecurityStampAsync here: ResetPasswordAsync already rotated the
        // stamp internally (that is what kills the token and any live JWTs); calling
        // it again would be redundant. The cookie delete mirrors ChangePassword —
        // harmless if absent, correct if this browser still held a session.
        Response.Cookies.Delete("smartcrops_token", new CookieOptions { Path = "/" });
        return NoContent();
    }

    /// <summary>
    /// SMA-323 R1-bis: pre-validates a reset link so the SPA can hide the password
    /// form when the link is already dead (consumed, expired, tampered) instead of
    /// letting the user type a new password that the submit will refuse. Verification
    /// does NOT consume the token — an Identity reset token dies when the security
    /// stamp rotates on a successful reset, not from being verified — and exposing it
    /// is safe: a 204/400 here tells the holder of the link nothing they would not
    /// learn by submitting, and the real authority remains <see cref="ResetPassword"/>
    /// itself. Shares the "passwordReset" budget with forgot-password and
    /// reset-password itself (since R2): one throttling door for the whole journey,
    /// so no endpoint of the flow can be hammered. The unknown-user branch returns
    /// the same body — and, through the transient probe (R2), the same response
    /// time — as an invalid token.
    /// </summary>
    [HttpPost("reset-password/validate")]
    [EnableRateLimiting("passwordReset")]
    public async Task<IActionResult> ValidateResetToken([FromBody] ValidateResetTokenRequest request)
    {
        var user = await userManager.FindByIdAsync(request.UserId);
        if (user is null)
        {
            // Timing equalization (R2): pay the same verification cost a real
            // account pays — the identical provider/purpose pair — before
            // answering exactly what a dead token answers.
            _ = await userManager.VerifyUserTokenAsync(
                CreateProbeUser(request.UserId),
                userManager.Options.Tokens.PasswordResetTokenProvider,
                UserManager<ApplicationUser>.ResetPasswordTokenPurpose,
                request.Token);
            return BadRequest(new[] { userManager.ErrorDescriber.InvalidToken() });
        }

        // Provider and purpose read off UserManager — the exact pair
        // ResetPasswordAsync verifies with internally, never hard-coded strings.
        var valid = await userManager.VerifyUserTokenAsync(
            user,
            userManager.Options.Tokens.PasswordResetTokenProvider,
            UserManager<ApplicationUser>.ResetPasswordTokenPurpose,
            request.Token);
        if (!valid)
            return BadRequest(new[] { userManager.ErrorDescriber.InvalidToken() });

        return NoContent();
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var user = await userManager.FindByEmailAsync(request.Email);
        if (user is null)
        {
            _dummyHasher.VerifyHashedPassword(new ApplicationUser(), _dummyHash, request.Password);
            return Unauthorized();
        }

        if (!await userManager.CheckPasswordAsync(user, request.Password))
            return Unauthorized();

        // SMA-320: unconfirmed accounts do not sign in. NOT wired through
        // Identity's SignInOptions.RequireConfirmedEmail — that option only
        // gates SignInManager's CanSignInAsync chain, which this endpoint never
        // calls (it authenticates with CheckPasswordAsync), so it would be dead
        // config here. Deliberately placed AFTER the password check: a wrong
        // password stays the generic 401, and the distinct machine-readable
        // status is only ever revealed to a caller holding the correct
        // password — required for the resend UX without opening an
        // account-enumeration channel.
        if (!user.EmailConfirmed)
            return StatusCode(403, new { error = "email_not_confirmed" });

        if (string.IsNullOrEmpty(user.Email))
            return Unauthorized();

        var tokenResponse = GenerateTokenResponse(user.Id, user.Email, user.SecurityStamp, await userManager.GetRolesAsync(user));
        SetAuthCookie(tokenResponse.Token);
        return NoContent();
    }

    [HttpGet("google-login")]
    public async Task<IActionResult> GoogleLogin()
    {
        var scheme = await schemeProvider.GetSchemeAsync(GoogleDefaults.AuthenticationScheme);
        if (scheme is null)
            return NotFound(new { error = "Google authentication is not configured" });

        var properties = signInManager.ConfigureExternalAuthenticationProperties(
            GoogleDefaults.AuthenticationScheme,
            Url.Action(nameof(GoogleCallback)));
        return Challenge(properties, GoogleDefaults.AuthenticationScheme);
    }

    [HttpGet("google-callback")]
    public async Task<IActionResult> GoogleCallback()
    {
        CleanupExpiredCodes();

        try
        {
            // Resolved INSIDE the try (R2): a missing Frontend:BaseUrl outside
            // Development still fails loud, but now flows through the finally — outside
            // the try, the throw would skip the external-scheme sign-out and leak that
            // cookie on a misconfigured deployment.
            var frontendUrl = ResolveFrontendBaseUrl();

            var info = await signInManager.GetExternalLoginInfoAsync();
            if (info is null)
                return Redirect($"{frontendUrl}/login?error=google-failed");

            var email = info.Principal.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrEmpty(email))
                return Redirect($"{frontendUrl}/login?error=no-email");

            var user = await userManager.FindByEmailAsync(email);
            if (user is null)
            {
                user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true };
                var createResult = await userManager.CreateAsync(user);
                if (!createResult.Succeeded)
                    return Redirect($"{frontendUrl}/login?error=create-failed");

                var addLoginResult = await userManager.AddLoginAsync(user, info);
                if (!addLoginResult.Succeeded)
                {
                    await userManager.DeleteAsync(user);
                    return Redirect($"{frontendUrl}/login?error=link-failed");
                }
            }
            else
            {
                var logins = await userManager.GetLoginsAsync(user);
                if (!logins.Any(l => l.LoginProvider == info.LoginProvider && l.ProviderKey == info.ProviderKey))
                {
                    var addLoginResult = await userManager.AddLoginAsync(user, info);
                    if (!addLoginResult.Succeeded)
                        return Redirect($"{frontendUrl}/login?error=link-failed");
                }
            }

            var tokenResponse = GenerateTokenResponse(user.Id, email, user.SecurityStamp, await userManager.GetRolesAsync(user));
            var code = Guid.NewGuid().ToString("N");
            var binding = Guid.NewGuid().ToString("N");
            _authCodes[code] = (tokenResponse.Token, DateTime.UtcNow.AddMinutes(1), binding);

            Response.Cookies.Append("auth_binding", binding, new CookieOptions
            {
                HttpOnly = true,
                Secure = !hostEnvironment.IsDevelopment(),
                SameSite = SameSiteMode.Lax,
                MaxAge = TimeSpan.FromMinutes(2),
                Path = "/api/auth/exchange-code",
            });

            return Redirect(BuildAuthCallbackRedirect(frontendUrl, code));
        }
        finally
        {
            await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
        }
    }

    /// <summary>
    /// SMA-321: builds the SPA callback redirect. The code MUST be
    /// percent-encoded, exactly like the mailed confirmation/reset links above:
    /// today's codes are hex GUIDs that survive raw interpolation, but the
    /// construction must not sit one code-format change away from a silently
    /// broken login — this ends the file showing both practices side by side.
    /// Static so the encoding contract is unit-testable (MVC never discovers
    /// static methods as actions).
    /// </summary>
    public static string BuildAuthCallbackRedirect(string frontendUrl, string code) =>
        $"{frontendUrl}/auth/callback?code={Uri.EscapeDataString(code)}";

    [HttpPost("exchange-code")]
    public IActionResult ExchangeCode([FromBody] ExchangeCodeRequest request)
    {
        var bindingCookie = Request.Cookies["auth_binding"];

        if (!_authCodes.TryGetValue(request.Code, out var stored))
            return BadRequest(new { error = "Invalid or expired code" });

        if (stored.Expiry < DateTime.UtcNow)
        {
            _authCodes.TryRemove(request.Code, out _);
            return BadRequest(new { error = "Code expired" });
        }

        if (string.IsNullOrEmpty(bindingCookie) || bindingCookie != stored.Binding)
        {
            _authCodes.TryRemove(request.Code, out _);
            return BadRequest(new { error = "Invalid binding" });
        }

        if (!_authCodes.TryRemove(request.Code, out _))
            return BadRequest(new { error = "Invalid or expired code" });

        Response.Cookies.Delete("auth_binding", new CookieOptions { Path = "/api/auth/exchange-code" });
        SetAuthCookie(stored.Token);
        return NoContent();
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete("smartcrops_token", new CookieOptions { Path = "/" });
        return Ok();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userId = GetCurrentUserId();
        var email = User.FindFirstValue(ClaimTypes.Email);
        if (userId == null) return Unauthorized();
        var user = await userManager.FindByIdAsync(userId);
        // SMA-33: surface the admin role so the frontend can hide admin-only UI.
        // Authoritative source is the DB role membership (not the JWT claim) so a
        // role granted after the current token was issued is reflected on the next
        // /me without re-login. The real authorization barrier is the backend
        // [Authorize(Roles = "Admin")] gating — this flag is UX only.
        var isAdmin = user is not null && await userManager.IsInRoleAsync(user, Roles.Admin);
        return Ok(new MeResponse(userId, email, user?.DisplayName, isAdmin));
    }

    [Authorize]
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();
        var user = await userManager.FindByIdAsync(userId);
        if (user == null) return NotFound();
        var hasPassword = await userManager.HasPasswordAsync(user);
        return Ok(new UserProfileResponse(
            user.Email ?? "",
            user.DisplayName,
            user.FirstName,
            user.LastName,
            user.City,
            hasPassword));
    }

    [Authorize]
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();
        var user = await userManager.FindByIdAsync(userId);
        if (user == null) return NotFound();

        user.DisplayName = request.DisplayName;
        user.FirstName = request.FirstName;
        user.LastName = request.LastName;
        user.City = request.City;

        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded) return BadRequest(result.Errors);

        var hasPassword = await userManager.HasPasswordAsync(user);
        return Ok(new UserProfileResponse(
            user.Email ?? "",
            user.DisplayName,
            user.FirstName,
            user.LastName,
            user.City,
            hasPassword));
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();
        var user = await userManager.FindByIdAsync(userId);
        if (user == null) return NotFound();

        var result = await userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded) return BadRequest(result.Errors);

        await userManager.UpdateSecurityStampAsync(user);
        Response.Cookies.Delete("smartcrops_token", new CookieOptions { Path = "/" });
        return NoContent();
    }

    /// <summary>
    /// SMA-341 (GDPR art. 17): self-service account deletion, mirroring
    /// ChangePassword's shape. Confirmation is the account's own email address,
    /// typed — uniform across account types, unlike a password re-proof (Google-only
    /// accounts have none). Gardens are deleted BEFORE the user because their FK to
    /// AspNetUsers is DeleteBehavior.Restrict: the obvious
    /// <c>userManager.DeleteAsync</c> one-liner fails outright for any user who owns
    /// a garden (placements then cascade behind gardens, and the four Identity
    /// satellites — claims, logins, roles, tokens — cascade behind the user). The
    /// whole sequence runs in ONE transaction: a half-deleted account (gardens gone,
    /// user still there) is worse than a failed deletion.
    /// </summary>
    [Authorize]
    [HttpDelete("account")]
    [EnableRateLimiting("account")]
    public async Task<IActionResult> DeleteAccount([FromBody] DeleteAccountRequest request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();
        var user = await userManager.FindByIdAsync(userId);
        if (user == null) return NotFound();

        var email = user.Email;

        // Case-insensitive + trimmed by product ruling: the brake is the ACT of
        // typing, not casing pedantry. The error body reveals nothing the caller
        // does not already know — they are authenticated as this very account.
        if (string.IsNullOrEmpty(email) ||
            !string.Equals(request.Confirmation.Trim(), email, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { error = "The confirmation does not match your account email address." });
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(ct);

        // Gardens first (Restrict — see the method summary); GardenPlacements
        // cascade in-database behind them.
        await dbContext.Gardens.Where(g => g.UserId == userId).ExecuteDeleteAsync(ct);

        // PlantSuggestions.UserId / ReviewedBy are free strings with NO foreign
        // key (pre-flight), so a user delete would leave them dangling. Decision:
        // ANONYMIZE, not delete — a suggestion's text is a botanical fact
        // correction with community value and no personal content; erasure
        // requires severing the link to the person, not destroying the
        // contribution. (0 rows carry a UserId today; this is structural.)
        // UpdatedAt is stamped EXPLICITLY (R3): ExecuteUpdateAsync is set-based
        // SQL with no tracked entities, so UpdateTimestampInterceptor — which
        // only sees tracked SaveChanges — never fires here, and the audit
        // trail would silently claim the rows were last touched before their
        // own anonymization.
        var anonymizedAt = DateTime.UtcNow;
        await dbContext.PlantSuggestions
            .Where(s => s.UserId == userId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.UserId, (string?)null)
                .SetProperty(x => x.UpdatedAt, anonymizedAt), ct);
        await dbContext.PlantSuggestions
            .Where(s => s.ReviewedBy == userId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.ReviewedBy, (string?)null)
                .SetProperty(x => x.UpdatedAt, anonymizedAt), ct);

        // Same scoped DbContext as the store behind UserManager, so this delete
        // joins the transaction above. The AspNetUserLogins row of a Google-linked
        // account cascades away with the user — but the OAuth grant living in the
        // user's GOOGLE account is NOT revoked here: no revocation API is called
        // anywhere in this codebase; the user retires it from their Google
        // security settings.
        var result = await userManager.DeleteAsync(user);
        if (!result.Succeeded)
        {
            await transaction.RollbackAsync(ct);
            return BadRequest(result.Errors);
        }

        await transaction.CommitAsync(ct);

        // Cookie delete mirrors ChangePassword. No UpdateSecurityStampAsync here:
        // there is no row left to stamp — any still-issued JWT dies at the
        // per-request security-stamp check the moment the user lookup misses.
        Response.Cookies.Delete("smartcrops_token", new CookieOptions { Path = "/" });

        // CancellationToken.None — a DELIBERATE break of symmetry with
        // SendConfirmationEmailAsync (which forwards the request token). Past
        // the commit above the deletion is irreversible, and this notice is the
        // only one the user will ever get: it is part of the art. 17
        // deliverable, not a courtesy. The request token would tie the send to
        // the CLIENT's connection — and the SPA redirects away on success,
        // making a disconnect ordinary. At registration nothing has committed
        // that the user cannot verify by simply logging in; here there is no
        // account left to check. The helper's own 5 s cap remains the only
        // bound, so the request cannot hang on a dead relay either.
        await SendAccountDeletedEmailAsync(email, CancellationToken.None);
        return NoContent();
    }

    /// <summary>
    /// SMA-341: mails the deletion confirmation. Mirrors
    /// <see cref="SendConfirmationEmailAsync"/>: 5 s linked-CTS cap, failure logged
    /// with the masked address and swallowed. A delivery failure must NOT fail the
    /// deletion — the account is already gone and there is nothing to roll back to.
    /// </summary>
    private async Task SendAccountDeletedEmailAsync(string email, CancellationToken ct)
    {
        try
        {
            // Plain text only — IEmailService carries no HTML body and no templating,
            // and the backend has no localization, so the copy is English (SMA-31).
            var textBody =
                "Hello,\n\n" +
                "Your SmartCrops account has been deleted, along with your gardens, their layouts and your profile information. This cannot be undone.\n\n" +
                $"If you did not perform this action, please contact {smtpOptions.Value.ContactRecipient} immediately.\n\n" +
                "Thank you for having gardened with us.\n";

            using var sendCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            sendCts.CancelAfter(TimeSpan.FromSeconds(5));

            await emailService.SendAsync(
                email,
                "Your SmartCrops account has been deleted",
                textBody,
                ct: sendCts.Token);
        }
        catch (Exception ex)
        {
            // Deliberately catches everything, cancellation included: the deletion is
            // already committed, so there is nothing the caller could do with the error.
            logger.LogError(ex, "Account-deletion confirmation email delivery failed for '{Email}'", MaskEmail(email));
        }
    }

    /// <summary>
    /// SMA-341 (GDPR art. 20): machine-readable export of the caller's own data —
    /// profile, gardens with their full layout, placements with their notes, and
    /// the plant suggestions they authored (with their locale, R3). Served
    /// as a FILE download (this codebase's first): <c>File()</c> with a
    /// <c>fileDownloadName</c> emits <c>Content-Disposition: attachment</c>, so the
    /// browser saves a dated <c>.json</c> instead of rendering a wall of JSON — the
    /// point of portability is a file the user can carry away.
    /// </summary>
    [Authorize]
    [HttpGet("account/export")]
    [EnableRateLimiting("account")]
    public async Task<IActionResult> ExportAccountData(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();
        var user = await userManager.FindByIdAsync(userId);
        if (user == null) return NotFound();

        var gardens = await dbContext.Gardens
            .Where(g => g.UserId == userId)
            .Include(g => g.Placements)
            .OrderBy(g => g.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        // AUTHORED suggestions only (UserId == caller) — arts. 17/20 cover the
        // same data set, and the deletion path already treats these rows as the
        // person's (it anonymizes them). Suggestions the caller merely REVIEWED
        // as an admin are deliberately EXCLUDED: those are moderation records
        // about someone else's contribution, and exporting them would leak
        // another person's data into this user's file.
        var suggestions = await dbContext.PlantSuggestions
            .Where(s => s.UserId == userId)
            .OrderBy(s => s.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        // ONE timestamp for both the document and the filename (R2): two
        // DateTime.UtcNow reads can straddle UTC midnight and produce a file
        // named for one day whose exportedAt says the day before — a
        // self-contradicting compliance artifact a user may hold for years.
        var exportedAt = DateTime.UtcNow;

        var export = new AccountExportResponse(
            exportedAt,
            AccountExportResponse.CurrentSchemaVersion,
            new AccountExportProfile(
                user.Email ?? "",
                user.DisplayName,
                user.FirstName,
                user.LastName,
                user.City),
            gardens.Select(g => new AccountExportGarden(
                g.Id,
                g.Name,
                g.Description,
                g.CreatedAt,
                g.UpdatedAt,
                g.LayoutWidth,
                g.LayoutHeight,
                g.CellSize,
                g.CellsJson,
                g.Orientation,
                g.GardenType,
                g.LightScheduleJson,
                g.Hemisphere,
                g.LatitudeBand,
                g.Placements
                    .OrderBy(p => p.PlacedAt)
                    .Select(p => new AccountExportPlacement(
                        p.PlantId,
                        p.StartRow,
                        p.StartCol,
                        p.SpanRows,
                        p.SpanCols,
                        p.Notes,
                        p.PlacedAt))
                    .ToList()))
                .ToList(),
            suggestions.Select(s => new AccountExportSuggestion(
                s.PlantId,
                s.FieldName,
                s.Language,
                s.SuggestedValue,
                s.Reason,
                s.Status,
                s.CreatedAt))
                .ToList());

        var fileName = $"smartcrops-export-{exportedAt:yyyy-MM-dd}.json";
        // Defence in depth (R3): the document carries email, name, city,
        // layouts, notes and suggestions — tell the browser's disk cache and
        // any intermediary not to keep a copy.
        Response.Headers.CacheControl = "no-store";
        // Buffering ceiling, recorded on both review surfaces (R2): the whole
        // document is materialized and serialized to a byte array before a
        // single byte reaches the wire. Fine at today's shape (a handful of
        // gardens, low-hundreds of placements); it becomes a memory-pressure
        // concern if layouts grow substantially, since GDPR exports tend to
        // arrive in bursts. The future direction is streaming —
        // JsonSerializer.SerializeAsync against Response.Body with the
        // Content-Disposition header set manually — deliberately NOT done now.
        // The size is now measured on every export (SMA-41 gate 3) — size and
        // counts ONLY: the log surface stays identity-free by design until the
        // logging policy (SMA-348) is settled at deployment.
        var payload = JsonSerializer.SerializeToUtf8Bytes(export, ExportJson);
        logger.LogInformation(
            "Account export completed: {PayloadBytes} bytes, {GardenCount} gardens, {SuggestionCount} suggestions",
            payload.Length, export.Gardens.Count, export.Suggestions.Count);
        return File(payload, "application/json", fileName);
    }

    private string? GetCurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

    /// <summary>
    /// Public base URL of the SPA, used to build links the user clicks from an email
    /// or an OAuth redirect. Reads the bound <see cref="FrontendOptions"/> (SMA-324):
    /// Program.cs validates that contract at startup outside Development, and going
    /// through it keeps a single source of truth for the section name. Only the
    /// Development fallback and the trailing-slash trim stay local. Misconfiguration
    /// is fatal outside Development so a deployed instance can never mail a link
    /// pointing at localhost.
    /// </summary>
    private string ResolveFrontendBaseUrl()
    {
        var frontendUrl = frontendOptions.Value.BaseUrl;
        if (string.IsNullOrWhiteSpace(frontendUrl))
        {
            if (!hostEnvironment.IsDevelopment())
                throw new InvalidOperationException("Frontend:BaseUrl is not configured");
            frontendUrl = "http://localhost:3000";
        }

        // Every consumer concatenates "{base}/path", so a config value ending in "/"
        // would emit "//confirm-email"-style links (R3). Startup validation tolerates
        // the slash; it is normalized here, at the single consumption point.
        return frontendUrl.TrimEnd('/');
    }

    /// <summary>
    /// Masks an email for logging — keeps the first local-part character and the
    /// full domain (e.g. <c>a***@example.com</c>) so log lines stay correlatable
    /// without persisting the raw PII address. Falls back to <c>***</c> when the
    /// local part is too short to partially reveal, or when there is no <c>@</c>.
    /// Mirrors the helper in <c>AdminRoleSeeder</c>; the two live in different
    /// assemblies and Core exposes no logging utility to share today.
    /// </summary>
    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0)
        {
            return "***";
        }
        var local = at == 1 ? "***" : $"{email[0]}***";
        return $"{local}{email[at..]}";
    }

    private void SetAuthCookie(string token)
    {
        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = !env.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Path = "/",
            Expires = DateTimeOffset.UtcNow.AddDays(7),
        };
        Response.Cookies.Append("smartcrops_token", token, cookieOptions);
    }

    private static void CleanupExpiredCodes()
    {
        var expiredKeys = _authCodes
            .Where(kvp => kvp.Value.Expiry < DateTime.UtcNow)
            .Select(kvp => kvp.Key)
            .ToList();
        foreach (var key in expiredKeys)
            _authCodes.TryRemove(key, out _);
    }

    /// <summary>
    /// Builds the signed JWT (+ expiry) for a user. Emits <c>sub</c>/<c>email</c>/
    /// <c>jti</c>/<c>security_stamp</c> plus one <see cref="ClaimTypes.Role"/> claim
    /// per entry in <paramref name="roles"/> (SMA-33), so <c>[Authorize(Roles = ...)]</c>
    /// resolves server-side. Roles are baked in at issuance — see the body comment
    /// on the security-stamp revocation contract for promotion/demotion (SMA-34).
    /// </summary>
    /// <param name="userId">Identity user id, emitted as the <c>sub</c> claim.</param>
    /// <param name="email">User email, emitted as the <c>email</c> claim.</param>
    /// <param name="securityStamp">Current security stamp, re-checked per request in Program.cs.</param>
    /// <param name="roles">Role names to emit as role claims (empty for a non-privileged user).</param>
    private AuthResponse GenerateTokenResponse(string userId, string email, string? securityStamp, IEnumerable<string> roles)
    {
        var jwtKey = configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("JWT signing key is not configured");
        var jwtIssuer = configuration["Jwt:Issuer"]
            ?? throw new InvalidOperationException("JWT issuer is not configured");
        var jwtAudience = configuration["Jwt:Audience"]
            ?? throw new InvalidOperationException("JWT audience is not configured");

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId),
            new(JwtRegisteredClaimNames.Email, email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new("security_stamp", securityStamp ?? ""),
        };

        // SMA-33: emit ASP.NET role claims so [Authorize(Roles = "Admin")] resolves
        // the role server-side. ClaimTypes.Role matches the RoleClaimType made
        // explicit in Program.cs's TokenValidationParameters. Roles are baked into
        // the JWT at issuance — a later promotion/demotion endpoint (SMA-34) MUST
        // call UserManager.UpdateSecurityStampAsync so the per-request security-stamp
        // check (Program.cs OnTokenValidated) rejects the now-stale token on the next
        // call; otherwise a revoked admin keeps the role until the 7-day token expires.
        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiration = DateTime.UtcNow.AddDays(7);

        var token = new JwtSecurityToken(
            issuer: jwtIssuer,
            audience: jwtAudience,
            claims: claims,
            expires: expiration,
            signingCredentials: credentials);

        return new AuthResponse(
            new JwtSecurityTokenHandler().WriteToken(token),
            expiration);
    }
}
