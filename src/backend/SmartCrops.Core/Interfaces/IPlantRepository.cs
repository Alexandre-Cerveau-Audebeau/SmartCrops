using SmartCrops.Core.Entities;

namespace SmartCrops.Core.Interfaces;

public interface IPlantRepository
{
    /// <summary>
    /// List plants for the catalogue. When <paramref name="isMedicinal"/> is
    /// supplied, filter to rows whose <see cref="Plant.IsMedicinal"/> equals it
    /// exactly — <c>true</c> returns only medicinal-flagged plants and NULL-flag
    /// (unknown) rows are excluded. Omit it (default) for the full list
    /// (backwards-compatible). <paramref name="language"/> selects the single
    /// localised translation (CommonName/Description) the list DTO surfaces (SMA-5).
    /// </summary>
    Task<IEnumerable<Plant>> GetAllAsync(bool? isMedicinal = null, string language = "en");
    Task<Plant?> GetByIdAsync(Guid id);
    Task AddAsync(Plant plant);
    Task UpdateAsync(Plant plant);
    Task DeleteAsync(Guid id);
    Task<IEnumerable<Plant>> GetByTypeAsync(int plantTypeId, string language = "en");

    /// <summary>
    /// Full-text search against <see cref="PlantTranslation.CommonName"/> and
    /// <see cref="PlantTranslation.Description"/> for a specific language,
    /// falling back to <see cref="Plant.ScientificName"/>.
    /// </summary>
    Task<IEnumerable<Plant>> SearchAsync(string query, string language);

    /// <summary>
    /// Batch lean-list fetch for the finder hydration path (SMA-255): loads
    /// the given plants with the same includes as <see cref="GetAllAsync"/>
    /// and returns them in the ORDER OF <paramref name="ids"/> (the search
    /// engine's relevance order — SQL <c>IN</c> does not preserve it). Ids
    /// with no matching row are silently absent from the result.
    /// </summary>
    Task<IReadOnlyList<Plant>> GetByIdsAsync(IReadOnlyCollection<Guid> ids, string language = "en");
}
