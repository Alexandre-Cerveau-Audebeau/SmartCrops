using SmartCrops.Core.Entities;

namespace SmartCrops.Core.Interfaces;

public interface IPlantRepository
{
    Task<IEnumerable<Plant>> GetAllAsync();
    Task<Plant?> GetByIdAsync(Guid id);
    Task AddAsync(Plant plant);
    Task UpdateAsync(Plant plant);
    Task DeleteAsync(Guid id);
    Task<IEnumerable<Plant>> GetByTypeAsync(int plantTypeId);

    /// <summary>
    /// Full-text search against <see cref="PlantTranslation.CommonName"/> and
    /// <see cref="PlantTranslation.Description"/> for a specific language,
    /// falling back to <see cref="Plant.ScientificName"/>.
    /// </summary>
    Task<IEnumerable<Plant>> SearchAsync(string query, string language);
}
