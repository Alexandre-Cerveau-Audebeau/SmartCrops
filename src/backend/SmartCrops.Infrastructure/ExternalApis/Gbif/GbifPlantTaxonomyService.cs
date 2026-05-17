using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Infrastructure.ExternalApis.Gbif;

/// <summary>
/// <see cref="IPlantTaxonomyService"/> implementation that composes
/// <see cref="GbifClient"/> (transport) and <see cref="GbifDedupResolver"/>
/// (pure logic). The orchestration is intentionally trivial — adding caching,
/// batching, or rate-limiting belongs in dedicated decorators or upstream.
/// </summary>
public class GbifPlantTaxonomyService : IPlantTaxonomyService
{
    private readonly GbifClient _client;
    private readonly GbifDedupResolver _resolver;

    public GbifPlantTaxonomyService(GbifClient client, GbifDedupResolver resolver)
    {
        _client = client;
        _resolver = resolver;
    }

    public async Task<PlantTaxonomyResult> ResolveAsync(string scientificName, CancellationToken ct)
    {
        var response = await _client.MatchAsync(scientificName, ct);
        return _resolver.Resolve(response);
    }
}
