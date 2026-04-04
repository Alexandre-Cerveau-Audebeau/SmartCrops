using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Entities;
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

public record AddPlantToGardenRequest([MaxLength(500)] string? Notes);

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
    [HttpGet]
    public async Task<IActionResult> GetGardens()
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        var gardens = await context
            .Gardens.Where(g => g.UserId == userId)
            .Include(g => g.GardenPlants)
            .ThenInclude(gp => gp.Plant)
            .OrderByDescending(g => g.CreatedAt)
            .AsNoTracking()
            .ToListAsync();

        return Ok(gardens);
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

    [HttpPost("{id:guid}/plants/{plantId:guid}")]
    public async Task<IActionResult> AddPlantToGarden(
        Guid id,
        Guid plantId,
        [FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)]
            AddPlantToGardenRequest? request
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

        var plantExists = await context.Plants.AnyAsync(p => p.Id == plantId);
        if (!plantExists)
            return NotFound("Plant not found");

        var alreadyAdded = await context.GardenPlants.AnyAsync(gp =>
            gp.GardenId == id && gp.PlantId == plantId
        );
        if (alreadyAdded)
            return Conflict("Plant already in garden");

        var gardenPlant = new GardenPlant
        {
            GardenId = id,
            PlantId = plantId,
            AddedAt = DateTime.UtcNow,
            Notes = request?.Notes,
        };

        context.GardenPlants.Add(gardenPlant);
        try
        {
            await context.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is Npgsql.NpgsqlException { SqlState: "23505" })
        {
            return Conflict("Plant already in garden");
        }

        return CreatedAtAction(nameof(GetGarden), new { id }, gardenPlant);
    }

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
