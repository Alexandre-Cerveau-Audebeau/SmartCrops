using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Infrastructure.ExternalApis.Perenual;

/// <summary>
/// <see cref="IPerenualPestCatalogService"/> implementation: thin seam over
/// <see cref="PerenualClient.GetPestDiseaseListAsync"/>. The client already
/// redacts the API key and maps the page to the Core <see cref="PerenualPestPage"/>
/// DTO, so this exists only to keep the API layer (the harvest controller) off
/// the Infrastructure concrete class and to give the integration tests a
/// stubbable seam — same precedent as <see cref="PerenualCatalogService"/>.
/// </summary>
public class PerenualPestCatalogService : IPerenualPestCatalogService
{
    private readonly PerenualClient _client;

    public PerenualPestCatalogService(PerenualClient client)
    {
        _client = client;
    }

    public Task<PerenualPestPage?> GetPageAsync(int page, CancellationToken ct)
        => _client.GetPestDiseaseListAsync(page, ct);
}
