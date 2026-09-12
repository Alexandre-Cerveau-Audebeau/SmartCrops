using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Weather;

namespace SmartCrops.Api.Controllers;

/// <summary>
/// SMA-336 PR 3a/5 — <c>GET /api/dashboard/weather</c>: the weather of every
/// place the caller's gardens sit in, in one call. Its own controller rather
/// than a member of <c>DashboardController</c> (decision T7): the gardens
/// aggregate is two SQL reads answered in milliseconds, this one is a network
/// call per place answered in seconds, and a provider outage must never delay
/// or empty the gardens, counters and statistics widgets.
///
/// <para>The reads come FIRST and the provider calls AFTER, in parallel: the
/// gardens and the account's default location are projected on the scoped
/// <c>DbContext</c> — which tolerates no concurrent operation — and only once
/// they are in memory does each distinct place go to the cache, all at once
/// on <c>Task.WhenAll</c>. The cache owns its own client scope, so nothing
/// here shares an <see cref="HttpClient"/> either.</para>
///
/// <para>Never a 5xx of the provider's making: every place answers with a
/// status, and the response is 200 for any authenticated caller — no gardens,
/// no location, a refused refresh, a dead provider included.</para>
/// </summary>
[ApiController]
[Route("api/dashboard/weather")]
[Authorize]
public class DashboardWeatherController(
    SmartCropsDbContext context,
    WeatherForecastCache cache,
    ILogger<DashboardWeatherController> logger) : ControllerBase
{
    /// <summary>
    /// The weather of every distinct place, and which garden reads which.
    /// </summary>
    /// <param name="lang">Language of the condition texts; English by default, as on the gardens list.</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpGet]
    public async Task<ActionResult<DashboardWeatherResponse>> GetWeather(
        [FromQuery] string lang = "en",
        CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var language = LanguageCodes.Normalize(lang);

        // Read 1: the gardens, six location columns each, newest first — the
        // order the dashboard lists them in, and therefore the order of the
        // location tabs.
        var gardens = await context.Gardens
            .AsNoTracking()
            .Where(g => g.UserId == userId)
            .OrderByDescending(g => g.CreatedAt)
            .ThenBy(g => g.Id)
            .Select(g => new
            {
                g.Id,
                g.LocationName,
                g.LocationRegion,
                g.LocationCountry,
                g.Latitude,
                g.Longitude,
                g.LocationResolvedAt,
            })
            .ToListAsync(ct);

        // Read 2: the account's default, six columns — never the Identity row.
        var profileRow = await context.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new
            {
                u.LocationName,
                u.LocationRegion,
                u.LocationCountry,
                u.Latitude,
                u.Longitude,
                u.LocationResolvedAt,
            })
            .SingleOrDefaultAsync(ct);

        var profileLocation = profileRow is null
            ? null
            : GeoLocation.Create(
                profileRow.LocationName, profileRow.LocationRegion, profileRow.LocationCountry,
                profileRow.Latitude, profileRow.Longitude, profileRow.LocationResolvedAt);

        // The effective location of each garden (ADR-0006), and the distinct
        // places in first-seen order. The FIRST garden of a place lends it
        // its exact coordinates and its stored name.
        var links = new List<WeatherGardenLinkDto>(gardens.Count);
        var places = new List<(string Key, GeoLocation Location)>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (var garden in gardens)
        {
            var own = GeoLocation.Create(
                garden.LocationName, garden.LocationRegion, garden.LocationCountry,
                garden.Latitude, garden.Longitude, garden.LocationResolvedAt);
            var effective = own ?? profileLocation;

            if (effective is null)
            {
                links.Add(new WeatherGardenLinkDto(garden.Id, null, null));
                continue;
            }

            var key = WeatherLocationKey.From(effective.Latitude, effective.Longitude);
            links.Add(new WeatherGardenLinkDto(
                garden.Id,
                key,
                own is not null ? LocationSources.Garden : LocationSources.Profile));

            if (seen.Add(key))
            {
                places.Add((key, effective));
            }
        }

        // The provider calls, all at once: the reads above are done, and the
        // cache runs each call in a scope of its own.
        var outcomes = await Task.WhenAll(
            places.Select(p => cache.GetAsync(p.Location.Latitude, p.Location.Longitude, language, ct)));

        var nowUtc = DateTime.UtcNow;
        var locations = new List<WeatherLocationDto>(places.Count);
        for (var i = 0; i < places.Count; i++)
        {
            var (key, location) = places[i];
            locations.Add(WeatherDtoMapper.Map(key, location, outcomes[i], nowUtc));
        }

        var degraded = locations.Count(l => l.Status != WeatherStatuses.Fresh);
        if (degraded > 0)
        {
            logger.LogInformation(
                "Dashboard weather: {Degraded} of {Total} place(s) answered stale or unavailable",
                degraded, locations.Count);
        }

        return Ok(new DashboardWeatherResponse(locations, links, profileLocation is not null));
    }

    private string? GetCurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);
}
