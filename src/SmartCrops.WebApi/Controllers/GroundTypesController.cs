using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Entities;
using SmartCrops.Entities.Data;

namespace SmartCrops.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class GroundTypesController : ControllerBase
    {
        private readonly SmartCropsDbContext _context;

        public GroundTypesController(SmartCropsDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var groundTypes = await _context.GroundTypes.ToListAsync();
            return Ok(groundTypes);
        }

        [HttpPost]
        public async Task<IActionResult> Add(GroundType groundType)
        {
            await _context.GroundTypes.AddAsync(groundType);
            await _context.SaveChangesAsync();
            return Created(nameof(Index), groundType);
        }
    }
}
