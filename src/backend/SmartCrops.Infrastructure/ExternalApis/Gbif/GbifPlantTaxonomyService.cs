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
        // SMA-71: capture the verbatim GBIF body alongside the parsed match, then
        // attach it to the (pure-logic) resolver result so the controller can
        // persist the loss-proof audit row. Kept null on the no-match/failure path.
        var fetch = await _client.MatchWithLiteralAsync(scientificName, ct);
        var result = _resolver.Resolve(fetch.Match);
        return result with { RawResponseJson = result.GbifTaxonKey is null ? null : fetch.LiteralJson };
    }
}
