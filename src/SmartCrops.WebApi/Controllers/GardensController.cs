using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Entities;
using SmartCrops.Entities.Data;

namespace SmartCrops.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class GardensController : ControllerBase
    {
        private readonly SmartCropsDbContext _context;


        public GardensController(SmartCropsDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var gardens = await _context.Gardens.ToListAsync();
            return Ok(gardens);
        }

        [HttpPost]
        public async Task<IActionResult> Add(Garden garden)
        {
            await _context.Gardens.AddAsync(garden);
            await _context.SaveChangesAsync();
            return Created(nameof(Index), garden);
        }
    }
}
