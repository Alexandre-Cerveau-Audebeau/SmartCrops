using System.Text.Json;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Infrastructure.ExternalApis.Perenual;

/// <summary>
/// <see cref="IPlantPerenualEnrichmentService"/> implementation that composes
/// <see cref="PerenualClient"/> (transport) and <see cref="PerenualResolver"/>
/// (pure logic). Two resolution paths:
/// <list type="bullet">
///   <item><see cref="ResolveAsync(string, CancellationToken)"/> — search
///   <c>/species-list?q={scientificName}</c>, pick the best match (with
///   cultivar-marker tolerance), then fetch <c>/species/details/{id}</c>;</item>
///   <item><see cref="ResolveByIdAsync(int, CancellationToken)"/> — skip the
///   search and fetch <c>/species/details/{id}</c> directly (used when the
///   admin passes a known Perenual id).</item>
/// </list>
///
/// <para>The intermediate species response is re-serialised as the raw JSON
/// retained on <see cref="SmartCrops.Core.Entities.PlantPerenualData"/>. This
/// avoids carrying the original wire bytes through the call chain while
/// preserving every consumed field. Fields containing the API key (care_guides,
/// hardiness_location.full_url) are <b>not</b> mapped on
/// <see cref="PerenualSpeciesResponse"/>, so the round-trip cannot leak them
/// into the audit JSON.</para>
/// </summary>
public class PlantPerenualEnrichmentService : IPlantPerenualEnrichmentService
{
    private readonly PerenualClient _client;
    private readonly PerenualResolver _resolver;

    public PlantPerenualEnrichmentService(PerenualClient client, PerenualResolver resolver)
    {
        _client = client;
        _resolver = resolver;
    }

    public async Task<PerenualEnrichmentResult> ResolveAsync(string scientificName, CancellationToken ct)
    {
        var search = await _client.SearchAsync(scientificName, ct);
        var perenualId = _resolver.PickBestMatch(search, scientificName);
        if (perenualId is null)
        {
            return PerenualResolver.NoMatch(rawJson: string.Empty);
        }

        return await FetchAndResolveAsync(perenualId.Value, ct);
    }

    public Task<PerenualEnrichmentResult> ResolveByIdAsync(int perenualId, CancellationToken ct)
        => FetchAndResolveAsync(perenualId, ct);

    private async Task<PerenualEnrichmentResult> FetchAndResolveAsync(int perenualId, CancellationToken ct)
    {
        var species = await _client.GetSpeciesDetailsAsync(perenualId, ct);
        var rawJson = species is not null ? JsonSerializer.Serialize(species) : string.Empty;
        return _resolver.Resolve(species, rawJson);
    }
}
