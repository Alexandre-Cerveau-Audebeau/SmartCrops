using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;

namespace SmartCrops.Core.Authorization;

/// <summary>
/// SMA-389/390 R1 — the two admin-grant invariants that were implemented twice
/// (boot seeder and creation-time hook), single-sourced after both review
/// surfaces converged on the drift risk. Lives in Core beside
/// <see cref="Roles"/>: Core already references
/// Microsoft.Extensions.Identity.Stores for <c>ApplicationUser</c>, so
/// <see cref="RoleManager{TRole}"/> and <see cref="ILogger"/> come free.
/// <see cref="ParseEmails"/>/<see cref="IsListedEmail"/> are pure — the raw
/// CSV comes in as a string and IConfiguration stays at the callers.
/// </summary>
public static class AdminRolePrimitives
{
    /// <summary>
    /// Ensures <paramref name="role"/> exists, with the TOCTOU contract both
    /// callers relied on: created here OR created concurrently by another
    /// instance = success (the caller MUST still run its grant pass); only a
    /// real store failure returns <c>false</c>, logged.
    /// </summary>
    public static async Task<bool> EnsureRoleExistsAsync(
        RoleManager<IdentityRole> roleManager,
        string role,
        ILogger logger)
    {
        if (await roleManager.RoleExistsAsync(role))
            return true;

        var created = await roleManager.CreateAsync(new IdentityRole(role));
        if (created.Succeeded)
        {
            logger.LogInformation("Admin role ensure: created Identity role '{Role}'.", role);
            return true;
        }

        // A concurrent instance may have created the role between our
        // RoleExistsAsync check and CreateAsync. Re-check — if it now exists,
        // the race was benign and the caller's grant pass must still run
        // (returning false here would skip every assignment for this boot).
        if (await roleManager.RoleExistsAsync(role))
        {
            logger.LogInformation(
                "Admin role ensure: role '{Role}' was created concurrently by another instance — continuing.",
                role);
            return true;
        }

        logger.LogError(
            "Admin role ensure: failed to create role '{Role}': {Errors}",
            role, string.Join("; ", created.Errors.Select(e => e.Description)));
        return false;
    }

    /// <summary>
    /// <c>AdminSeed:Emails</c> CSV → trimmed, blank-stripped entries. Empty or
    /// absent input yields no emails.
    /// </summary>
    public static IEnumerable<string> ParseEmails(string? csv) =>
        string.IsNullOrWhiteSpace(csv)
            ? Array.Empty<string>()
            : csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    /// <summary>
    /// Case-insensitive membership in the parsed list — the single definition
    /// of "listed" shared by the creation-time hook and the boot seeder.
    /// </summary>
    public static bool IsListedEmail(string? csv, string email) =>
        ParseEmails(csv).Contains(email, StringComparer.OrdinalIgnoreCase);
}
