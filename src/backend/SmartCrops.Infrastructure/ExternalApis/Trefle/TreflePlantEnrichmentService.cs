using System.Text.Json;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Infrastructure.ExternalApis.Trefle;

/// <summary>
/// <see cref="IPlantTrefleEnrichmentService"/> implementation that composes
/// <see cref="TrefleClient"/> (transport) and <see cref="TrefleResolver"/>
/// (pure logic): search → pick first exact scientific-name match → fetch the
/// full species record → flatten via the resolver.
///
/// <para>The intermediate species response is re-serialised as the raw JSON
/// retained on <c>PlantTrefleData</c>. This avoids carrying the original wire
/// bytes through the call chain while preserving every consumed field.</para>
/// </summary>
public class TreflePlantEnrichmentService : IPlantTrefleEnrichmentService
{
    private readonly TrefleClient _client;
    private readonly TrefleResolver _resolver;

    public TreflePlantEnrichmentService(TrefleClient client, TrefleResolver resolver)
    {
        _client = client;
        _resolver = resolver;
    }

    public async Task<TrefleEnrichmentResult> ResolveAsync(string scientificName, CancellationToken ct)
    {
        var search = await _client.SearchAsync(scientificName, ct);
        var trefleId = _resolver.PickBestMatch(search, scientificName);
        if (trefleId is null)
        {
            return _resolver.Resolve(speciesResponse: null, rawJson: string.Empty);
        }

        var species = await _client.GetSpeciesAsync(trefleId.Value, ct);
        var rawJson = species is not null ? JsonSerializer.Serialize(species) : string.Empty;
        return _resolver.Resolve(species, rawJson);
    }
}
