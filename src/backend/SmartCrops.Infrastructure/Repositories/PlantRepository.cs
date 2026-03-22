using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Infrastructure.Repositories;

public class PlantRepository(SmartCropsDbContext context) : IPlantRepository
{
    public async Task<IEnumerable<Plant>> GetAllAsync()
    {
        return await context.Plants
            .Include(p => p.PlantType)
            .Include(p => p.Translations)
            .AsNoTracking()
            .ToListAsync();
    }

    public async Task<Plant?> GetByIdAsync(Guid id)
    {
        return await context.Plants
            .Include(p => p.PlantType)
            .Include(p => p.Translations)
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == id);
    }

    public async Task AddAsync(Plant plant)
    {
        plant.CreatedAt = DateTime.UtcNow;
        plant.UpdatedAt = DateTime.UtcNow;
        await context.Plants.AddAsync(plant);
        await context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Plant plant)
    {
        plant.UpdatedAt = DateTime.UtcNow;
        context.Plants.Update(plant);
        await context.SaveChangesAsync();
    }

    public async Task DeleteAsync(Guid id)
    {
        var plant = await context.Plants.FindAsync(id);
        if (plant is not null)
        {
            context.Plants.Remove(plant);
            await context.SaveChangesAsync();
        }
    }

    public async Task<IEnumerable<Plant>> GetByTypeAsync(int plantTypeId)
    {
        return await context.Plants
            .Include(p => p.PlantType)
            .Include(p => p.Translations)
            .AsNoTracking()
            .Where(p => p.PlantTypeId == plantTypeId)
            .ToListAsync();
    }

    public async Task<IEnumerable<Plant>> SearchAsync(string query, string language)
    {
        var normalised = query.Trim().ToLower();

        // Search translated CommonName/Description for the requested language,
        // and always include ScientificName as a language-neutral fallback.
        return await context.Plants
            .Include(p => p.PlantType)
            .Include(p => p.Translations)
            .AsNoTracking()
            .Where(p =>
                p.ScientificName.ToLower().Contains(normalised) ||
                p.Translations.Any(t =>
                    t.Language == language &&
                    (t.CommonName.ToLower().Contains(normalised) ||
                     (t.Description != null && t.Description.ToLower().Contains(normalised)))))
            .ToListAsync();
    }
}
