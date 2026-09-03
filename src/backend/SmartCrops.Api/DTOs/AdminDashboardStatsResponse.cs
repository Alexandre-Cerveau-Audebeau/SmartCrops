namespace SmartCrops.Api.DTOs;

/// <summary>
/// SMA-414 — read-only counters for <c>GET /api/admin/dashboard/stats</c>.
/// The 7/30-day windows count only accounts carrying a <c>CreatedAt</c>
/// (D1: accounts that predate migration 30 are <c>null</c> and deliberately
/// excluded). <see cref="UsersWithAtLeastOneGarden"/> is the number of DISTINCT
/// <c>Gardens.UserId</c>; <see cref="PlacementsCount"/> counts
/// <c>GardenPlacements</c> rows. All instants are UTC (ADR-0001).
/// </summary>
public record AdminDashboardStatsResponse(
    int TotalUsers,
    int NewUsersLast7Days,
    int NewUsersLast30Days,
    int GardensCount,
    DateTime? LatestGardenCreatedAt,
    int PlacementsCount,
    int UsersWithAtLeastOneGarden);
