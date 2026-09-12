using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Geo;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Controllers;

public record CreateGardenRequest(
    [Required, MaxLength(100)] string Name,
    [MaxLength(500)] string? Description
);

public record UpdateGardenRequest(
    [Required, MaxLength(100)] string Name,
    [MaxLength(500)] string? Description,
    // OPTIONAL (SMA-17): config lives on the GARDEN resource — the config
    // dialog persists here, not through the layout PUT. null -> the stored
    // config is PRESERVED untouched (a plain rename never sends it); present
    // -> strictly validated (the same ValidateConfig contract as the layout
    // PUT), then the five fields are overwritten as a block. A nested nullable
    // block is required to tell "omitted" from "explicitly cleared" — flat
    // nullable fields cannot, and would fail to clear lightSchedule when
    // gardenType moves away from 'indoor'.
    GardenConfigDto? Config = null
);

/// <summary>
/// GET /api/gardens/{id} contract (SMA-285): a clean DTO — the raw entity
/// serialization (and its legacy GardenPlants graph) is retired.
///
/// <para><see cref="Location"/> is the EFFECTIVE location (SMA-336 PR 3a/5):
/// the garden's own override when it has one, else the account's default,
/// else null — and <see cref="LocationSource"/> says which (« garden »,
/// « profile », null), so a settings dialog can offer « revert to the profile
/// city » only where it means something.</para>
/// </summary>
public record GardenResponse(
    Guid Id,
    string Name,
    string? Description,
    int? LayoutWidth,
    int? LayoutHeight,
    string? CellSize,
    string? Orientation,
    string? GardenType,
    List<LightSlotDto>? LightSchedule,
    string? Hemisphere,
    string? LatitudeBand,
    GardenLocationDto? Location,
    string? LocationSource);

public record GardenLayoutResponse(
    int? Width,
    int? Height,
    string? CellSize,
    string? CellsJson,
    GardenConfigDto Config,
    List<PlacementResponse> Placements);

public record SaveLayoutRequest(
    [Range(1, 100)] int Width,
    [Range(1, 100)] int Height,
    [Required, StringLength(10)] string CellSize,
    string? CellsJson,
    List<SavePlacementRequest> Placements,
    // OPTIONAL (SMA-285): null -> the garden's stored config is PRESERVED
    // untouched (the pre-5.3-B save dialog keeps working without sending it);
    // present -> strictly validated, then persisted.
    GardenConfigDto? Config = null);

