namespace SmartCrops.Core.Authorization;

/// <summary>
/// Canonical ASP.NET Identity role names. Centralised so the seeder, the
/// <c>[Authorize(Roles = ...)]</c> controller attributes, the <c>/me</c>
/// projection, and the integration tests all reference one constant rather than
/// scattering the magic string. Must be <c>const</c> so it is usable inside
/// attribute arguments.
/// </summary>
public static class Roles
{
    /// <summary>
    /// Privileged role gating the catalogue-mutation and ETL/admin endpoints
    /// (SMA-33 / #68). Assigned at boot by the admin-role seeder from the
    /// operator-supplied <c>AdminSeed:Emails</c> config; never auto-revoked.
    /// </summary>
    public const string Admin = "Admin";
}
