using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Entities;
using SmartCrops.Entities.Data;

namespace SmartCrops.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class GroundsController : ControllerBase
    {
        private readonly SmartCropsDbContext _context;


        public GroundsController(SmartCropsDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var grounds = await _context.Grounds.ToListAsync();
            return Ok(grounds);
        }

        [HttpPost]
        public async Task<IActionResult> Add(Ground ground)
        {
            await _context.Grounds.AddAsync(ground);
            await _context.SaveChangesAsync();
            return Created(nameof(Index), ground);
        }
    }
}
