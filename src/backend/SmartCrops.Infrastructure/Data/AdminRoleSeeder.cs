using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data;

/// <summary>
/// SMA-33 / #68 — boot-time seeding of the <see cref="Roles.Admin"/> role and its
/// membership. Replaces the front-only <c>VITE_ADMIN_EMAILS</c> whitelist with a
/// real backend role. Admin emails come from operator config
/// (<c>AdminSeed:Emails</c>, CSV) — never hard-coded.
///
/// <para>Idempotent and ADDITIVE ONLY: it creates the role if missing and grants
/// it to each configured, already-registered account that lacks it. It deliberately
/// NEVER revokes the role for an account whose email is absent from the list and
/// NEVER creates an account — a misconfigured/empty list must not silently strip
/// admin access; revocation stays an explicit operator action (a future SMA-34
/// endpoint).</para>
///
/// <para>Uniform ownership contract (SMA-390 R1, PR #206): the seeder GRANTS but
/// never CONFIRMS — <c>EmailConfirmed</c> is left exactly as found. The previous
/// SMA-80 auto-confirm was door (c) of the squatter family: an attacker who
/// registered a listed address became confirmed AND admin on the next boot, with
/// the SMA-320 R2 Google-merge neutralization bypassed. Now a squatter-created
/// account stays unconfirmed — inert on both gates (the /login 403 and the
/// OnTokenValidated lock) and still neutralizable by R2 — while the legitimate
/// owner activates the role through the mailed confirmation link, which they
/// can, because they own the mailbox.</para>
/// </summary>
public static class AdminRoleSeeder
{
    /// <summary>
    /// Ensures the <see cref="Roles.Admin"/> role exists and grants it to every
    /// configured, already-registered account that lacks it — regardless of
    /// confirmation state, and WITHOUT confirming (the role stays inert until
    /// the address is proven through the mailbox flow; see the class doc).
    /// Idempotent and additive-only (never revokes; never creates or confirms
    /// an account). Safe to run on every boot and across concurrent app
    /// instances: a lost role-creation race is treated as success (the role
    /// exists either way) so the grant pass still runs. Email addresses are
    /// masked before logging (PII minimisation).
    /// </summary>
    /// <param name="roleManager">Identity role manager used to create the role.</param>
    /// <param name="userManager">Identity user manager used to resolve and grant roles.</param>
    /// <param name="adminEmails">Operator-configured admin emails (already split from the CSV config).</param>
    /// <param name="logger">Sink for the (email-masked) audit/diagnostic messages.</param>
    public static async Task SeedAsync(
        RoleManager<IdentityRole> roleManager,
        UserManager<ApplicationUser> userManager,
        IEnumerable<string> adminEmails,
        ILogger logger)
    {
        // 1. Ensure the Admin role exists — shared primitive (SMA-389/390 R1),
        //    carrying the TOCTOU contract: a lost creation race is success and
        //    the grant pass below still runs.
        if (!await AdminRolePrimitives.EnsureRoleExistsAsync(roleManager, Roles.Admin, logger))
        {
            return;
        }

        // 2. For each configured email with a registered account: grant the role
        //    if it's missing — and NOTHING else. EmailConfirmed is left exactly
        //    as found (uniform ownership contract, see the class doc): a granted
        //    role on an unconfirmed account is inert until the mailbox proof
        //    lands. De-dup the input case-insensitively.
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var rawEmail in adminEmails)
        {
            var email = rawEmail?.Trim();
            if (string.IsNullOrEmpty(email) || !seen.Add(email))
            {
                continue;
            }

            var user = await userManager.FindByEmailAsync(email);
            if (user is null)
            {
                // Not a failure: the operator may list an email before its owner
                // registers; a later boot picks it up.
                logger.LogInformation(
                    "Admin seed: no account for '{Email}' yet — will assign on a later boot once it registers.",
                    MaskEmail(email));
                continue;
            }

            if (await userManager.IsInRoleAsync(user, Roles.Admin))
            {
                continue; // Already an admin — idempotent no-op.
            }

            var result = await userManager.AddToRoleAsync(user, Roles.Admin);
            if (result.Succeeded)
            {
                logger.LogInformation(
                    "Admin seed: granted role '{Role}' to user '{UserId}' ('{Email}').",
                    Roles.Admin, user.Id, MaskEmail(email));
            }
            else
            {
                logger.LogError(
                    "Admin seed: failed to grant role '{Role}' to user '{UserId}' ('{Email}'): {Errors}",
                    Roles.Admin, user.Id, MaskEmail(email), string.Join("; ", result.Errors.Select(e => e.Description)));
            }
        }
    }

    /// <summary>
    /// Masks an email for logging — keeps the first local-part character and the
    /// full domain (e.g. <c>a***@example.com</c>) so log lines stay correlatable
    /// without persisting the raw PII address. Falls back to <c>***</c> when the
    /// local part is too short to partially reveal, or when there is no <c>@</c>.
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
}
