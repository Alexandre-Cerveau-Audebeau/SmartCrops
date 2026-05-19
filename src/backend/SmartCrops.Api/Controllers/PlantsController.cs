using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PlantsController(IPlantRepository repository) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var plants = await repository.GetAllAsync();
        return Ok(plants);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var plant = await repository.GetByIdAsync(id);
        return plant is null ? NotFound() : Ok(PlantDetailMapper.ToDto(plant));
    }

    [HttpGet("type/{plantTypeId:int}")]
    public async Task<IActionResult> GetByType(int plantTypeId)
    {
        var plants = await repository.GetByTypeAsync(plantTypeId);
        return Ok(plants);
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string query, [FromQuery] string language = "en")
    {
        if (string.IsNullOrWhiteSpace(query))
            return BadRequest("query parameter is required.");

        var plants = await repository.SearchAsync(query, language);
        return Ok(plants);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Plant plant)
    {
        plant.Id = Guid.NewGuid();
        await repository.AddAsync(plant);
        return CreatedAtAction(nameof(GetById), new { id = plant.Id }, plant);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Plant plant)
    {
        if (id != plant.Id)
            return BadRequest("Route id does not match body id.");

        var existing = await repository.GetByIdAsync(id);
        if (existing is null)
            return NotFound();

        existing.ScientificName = plant.ScientificName;
        existing.PlantTypeId = plant.PlantTypeId;
        existing.SunExposure = plant.SunExposure;
        existing.WaterNeeds = plant.WaterNeeds;
        existing.SowingPeriod = plant.SowingPeriod;
        existing.HarvestPeriod = plant.HarvestPeriod;
        existing.ImageUrl = plant.ImageUrl;
        existing.UpdatedAt = DateTime.UtcNow;

        await repository.UpdateAsync(existing);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var existing = await repository.GetByIdAsync(id);
        if (existing is null)
            return NotFound();

        try
        {
            await repository.DeleteAsync(id);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is Npgsql.NpgsqlException { SqlState: "23503" })
        {
            return BadRequest("Cannot delete plant; it is referenced by existing garden data.");
        }

        return NoContent();
    }
}
