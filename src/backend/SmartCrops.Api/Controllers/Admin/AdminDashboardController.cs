using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Authorization;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Controllers.Admin;

/// <summary>
/// SMA-414 — Admin Dashboard v1, READ-ONLY. Two GETs: the site counters and a
/// paged user listing. Deliberately no mutation, no search, no filter, no
/// configurable sort. The listing projects a strict whitelist (see
/// <see cref="AdminUserListItemResponse"/>) straight from the query — the
/// entity never reaches the serializer. Nothing here is logged: the list must
/// never land in a log line, and no e-mail address transits through logging.
/// Authorization is the class-level Admin role gate; the frontend's
/// <c>isAdmin</c> flag is UX only.
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Admin)]
[Route("api/admin/dashboard")]
public class AdminDashboardController(SmartCropsDbContext context) : ControllerBase
{
    /// <summary>D5 — rows per page unless the client asks otherwise.</summary>
    public const int DefaultPageSize = 25;

    /// <summary>D5 — hard ceiling; a larger <c>pageSize</c> answers 400.</summary>
    public const int MaxPageSize = 100;

    /// <summary>
    /// Site counters. The 7/30-day windows are evaluated against
    /// <c>DateTime.UtcNow</c> at request time and ignore accounts whose
    /// <c>CreatedAt</c> is null (pre-migration-30 accounts, D1).
    /// </summary>
    [HttpGet("stats")]
    public async Task<ActionResult<AdminDashboardStatsResponse>> Stats(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var since7Days = now.AddDays(-7);
        var since30Days = now.AddDays(-30);

        var users = context.Users.AsNoTracking();
        var gardens = context.Gardens.AsNoTracking();

        var totalUsers = await users.CountAsync(ct);
        var newUsersLast7Days = await users.CountAsync(u => u.CreatedAt != null && u.CreatedAt >= since7Days, ct);
        var newUsersLast30Days = await users.CountAsync(u => u.CreatedAt != null && u.CreatedAt >= since30Days, ct);
        var gardensCount = await gardens.CountAsync(ct);
        var latestGardenCreatedAt = await gardens.MaxAsync(g => (DateTime?)g.CreatedAt, ct);
        var placementsCount = await context.GardenPlacements.AsNoTracking().CountAsync(ct);
        var usersWithAtLeastOneGarden = await gardens.Select(g => g.UserId).Distinct().CountAsync(ct);
        // Round 1 (V1): the earliest recorded stamp — the "registered before"
        // pivot for the accounts that predate it; null until one is stamped.
        var createdAtTrackedSince = await users
            .Where(u => u.CreatedAt != null)
            .MinAsync(u => u.CreatedAt, ct);

        return Ok(new AdminDashboardStatsResponse(
            totalUsers,
            newUsersLast7Days,
            newUsersLast30Days,
            gardensCount,
            latestGardenCreatedAt,
            placementsCount,
            usersWithAtLeastOneGarden,
            createdAtTrackedSince));
    }

    /// <summary>
    /// Paged user listing, newest first. Sort: <c>CreatedAt</c> descending with
    /// nulls LAST (Postgres would put them first on a bare DESC), then
    /// <c>Id</c> for a stable order. Bounds: <c>page</c> ≥ 1 and
    /// 1 ≤ <c>pageSize</c> ≤ <see cref="MaxPageSize"/>, else 400. A page past
    /// the end answers 200 with an empty <c>items</c> list and the true
    /// <c>total</c>.
    /// </summary>
    [HttpGet("users")]
    public async Task<ActionResult<PagedResponse<AdminUserListItemResponse>>> Users(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize,
        CancellationToken ct = default)
    {
        if (page < 1)
        {
            return BadRequest("Page must be >= 1.");
        }
        if (pageSize < 1 || pageSize > MaxPageSize)
        {
            return BadRequest($"PageSize must be between 1 and {MaxPageSize}.");
        }

        var users = context.Users.AsNoTracking();
        var total = await users.CountAsync(ct);

        // Round 1 (F1): a page past the end answers 200 with an empty page and
        // the true total — and the offset is only computed once `page` is
        // known to be in range, so a valid page such as int.MaxValue can no
        // longer overflow the multiplication into a negative OFFSET (500).
        var lastPage = total == 0 ? 0 : ((total - 1) / pageSize) + 1;
        if (page > lastPage)
        {
            return Ok(new PagedResponse<AdminUserListItemResponse>(
                Array.Empty<AdminUserListItemResponse>(), page, pageSize, total));
        }

        var items = await users
            .OrderByDescending(u => u.CreatedAt != null)
            .ThenByDescending(u => u.CreatedAt)
            .ThenBy(u => u.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new AdminUserListItemResponse(
                u.Id,
                u.Email,
                u.DisplayName,
                u.CreatedAt,
                u.EmailConfirmed,
                u.PasswordHash != null,
                context.UserLogins.Any(l =>
                    l.UserId == u.Id && l.LoginProvider == GoogleDefaults.AuthenticationScheme)))
            .ToListAsync(ct);

        return Ok(new PagedResponse<AdminUserListItemResponse>(items, page, pageSize, total));
    }
}
