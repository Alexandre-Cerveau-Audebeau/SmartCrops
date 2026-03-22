using Microsoft.AspNetCore.Mvc;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PlantTypesController(SmartCropsDbContext context) : ControllerBase
{
    [HttpGet]
    public IActionResult GetAll()
    {
        // PlantTypes is a small, stable lookup table — no async needed and no
        // navigation properties to include, so a synchronous ToList is appropriate.
        var types = context.PlantTypes.ToList();
        return Ok(types);
    }
}
