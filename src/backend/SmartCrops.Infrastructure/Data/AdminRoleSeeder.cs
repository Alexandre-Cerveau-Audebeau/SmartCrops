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
/// it to each configured, already-registered, email-confirmed account that lacks
/// it. It deliberately NEVER revokes the role for an account whose email is absent
/// from the list — a misconfigured/empty list must not silently strip admin access;
/// revocation stays an explicit operator action (a future SMA-34 endpoint).</para>
/// </summary>
public static class AdminRoleSeeder
{
    /// <summary>
    /// Ensures the <see cref="Roles.Admin"/> role exists and grants it to every
    /// configured, already-registered, email-confirmed account that lacks it.
    /// Idempotent and additive-only (never revokes). Safe to run on every boot and
    /// across concurrent app instances: a lost role-creation race is treated as
    /// success (the role exists either way) so the grant pass still runs. Email
    /// addresses are masked before logging (PII minimisation).
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
        // 1. Ensure the Admin role exists (idempotent — RoleExistsAsync guard).
        if (!await roleManager.RoleExistsAsync(Roles.Admin))
        {
            var created = await roleManager.CreateAsync(new IdentityRole(Roles.Admin));
            if (!created.Succeeded)
            {
                // TOCTOU: a concurrent instance may have created the role between
                // our RoleExistsAsync check and CreateAsync. Re-check — if the role
                // now exists, the race was benign and we MUST still run the grant
                // pass (returning here would skip every assignment for this boot).
                if (await roleManager.RoleExistsAsync(Roles.Admin))
                {
                    logger.LogInformation(
                        "Admin seed: role '{Role}' was created concurrently by another instance — continuing with grants.",
                        Roles.Admin);
                }
                else
                {
                    logger.LogError(
                        "Admin seed: failed to create role '{Role}': {Errors}",
                        Roles.Admin, string.Join("; ", created.Errors.Select(e => e.Description)));
                    return;
                }
            }
            else
            {
                logger.LogInformation("Admin seed: created Identity role '{Role}'.", Roles.Admin);
            }
        }

        // 2. Grant the role to each configured email that ALREADY has a confirmed
        //    account and doesn't have it yet. De-dup the input case-insensitively.
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

            // Guard on email confirmation so a typo'd / unverified address can't be
            // granted admin. NOTE: password registration leaves EmailConfirmed=false
            // today (only Google OAuth sets it true), so a password-registered admin
            // is skipped here until confirmation exists — surfaced as a warning.
            if (!user.EmailConfirmed)
            {
                logger.LogWarning(
                    "Admin seed: account '{Email}' exists but is not email-confirmed — skipping (no role granted).",
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
                logger.LogInformation("Admin seed: granted role '{Role}' to '{Email}'.", Roles.Admin, MaskEmail(email));
            }
            else
            {
                logger.LogError(
                    "Admin seed: failed to grant role '{Role}' to '{Email}': {Errors}",
                    Roles.Admin, MaskEmail(email), string.Join("; ", result.Errors.Select(e => e.Description)));
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
