using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GardensController(SmartCropsDbContext context) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetGardens()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
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
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
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
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
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
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
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
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
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
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
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

    [HttpDelete("{id:guid}/plants/{plantId:guid}")]
    public async Task<IActionResult> RemovePlantFromGarden(Guid id, Guid plantId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
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
}
