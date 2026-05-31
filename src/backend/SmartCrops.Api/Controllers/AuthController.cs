using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;

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

[ApiController]
[Route("api/[controller]")]
public class AuthController(
    UserManager<ApplicationUser> userManager,
    SignInManager<ApplicationUser> signInManager,
    IConfiguration configuration,
    IAuthenticationSchemeProvider schemeProvider,
    IHostEnvironment hostEnvironment,
    IWebHostEnvironment env) : ControllerBase
{
    private static readonly PasswordHasher<ApplicationUser> _dummyHasher = new();
    private static readonly string _dummyHash = _dummyHasher.HashPassword(new ApplicationUser(), "DummyPassword123!");
    private static readonly ConcurrentDictionary<string, (string Token, DateTime Expiry, string Binding)> _authCodes = new();

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        var user = new ApplicationUser { UserName = request.Email, Email = request.Email };
        var result = await userManager.CreateAsync(user, request.Password);

        if (!result.Succeeded)
            return BadRequest(result.Errors);

        var tokenResponse = GenerateTokenResponse(user.Id, request.Email, user.SecurityStamp, await userManager.GetRolesAsync(user));
        SetAuthCookie(tokenResponse.Token);
        return StatusCode(201);
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

        var frontendUrl = configuration["Frontend:BaseUrl"];
        if (string.IsNullOrWhiteSpace(frontendUrl))
        {
            if (!hostEnvironment.IsDevelopment())
                throw new InvalidOperationException("Frontend:BaseUrl is not configured");
            frontendUrl = "http://localhost:3000";
        }

        try
        {
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

            return Redirect($"{frontendUrl}/auth/callback?code={code}");
        }
        finally
        {
            await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
        }
    }

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

    private string? GetCurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

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
