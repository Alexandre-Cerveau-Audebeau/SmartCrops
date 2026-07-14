using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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

public record GardenLayoutResponse(
    int? Width,
    int? Height,
    string? CellSize,
    string? CellsJson,
    List<PlacementResponse> Placements);

public record PlacementResponse(
    Guid Id,
    Guid PlantId,
    string? PlantName,
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
    List<SavePlacementRequest> Placements);

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

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetGarden(Guid id)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var garden = await context
            .Gardens.Where(g => g.Id == id && g.UserId == userId)
            .Include(g => g.GardenPlants)
            .ThenInclude(gp => gp.Plant)
            .ThenInclude(p => p.Translations)
            .Include(g => g.GardenPlants)
            .ThenInclude(gp => gp.Plant)
            .ThenInclude(p => p.PlantType)
            .AsNoTracking()
            .FirstOrDefaultAsync();

        if (garden == null)
            return NotFound();

        return Ok(garden);
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

        return CreatedAtAction(nameof(GetGarden), new { id = garden.Id }, garden);
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

        return Ok(garden);
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

    // POST {id}/plants/{plantId} (AddPlantToGarden) was REMOVED here (SMA-6
    // Option A): placements are the sole plant-membership truth — plants enter a
    // garden by being placed in the planner (PUT /layout). The GardenPlants rows
    // remain readable/editable below (PATCH notes, DELETE) until the dedicated
    // link-table DROP ticket. A POST to the shared route now yields
    // 405 Method Not Allowed (PATCH/DELETE still bind the template).
    [HttpPatch("{id:guid}/plants/{plantId:guid}")]
    public async Task<IActionResult> UpdatePlantNotes(
        Guid id,
        Guid plantId,
        UpdatePlantNotesRequest request
    )
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var garden = await context.Gardens.FirstOrDefaultAsync(g =>
            g.Id == id && g.UserId == userId
        );

        if (garden == null)
            return NotFound();

        var gardenPlant = await context.GardenPlants.FirstOrDefaultAsync(gp =>
            gp.GardenId == id && gp.PlantId == plantId
        );

        if (gardenPlant == null)
            return NotFound("Plant not in garden");

        gardenPlant.Notes = request.Notes;
        await context.SaveChangesAsync();

        return Ok(
            new
            {
                gardenPlant.GardenId,
                gardenPlant.PlantId,
                gardenPlant.Notes,
                gardenPlant.AddedAt,
            }
        );
    }

    [HttpDelete("{id:guid}/plants/{plantId:guid}")]
    public async Task<IActionResult> RemovePlantFromGarden(Guid id, Guid plantId)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var garden = await context.Gardens.FirstOrDefaultAsync(g =>
            g.Id == id && g.UserId == userId
        );

        if (garden == null)
            return NotFound();

        var gardenPlant = await context.GardenPlants.FirstOrDefaultAsync(gp =>
            gp.GardenId == id && gp.PlantId == plantId
        );

        if (gardenPlant == null)
            return NotFound("Plant not in garden");

        context.GardenPlants.Remove(gardenPlant);
        await context.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("{id:guid}/layout")]
    public async Task<IActionResult> GetLayout(Guid id)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var garden = await context.Gardens
            .Include(g => g.Placements)
                .ThenInclude(p => p.Plant)
                    .ThenInclude(p => p.Translations)
            .AsNoTracking()
            .FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);

        if (garden == null) return NotFound();

        var placements = garden.Placements.Select(p => new PlacementResponse(
            p.Id,
            p.PlantId,
            p.Plant.Translations.FirstOrDefault(t => t.Language == "en")?.CommonName ?? p.Plant.ScientificName,
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

}
