using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Entities;
using SmartCrops.Entities.Data;

namespace SmartCrops.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PlantTypesController : ControllerBase
    {
        private readonly SmartCropsDbContext _context;
        
        public PlantTypesController(SmartCropsDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var plantTypes = await _context.PlantTypes.ToListAsync();
            return Ok(plantTypes);
        }

        [HttpPost]
        public async Task<IActionResult> Add(PlantType plantType)
        {
            await _context.PlantTypes.AddAsync(plantType);
            await _context.SaveChangesAsync();
            return Created(nameof(Index), plantType);
        }

        [HttpPut]
        public async Task<IActionResult> Update(PlantType plantType)
        {
            _context.PlantTypes.Update(plantType);
            await _context.SaveChangesAsync();
            return Ok(plantType);
        }

        [HttpDelete]
        public async Task<IActionResult> Delete(int id)
        {
            var plantType = new PlantType { Id = id };
            _context.PlantTypes.Remove(plantType);
            await _context.SaveChangesAsync();
            return Ok(plantType);
        }
    }
}
