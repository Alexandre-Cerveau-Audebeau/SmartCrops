using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Controllers;

public record CreateGardenRequest(
    [Required, MaxLength(100)] string Name,
    [MaxLength(500)] string? Description
);

public record UpdateGardenRequest(
    [Required, MaxLength(100)] string Name,
    [MaxLength(500)] string? Description
);

/// <summary>
/// Exposure config block (SMA-285 / SMA-17): values are stored as-is, all
/// nullable — the app-level defaults (hemisphere null -> 'N', latitudeBand
/// null -> 'mid') belong to the future READ-time exposure engine (5.3-C).
/// </summary>
public record GardenConfigDto(
    string? Orientation,
    string? GardenType,
    List<LightSlotDto>? LightSchedule,
    string? Hemisphere,
    string? LatitudeBand);

public record LightSlotDto(string? Start, string? End);

/// <summary>
/// GET /api/gardens/{id} contract (SMA-285): a clean DTO — the raw entity
/// serialization (and its legacy GardenPlants graph) is retired.
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
    string? LatitudeBand);

public record GardenLayoutResponse(
    int? Width,
    int? Height,
    string? CellSize,
    string? CellsJson,
    GardenConfigDto Config,
    List<PlacementResponse> Placements);

// PlantName was removed from the placement wire (SMA-285): the front rebuilds
// every display name from its locale-keyed catalog via the shared resolver
// (getPlantDisplayName, SMA-194) and never read the server field.
public record PlacementResponse(
    Guid Id,
    Guid PlantId,
    string? PlantScientificName,
    int StartRow,
    int StartCol,
    int SpanRows,
    int SpanCols,
    string? Notes);

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
public class GardensController(SmartCropsDbContext context) : ControllerBase
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
                i.Source == PlantSourceType.Trefle || i.Source == PlantSourceType.PlantNet))
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

        return Ok(ToGardenResponse(garden));
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

        return CreatedAtAction(nameof(GetGarden), new { id = garden.Id }, ToGardenResponse(garden));
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
        garden.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync();

        return Ok(ToGardenResponse(garden));
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

    // Strict 24h clock: 00:00 .. 23:59.
    private static readonly Regex TimeSlotPattern =
        new(@"^([01]\d|2[0-3]):[0-5]\d$", RegexOptions.Compiled);

    private const int MaxLightSlots = 6;

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
            if (slots.Count > MaxLightSlots)
                return $"lightSchedule allows at most {MaxLightSlots} slots.";
            foreach (var slot in slots)
            {
                if (slot.Start is null || slot.End is null
                    || !TimeSlotPattern.IsMatch(slot.Start)
                    || !TimeSlotPattern.IsMatch(slot.End))
                    return "each lightSchedule slot needs start and end in 24h HH:mm format.";
                // Zero-padded HH:mm makes ordinal comparison chronological.
                if (string.CompareOrdinal(slot.Start, slot.End) >= 0)
                    return "each lightSchedule slot must have start < end.";
            }
        }

        return null;
    }

    private static List<LightSlotDto>? ParseLightSchedule(string? json) =>
        string.IsNullOrEmpty(json)
            ? null
            : JsonSerializer.Deserialize<List<LightSlotDto>>(json, JsonWeb);

    private static GardenConfigDto ToConfigDto(Garden garden) => new(
        garden.Orientation,
        garden.GardenType,
        ParseLightSchedule(garden.LightScheduleJson),
        garden.Hemisphere,
        garden.LatitudeBand);

    private static GardenResponse ToGardenResponse(Garden garden) => new(
        garden.Id,
        garden.Name,
        garden.Description,
        garden.LayoutWidth,
        garden.LayoutHeight,
        garden.CellSize,
        garden.Orientation,
        garden.GardenType,
        ParseLightSchedule(garden.LightScheduleJson),
        garden.Hemisphere,
        garden.LatitudeBand);
}
