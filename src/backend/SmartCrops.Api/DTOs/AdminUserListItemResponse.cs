namespace SmartCrops.Api.DTOs;

/// <summary>
/// SMA-414 — one row of <c>GET /api/admin/dashboard/users</c>. This record IS
/// the whitelist: exactly what the read-only dashboard needs and nothing else —
/// no password hash, no token, no security/concurrency stamp, no claims, no
/// phone number. Locked by <c>AdminDashboardControllerTests</c>, which asserts
/// the JSON keys against this list. <see cref="CreatedAt"/> is <c>null</c> for
/// accounts that predate migration 30 (D1). <see cref="HasPassword"/> is
/// "PasswordHash is not null"; <see cref="HasGoogleLogin"/> is "an
/// <c>AspNetUserLogins</c> row with the Google provider exists" (D2).
/// </summary>
public record AdminUserListItemResponse(
    string Id,
    string? Email,
    string? DisplayName,
    DateTime? CreatedAt,
    bool EmailConfirmed,
    bool HasPassword,
    bool HasGoogleLogin);
