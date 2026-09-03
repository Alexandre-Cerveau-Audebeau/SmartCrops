namespace SmartCrops.Api.DTOs;

/// <summary>
/// SMA-414 — read-only counters for <c>GET /api/admin/dashboard/stats</c>.
/// The 7/30-day windows count only accounts carrying a <c>CreatedAt</c>
/// (D1: accounts that predate migration 30 are <c>null</c> and deliberately
/// excluded). <see cref="UsersWithAtLeastOneGarden"/> is the number of DISTINCT
/// <c>Gardens.UserId</c>; <see cref="PlacementsCount"/> counts
/// <c>GardenPlacements</c> rows. <see cref="CreatedAtTrackedSince"/> (round 1,
/// V1) is the earliest recorded <c>CreatedAt</c> across all accounts — the
/// pivot the dashboard labels un-stamped accounts against ("registered
/// before …") — or <c>null</c> while no account carries a stamp. All instants
/// are UTC (ADR-0001).
/// </summary>
public record AdminDashboardStatsResponse(
    int TotalUsers,
    int NewUsersLast7Days,
    int NewUsersLast30Days,
    int GardensCount,
    DateTime? LatestGardenCreatedAt,
    int PlacementsCount,
    int UsersWithAtLeastOneGarden,
    DateTime? CreatedAtTrackedSince);