public record SavePlacementRequest(
    Guid PlantId,
    [Range(0, 99)] int StartRow,
    [Range(0, 99)] int StartCol,
    [Range(1, 20)] int SpanRows,
    [Range(1, 20)] int SpanCols,
    [MaxLength(500)] string? Notes);

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GardensController(
    SmartCropsDbContext context,
    ILogger<GardensController> logger) : ControllerBase
{
    /// <summary>
    /// Garden cards list (SMA-6 / SMA-155): each garden ships its DISTINCT placed
    /// plants (from Placements — the sole plant-membership truth post SMA-6
    /// Option A) as the same <see cref="PlantListItemResponse"/> items the Library
    /// endpoints serve, localized per <paramref name="lang"/>. The deprecated
    /// GardenPlants link table is deliberately not read here.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetGardens([FromQuery] string lang = "en")
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var language = LanguageCodes.Normalize(lang);

        var gardens = await context
            .Gardens.Where(g => g.UserId == userId)
            .Include(g => g.Placements)
            .ThenInclude(p => p.Plant)
            .ThenInclude(p => p.Translations.Where(t =>
                t.Language == language || t.Language == "en"))
            .Include(g => g.Placements)
            .ThenInclude(p => p.Plant)
            .ThenInclude(p => p.PlantType)
            .Include(g => g.Placements)
            .ThenInclude(p => p.Plant)
            .ThenInclude(p => p.Images.Where(i =>
                PlantListItemMapper.StableImageSources.Contains(i.Source)))
            .OrderByDescending(g => g.CreatedAt)
            .AsSplitQuery()
            .AsNoTracking()
            .ToListAsync();

        var items = gardens.Select(g => new GardenListItemResponse(
            g.Id,
            g.Name,
            g.Description,
            g.CreatedAt,
            g.UpdatedAt,
            g.Placements
                .OrderBy(p => p.PlacedAt)
                .DistinctBy(p => p.PlantId)
                .Select(p => PlantListItemMapper.ToListItem(p.Plant, language))
                .ToList()));

        return Ok(items);
    }

    /// <summary>
    /// SMA-285: returns the <see cref="GardenResponse"/> DTO — the legacy
    /// GardenPlants includes are gone with the table, and the raw entity is no
    /// longer serialized (contract cleanup in passing).
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetGarden(Guid id)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var garden = await context
            .Gardens.Where(g => g.Id == id && g.UserId == userId)
            .AsNoTracking()
            .FirstOrDefaultAsync();

        if (garden == null)
            return NotFound();

        return Ok(ToGardenResponse(garden, await LoadProfileLocationAsync(userId)));
    }

    [HttpPost]
    public async Task<IActionResult> CreateGarden(CreateGardenRequest request)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var garden = new Garden
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Description = request.Description,
            UserId = userId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        context.Gardens.Add(garden);
        await context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetGarden),
            new { id = garden.Id },
            ToGardenResponse(garden, await LoadProfileLocationAsync(userId)));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateGarden(Guid id, UpdateGardenRequest request)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var garden = await context.Gardens.FirstOrDefaultAsync(g =>
            g.Id == id && g.UserId == userId
        );

        if (garden == null)
            return NotFound();

        garden.Name = request.Name;
        garden.Description = request.Description;

        // Config == null -> the stored config is PRESERVED (a plain rename never
        // sends it). Config present -> strict validation, then a full overwrite
        // of the five fields — identical semantics to the layout PUT (SMA-17).
        if (request.Config is { } config)
        {
            var configError = ValidateConfig(config);
            if (configError != null) return BadRequest(configError);

            garden.Orientation = config.Orientation;
            garden.GardenType = config.GardenType;
            garden.LightScheduleJson = config.LightSchedule is { Count: > 0 }
                ? JsonSerializer.Serialize(config.LightSchedule, JsonWeb)
                : null;
            garden.Hemisphere = config.Hemisphere;
            garden.LatitudeBand = config.LatitudeBand;
        }

        garden.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync();

        return Ok(ToGardenResponse(garden, await LoadProfileLocationAsync(userId)));
    }

    // ── Location (SMA-336 PR 3a/5) ──────────────────────────────────────────
    // A garden's OWN place — an override of the account's default (ADR-0006).
    // Its own resource rather than a member of the config block: a location
    // comes from a geocoding step, is set or cleared as a whole, and « omitted »
    // must never be confused with « cleared », which a flat nullable member of
    // the config PUT could not tell apart. Ownership is checked as everywhere
    // in this controller: another user's garden answers 404, never 403.

    /// <summary>
    /// Sets the garden's own location, every column at once, and stamps the
    /// resolution instant (UTC). Where the garden carries NO hemisphere or NO
    /// latitude band yet, the latitude pre-fills them (<see cref="LatitudeBands"/>);
    /// a value the user set by hand is never overwritten.
    ///
    /// <para><c>UpdatedAt</c> moves with this write, by the shared interceptor:
    /// a garden that just learnt where it is reads as « modified just now » on
    /// the dashboard. Assumed rather than avoided — the location IS a change
    /// to the garden.</para>
    /// </summary>
    [HttpPut("{id:guid}/location")]
    public async Task<IActionResult> PutLocation(
        Guid id,
        [FromBody] SaveLocationRequest request,
        CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var garden = await context.Gardens.FirstOrDefaultAsync(
            g => g.Id == id && g.UserId == userId, ct);
        if (garden == null) return NotFound();

        request.ToGeoLocation(DateTime.UtcNow).ApplyTo(garden);

        if (garden.Hemisphere is null || garden.LatitudeBand is null)
        {
            var (hemisphere, band) = LatitudeBands.Derive(request.Latitude);
            garden.Hemisphere ??= hemisphere;
            garden.LatitudeBand ??= band;
        }

        garden.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);

        return NoContent();
    }

    /// <summary>
    /// Clears the garden's own location: it then inherits the account's
    /// default again. The hemisphere and band a previous location may have
    /// pre-filled are KEPT — they are the garden's exposure config now, and
    /// nothing can tell a pre-filled value from one the user confirmed.
    /// </summary>
    [HttpDelete("{id:guid}/location")]
    public async Task<IActionResult> DeleteLocation(Guid id, CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var garden = await context.Gardens.FirstOrDefaultAsync(
            g => g.Id == id && g.UserId == userId, ct);
        if (garden == null) return NotFound();

        GeoLocation.Clear(garden);
        garden.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteGarden(Guid id)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var garden = await context.Gardens.FirstOrDefaultAsync(g =>
            g.Id == id && g.UserId == userId
        );

        if (garden == null)
            return NotFound();

        context.Gardens.Remove(garden);
        await context.SaveChangesAsync();

        return NoContent();
    }

    // The {id}/plants/{plantId} route is fully GONE (SMA-285, Option A
    // end-state): POST left with SMA-6, and the PATCH-notes / DELETE pair was
    // retired together with the GardenPlants table — notes live on placements,
    // membership IS placement. With no verb binding the template anymore,
    // every method now yields 404 (the SMA-6-era 405 pin flipped with it).

    [HttpGet("{id:guid}/layout")]
    public async Task<IActionResult> GetLayout(Guid id)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        // Translations are no longer loaded here: the EN-hardcoded PlantName
        // this fed was dead on the wire (the front rebuilds names from its
        // locale-keyed catalog via the shared resolver — SMA-285).
        var garden = await context.Gardens
            .Include(g => g.Placements)
                .ThenInclude(p => p.Plant)
            .AsNoTracking()
            .FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);

        if (garden == null) return NotFound();

        var placements = garden.Placements.Select(p => new PlacementResponse(
            p.Id,
            p.PlantId,
            p.Plant.ScientificName,
            p.StartRow,
            p.StartCol,
            p.SpanRows,
            p.SpanCols,
            p.Notes)).ToList();

        return Ok(new GardenLayoutResponse(
            garden.LayoutWidth,
            garden.LayoutHeight,
            garden.CellSize,
            garden.CellsJson,
            ToConfigDto(garden),
            placements));
    }

    [HttpPut("{id:guid}/layout")]
    public async Task<IActionResult> SaveLayout(Guid id, [FromBody] SaveLayoutRequest request)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var garden = await context.Gardens
            .Include(g => g.Placements)
            .FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);

        if (garden == null) return NotFound();

        // Config == null -> the stored config is PRESERVED untouched (the
        // pre-5.3-B save dialog never sends it). Config present -> strict
        // validation, then full overwrite of the five fields.
        if (request.Config is { } config)
        {
            var configError = ValidateConfig(config);
            if (configError != null) return BadRequest(configError);

            garden.Orientation = config.Orientation;
            garden.GardenType = config.GardenType;
            garden.LightScheduleJson = config.LightSchedule is { Count: > 0 }
                ? JsonSerializer.Serialize(config.LightSchedule, JsonWeb)
                : null;
            garden.Hemisphere = config.Hemisphere;
            garden.LatitudeBand = config.LatitudeBand;
        }

        garden.LayoutWidth = request.Width;
        garden.LayoutHeight = request.Height;
        garden.CellSize = request.CellSize;
        garden.CellsJson = request.CellsJson;
        garden.UpdatedAt = DateTime.UtcNow;

        context.GardenPlacements.RemoveRange(garden.Placements);

        var plantIds = request.Placements.Select(p => p.PlantId).Distinct().ToList();
        var existingPlantIds = await context.Plants
            .Where(p => plantIds.Contains(p.Id))
            .Select(p => p.Id)
            .ToListAsync();

        var missingIds = plantIds.Except(existingPlantIds).ToList();
        if (missingIds.Count > 0)
            return BadRequest($"Invalid PlantIds: {string.Join(", ", missingIds)}");

        foreach (var p in request.Placements)
        {
            context.GardenPlacements.Add(new GardenPlacement
            {
                GardenId = id,
                PlantId = p.PlantId,
                StartRow = p.StartRow,
                StartCol = p.StartCol,
                SpanRows = p.SpanRows,
                SpanCols = p.SpanCols,
                Notes = p.Notes,
                PlacedAt = DateTime.UtcNow,
            });
        }

        await context.SaveChangesAsync();
        return NoContent();
    }

    private string? GetCurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

    // ── SMA-285 config plumbing ──────────────────────────────────────────────

    private static readonly JsonSerializerOptions JsonWeb = new(JsonSerializerDefaults.Web);

    private static readonly string[] AllowedOrientations = ["N", "E", "S", "W"];
    private static readonly string[] AllowedGardenTypes =
        ["balcony", "terrace", "inground", "greenhouse", "indoor"];
    private static readonly string[] AllowedHemispheres = ["N", "S"];
    private static readonly string[] AllowedLatitudeBands = ["low", "mid", "high"];

    private static string? ValidateConfig(GardenConfigDto config)
    {
        if (config.Orientation != null && !AllowedOrientations.Contains(config.Orientation))
            return "orientation must be one of N, E, S, W (canonical EN letters).";
        if (config.GardenType != null && !AllowedGardenTypes.Contains(config.GardenType))
            return "gardenType must be one of balcony, terrace, inground, greenhouse, indoor.";
        if (config.Hemisphere != null && !AllowedHemispheres.Contains(config.Hemisphere))
            return "hemisphere must be N or S.";
        if (config.LatitudeBand != null && !AllowedLatitudeBands.Contains(config.LatitudeBand))
            return "latitudeBand must be one of low, mid, high.";

        if (config.LightSchedule is { Count: > 0 } slots)
        {
            if (config.GardenType != "indoor")
                return "lightSchedule is only allowed when gardenType is 'indoor'.";
            if (LightScheduleDocument.ValidateSlots(slots) is { } reason)
                return reason;
        }

        return null;
    }

    /// <summary>
    /// The stored light schedule, and a WARNING when it read as none (round 7,
    /// S06 — Extension #7-6): the same signal <c>DashboardController</c> gives,
    /// for the same reason — a row that needs repair must not look like a
    /// garden with no schedule, on any of the three endpoints that read it.
    /// </summary>
    private List<LightSlotDto>? ReadLightSchedule(Garden garden)
    {
        var slots = LightScheduleDocument.Parse(garden.LightScheduleJson, out var reason);
        if (reason is not null)
            logger.LogWarning(
                "Garden {GardenId}: stored light schedule read as none — {Reason}",
                garden.Id, reason);
        return slots;
    }

    private GardenConfigDto ToConfigDto(Garden garden) => new(
        garden.Orientation,
        garden.GardenType,
        ReadLightSchedule(garden),
        garden.Hemisphere,
        garden.LatitudeBand);

    /// <summary>
    /// The account's default location, read by projection (six columns, never
    /// the Identity row) — the fallback of every garden without an override.
    /// </summary>
    private async Task<GeoLocation?> LoadProfileLocationAsync(string userId)
    {
        var row = await context.Users
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
            .SingleOrDefaultAsync();

        return row is null
            ? null
            : GeoLocation.Create(
                row.LocationName, row.LocationRegion, row.LocationCountry,
                row.Latitude, row.Longitude, row.LocationResolvedAt);
    }

    private GardenResponse ToGardenResponse(Garden garden, GeoLocation? profileLocation)
    {
        var (location, source) = GardenLocationDto.Resolve(GeoLocation.From(garden), profileLocation);
        return new GardenResponse(
            garden.Id,
            garden.Name,
            garden.Description,
            garden.LayoutWidth,
            garden.LayoutHeight,
            garden.CellSize,
            garden.Orientation,
            garden.GardenType,
            ReadLightSchedule(garden),
            garden.Hemisphere,
            garden.LatitudeBand,
            location,
            source);
    }
}
