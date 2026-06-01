using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Infrastructure.ExternalApis.Trefle;

/// <summary>
/// <see cref="IPlantTrefleEnrichmentService"/> implementation that composes
/// <see cref="TrefleClient"/> (transport) and <see cref="TrefleResolver"/>
/// (pure logic): search → pick first exact scientific-name match → fetch the
/// full species record → flatten via the resolver.
///
/// <para>SMA-71: the VERBATIM <c>/species/{id}</c> body (token redacted) is
/// captured string-first and retained on <c>PlantTrefleData.RawResponseJson</c> —
/// the loss-proof filet, mirroring GBIF (#107) / Perenual (#102). This replaces the
/// prior re-serialisation of the partial DTO, which silently dropped every field the
/// DTO does not bind (e.g. <c>growth.soil_salinity</c>).</para>
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

        // SMA-71: capture the VERBATIM (token-redacted) body, not a re-serialisation
        // of the partial DTO — so unmapped fields survive in the loss-proof audit.
        var fetch = await _client.GetSpeciesWithLiteralAsync(trefleId.Value, ct);
        return _resolver.Resolve(fetch.Species, fetch.LiteralJson ?? string.Empty);
    }
}
