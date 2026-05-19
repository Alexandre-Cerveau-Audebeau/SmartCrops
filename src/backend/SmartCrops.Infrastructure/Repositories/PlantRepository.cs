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
        // Detail-view eager load. AsSplitQuery is mandatory here: nine collection
        // .Include() calls in a single SELECT would multiply rows by the cross-
        // product of every navigation, blowing up the payload (~22 pests × 5
        // images × 2 sources × … = thousands of duplicated parent rows for a
        // single tomato). EF Core warns about this at runtime; the split-query
        // mode runs one SELECT per collection and stitches them client-side.
        //
        // Ordering is applied via filtered-include where SQL can express it
        // cleanly (LongDescriptions, CommonNames, Pests, Synonyms, Sources).
        // Image ordering is done in PlantDetailMapper because the gallery's
        // priority order (Main → Habit → Flower → …) doesn't match the enum's
        // numeric order (Habit = 5).
        return await context.Plants
            .Include(p => p.PlantType)
            .Include(p => p.Translations)
            .Include(p => p.Images)
            .Include(p => p.LongDescriptions
                .OrderBy(d => d.Language))
            .Include(p => p.CommonNames
                .OrderByDescending(c => c.IsPrimary)
                .ThenBy(c => c.LanguageCode)
                .ThenBy(c => c.Name))
            .Include(p => p.Pests
                .OrderBy(pst => pst.Source)
                .ThenBy(pst => pst.Name))
            .Include(p => p.Synonyms
                .OrderBy(s => s.Synonym))
            .Include(p => p.Sources
                .OrderBy(s => s.SourceType))
            .Include(p => p.TrefleData)
            .Include(p => p.PerenualData)
            .AsSplitQuery()
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
