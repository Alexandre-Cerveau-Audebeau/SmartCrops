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
    public async Task<IEnumerable<Plant>> GetAllAsync(bool? isMedicinal = null, string language = "en")
    {
        var query = ApplyListIncludes(context.Plants, language);

        if (isMedicinal.HasValue)
            query = query.Where(p => p.IsMedicinal == isMedicinal.Value);

        return await query.ToListAsync();
    }

    /// <summary>
    /// Shared lean-list eager load for the catalogue list/type/search paths
    /// (CodeRabbit DRY). Loads:
    /// <list type="bullet">
    ///   <item>the plant type label;</item>
    ///   <item><b>SMA-5</b>: the requested language's translation + English fallback
    ///   (<=2 rows/plant) so the list card can show a localised CommonName/Description —
    ///   deliberately narrowing the SMA-70 "no translations in list" stance to a single
    ///   display language;</item>
    ///   <item><b>SMA-118</b>: STABLE-source images only (Trefle/PlantNet) — Perenual
    ///   <c>Main</c> images are time-limited signed S3 URLs that expire (~24h) and now
    ///   403, so the mapper must never surface them.</item>
    ///   <item><b>SMA-193</b>: the 1-1 <c>PerenualData</c> row, so the list DTO can
    ///   ship the factual spacing scalars that drive the planner's footprint sizing
    ///   (the mapper reads nothing else from it — free text stays detail-only).</item>
    /// </list>
    /// <c>AsSplitQuery</c> avoids cartesian-multiplying the parent rows across the two
    /// collection includes; <c>AsNoTracking</c> since these are read-only projections.
    /// </summary>
    private static IQueryable<Plant> ApplyListIncludes(IQueryable<Plant> query, string language)
        => query
            .Include(p => p.PlantType)
            .Include(p => p.PerenualData)
            .Include(p => p.Translations.Where(t => t.Language == language || t.Language == "en"))
            .Include(p => p.Images.Where(i =>
                i.Source == PlantSourceType.Trefle || i.Source == PlantSourceType.PlantNet))
            .AsSplitQuery()
            .AsNoTracking();

    /// <summary>
    /// Finder hydration (SMA-255): fetch the given ids with the lean-list
    /// includes, then reorder in memory to match the input order — the search
    /// engine's relevance ranking — since SQL <c>IN</c> gives no ordering
    /// guarantee. Missing ids (index drift) are simply absent.
    /// </summary>
    public async Task<IReadOnlyList<Plant>> GetByIdsAsync(
        IReadOnlyCollection<Guid> ids, string language = "en", CancellationToken ct = default)
    {
        if (ids.Count == 0)
            return [];

        var plants = await ApplyListIncludes(context.Plants, language)
            .Where(p => ids.Contains(p.Id))
            .ToListAsync(ct);

        // First-seen loop rather than Distinct().Select().ToDictionary():
        // a duplicated input id must hydrate once with its FIRST occurrence's
        // rank, and Distinct()'s ordering is undocumented — the relevance rank
        // must be contractual, not an implementation accident.
        var rank = new Dictionary<Guid, int>(ids.Count);
        var next = 0;
        foreach (var id in ids)
        {
            if (rank.TryAdd(id, next))
                next++;
        }

        return plants.OrderBy(p => rank[p.Id]).ToList();
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
    public async Task<IEnumerable<Plant>> GetByTypeAsync(int plantTypeId, string language = "en")
    {
        return await ApplyListIncludes(context.Plants, language)
            .Where(p => p.PlantTypeId == plantTypeId)
            .ToListAsync();
    }
}
