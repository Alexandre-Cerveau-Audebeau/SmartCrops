using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartCrops.Api.Configuration;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Api.Controllers;

/// <summary>
/// Public plant catalogue endpoints. <c>GetById</c> projects the loaded
/// aggregate through <see cref="PlantDetailMapper"/> to a curated DTO; the
/// other read endpoints (list / by-type / search) intentionally surface the
/// raw <see cref="Plant"/> entity since they only need the lean projection
/// loaded by the matching repository methods.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class PlantsController(
    IPlantRepository repository,
    IOptions<ContentExposureOptions> contentExposure) : ControllerBase
{
    /// <summary>
    /// List plants for the Library grid and the planner sidebar, projected to the
    /// neutral <see cref="PlantListItemResponse"/> (no licensed source text, no
    /// empty navigations — SMA-70). Optional <paramref name="isMedicinal"/> filter
    /// (SMA-63): <c>true</c> returns only medicinal-flagged plants (NULL-flag rows
    /// excluded); omit for the full list.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? isMedicinal = null)
    {
        var plants = await repository.GetAllAsync(isMedicinal);
        return Ok(plants.Select(PlantListItemMapper.ToListItem));
    }

    /// <summary>
    /// Plant Detail endpoint — eager-loads the full enrichment graph and
    /// projects to <see cref="PlantDetailResponse"/>. Returns 404 when the id
    /// misses.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var plant = await repository.GetByIdAsync(id);
        return plant is null
            ? NotFound()
            : Ok(PlantDetailMapper.ToDto(plant, contentExposure.Value.ExposeSourceText));
    }

    /// <summary>Filter the catalogue by <see cref="PlantType"/> id (vegetable / fruit / …) — backs the Library category chips.</summary>
    [HttpGet("type/{plantTypeId:int}")]
    public async Task<IActionResult> GetByType(int plantTypeId)
    {
        var plants = await repository.GetByTypeAsync(plantTypeId);
        return Ok(plants.Select(PlantListItemMapper.ToListItem));
    }

    /// <summary>
    /// Substring search against the localised common name / description, with
    /// the scientific name as a language-neutral fallback. <c>query</c> is
    /// required; <c>language</c> defaults to <c>"en"</c>. Empty queries return
    /// 400 to keep the result page from showing the entire catalogue.
    /// </summary>
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string query, [FromQuery] string language = "en")
    {
        if (string.IsNullOrWhiteSpace(query))
            return BadRequest("query parameter is required.");

        var plants = await repository.SearchAsync(query, language);
        return Ok(plants.Select(PlantListItemMapper.ToListItem));
    }

    /// <summary>Create a new plant. Used by ETL/seed flows; not exposed in the user UI.</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Plant plant)
    {
        plant.Id = Guid.NewGuid();
        await repository.AddAsync(plant);
        return CreatedAtAction(nameof(GetById), new { id = plant.Id }, plant);
    }

    /// <summary>
    /// Partial update of the legacy scalar fields (the enrichment payload is
    /// owned by the dedicated <c>/api/admin/{trefle,perenual}/enrich</c>
    /// endpoints). Validates that the route id matches the body, then
    /// returns 204 on success or 404 when the id misses.
    /// </summary>
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

    /// <summary>
    /// Hard-delete a plant. Maps the Postgres FK-violation error 23503 to a
    /// 400 with a hint that the plant is still referenced by garden data —
    /// frontend can surface the message to the user before they retry after
    /// emptying their gardens.
    /// </summary>
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
