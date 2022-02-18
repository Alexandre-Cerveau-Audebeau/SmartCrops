using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Entities;
using SmartCrops.Entities.Data;

namespace SmartCrops.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PlantsController : ControllerBase
    {
        private readonly SmartCropsDbContext _context;


        public PlantsController(SmartCropsDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var plants = await _context.Plants.ToListAsync();
            return Ok(plants);
        }

        [HttpPost]
        public async Task<IActionResult> Add(Plant plant)
        {
            await _context.Plants.AddAsync(plant);
            await _context.SaveChangesAsync();
            return Created(nameof(Index), plant);
        }
    }
}
