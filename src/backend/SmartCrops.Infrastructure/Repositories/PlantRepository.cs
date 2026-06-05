using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Infrastructure.Repositories;

/// <summary>
/// EF Core implementation of <see cref="IPlantRepository"/>. List/search paths
/// stay lean (PlantType + stable-source images only — Trefle/PlantNet; SMA-118)
/// while <see cref="GetByIdAsync"/> eagerly loads the full enrichment graph for
/// the detail view — see the inline comment there for the split-query rationale.
/// </summary>
public class PlantRepository(SmartCropsDbContext context) : IPlantRepository
{
    /// <summary>
    /// Return plants with their type label and their stable-source images
    /// (Trefle/PlantNet) so the list DTO can carry a working primary image +
    /// attribution; the mapper picks one by type priority (SMA-118). Perenual
    /// images are deliberately excluded (expired signed URLs). When
    /// <paramref name="isMedicinal"/> is supplied, filter to that exact flag value
    /// (NULL-flag rows excluded). Used by the Library list / planner sidebar.
    /// </summary>
    public async Task<IEnumerable<Plant>> GetAllAsync(bool? isMedicinal = null)
    {
        var query = context.Plants
            .Include(p => p.PlantType)
            // SMA-118: load STABLE-source images (Trefle/PlantNet). Perenual `Main`
            // images are time-limited signed S3 URLs that expire (~24h) and now 403,
            // so the mapper must never surface them. AsSplitQuery: a collection include
            // would otherwise cartesian-multiply the parent rows.
            .Include(p => p.Images.Where(i =>
                i.Source == PlantSourceType.Trefle || i.Source == PlantSourceType.PlantNet))
            .AsSplitQuery()
            .AsNoTracking();

        if (isMedicinal.HasValue)
            query = query.Where(p => p.IsMedicinal == isMedicinal.Value);

        return await query.ToListAsync();
    }

    /// <summary>
    /// Detail-view fetch for the Plant Detail page: eagerly loads every
    /// navigation collection (images, long descriptions, common names, pests,
    /// synonyms, sources, Trefle/Perenual data) via <c>AsSplitQuery</c>, with
    /// SQL-level ordering for the collections whose presentation order can be
    /// expressed in <c>ORDER BY</c>. Returns <c>null</c> when the id misses.
    /// </summary>
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

    /// <summary>Insert a new plant; stamps <c>CreatedAt</c>/<c>UpdatedAt</c> server-side so callers can't backdate.</summary>
    public async Task AddAsync(Plant plant)
    {
        plant.CreatedAt = DateTime.UtcNow;
        plant.UpdatedAt = DateTime.UtcNow;
        await context.Plants.AddAsync(plant);
        await context.SaveChangesAsync();
    }

    /// <summary>Persist a mutated plant; the <c>UpdatedAt</c> stamp is bumped here rather than in the controller.</summary>
    public async Task UpdateAsync(Plant plant)
    {
        plant.UpdatedAt = DateTime.UtcNow;
        context.Plants.Update(plant);
        await context.SaveChangesAsync();
    }

    /// <summary>
    /// Delete by id. No-op when the id misses (caller checks existence
    /// separately if a 404 is needed). FK violations propagate as
    /// <see cref="Microsoft.EntityFrameworkCore.DbUpdateException"/>; the
    /// controller maps that to a 400 with a "referenced by garden data" body.
    /// </summary>
    public async Task DeleteAsync(Guid id)
    {
        var plant = await context.Plants.FindAsync(id);
        if (plant is not null)
        {
            context.Plants.Remove(plant);
            await context.SaveChangesAsync();
        }
    }

    /// <summary>Filter the plant list by <see cref="PlantType"/> id — used by the Library category chips.</summary>
    public async Task<IEnumerable<Plant>> GetByTypeAsync(int plantTypeId)
    {
        return await context.Plants
            .Include(p => p.PlantType)
            // SMA-118: load STABLE-source images (Trefle/PlantNet). Perenual `Main`
            // images are time-limited signed S3 URLs that expire (~24h) and now 403,
            // so the mapper must never surface them. AsSplitQuery: a collection include
            // would otherwise cartesian-multiply the parent rows.
            .Include(p => p.Images.Where(i =>
                i.Source == PlantSourceType.Trefle || i.Source == PlantSourceType.PlantNet))
            .AsSplitQuery()
            .AsNoTracking()
            .Where(p => p.PlantTypeId == plantTypeId)
            .ToListAsync();
    }

    /// <summary>
    /// Case-insensitive substring match against the localised
    /// <see cref="PlantTranslation.CommonName"/> /
    /// <see cref="PlantTranslation.Description"/> for <paramref name="language"/>,
    /// with <see cref="Plant.ScientificName"/> as a language-neutral fallback.
    /// </summary>
    public async Task<IEnumerable<Plant>> SearchAsync(string query, string language)
    {
        var normalised = query.Trim().ToLower();

        // Search translated CommonName/Description for the requested language,
        // and always include ScientificName as a language-neutral fallback.
        // Translations is referenced only in the Where below — EF translates the
        // navigation predicate into a SQL EXISTS, so no eager .Include is needed
        // (the neutral list DTO never materialises translations).
        return await context.Plants
            .Include(p => p.PlantType)
            // SMA-118: load STABLE-source images (Trefle/PlantNet). Perenual `Main`
            // images are time-limited signed S3 URLs that expire (~24h) and now 403,
            // so the mapper must never surface them. AsSplitQuery: a collection include
            // would otherwise cartesian-multiply the parent rows.
            .Include(p => p.Images.Where(i =>
                i.Source == PlantSourceType.Trefle || i.Source == PlantSourceType.PlantNet))
            .AsSplitQuery()
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
