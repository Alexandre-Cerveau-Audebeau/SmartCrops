using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Entities;
using SmartCrops.Entities.Data;

namespace SmartCrops.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ObstaclesController : ControllerBase
    {
        private readonly SmartCropsDbContext _context;


        public ObstaclesController(SmartCropsDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var obstacles = await _context.Obstacles.ToListAsync();
            return Ok(obstacles);
        }

        [HttpPost]
        public async Task<IActionResult> Add(Obstacle obstacle)
        {
            await _context.Obstacles.AddAsync(obstacle);
            await _context.SaveChangesAsync();
            return Created(nameof(Index), obstacle);
        }
    }
}
