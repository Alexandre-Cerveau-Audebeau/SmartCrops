using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Infrastructure.ExternalApis.Perenual;

/// <summary>
/// <see cref="IPerenualCatalogService"/> implementation: wraps
/// <see cref="PerenualClient.GetSpeciesListAsync"/> and maps the
/// Infrastructure-side binding to the Core <see cref="PerenualCatalogPage"/>
/// DTO so the API layer depends only on Core. SMA-13 layer-c keeps controllers
/// off Infrastructure concrete classes (PR #89 M1 precedent).
/// </summary>
public class PerenualCatalogService : IPerenualCatalogService
{
    private readonly PerenualClient _client;

    public PerenualCatalogService(PerenualClient client)
    {
        _client = client;
    }

    public async Task<PerenualCatalogPage?> GetPageAsync(int page, CancellationToken ct)
    {
        var response = await _client.GetSpeciesListAsync(page, ct);
        if (response is null) return null;

        // Null-guard against upstream shipping a null entry inside Data — CR
        // PR #92 R1 F1. The PerenualClient absorbs transport failures into a
        // null response (handled above), but doesn't promise non-null items
        // inside Data. Preserves graceful-failure posture instead of NRE-ing
        // out of the dual-write.
        var data = (response.Data ?? new List<PerenualSpeciesListMatch>())
            .Where(m => m is not null)
            .Select(m => new PerenualCatalogPageEntry(
                Id: m.Id,
                ScientificName: m.ScientificName?.AsReadOnly(),
                CommonName: m.CommonName,
                OtherName: m.OtherName?.AsReadOnly(),
                Family: m.Family,
                Cultivar: m.Cultivar,
                Variety: m.Variety,
                Hybrid: m.Hybrid,
                Subspecies: m.Subspecies))
            .ToList()
            .AsReadOnly();

        return new PerenualCatalogPage(
            Data: data,
            CurrentPage: response.CurrentPage,
            PerPage: response.PerPage,
            LastPage: response.LastPage,
            Total: response.Total,
            From: response.From,
            To: response.To);
    }
}
