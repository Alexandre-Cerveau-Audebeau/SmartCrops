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

    /// <summary>
    /// Search-then-fetch path: <c>/species-list?q=…</c> picks a candidate id
    /// (cultivar-aware) via <see cref="PerenualResolver.PickBestMatch"/>, then
    /// the candidate id is sent to <see cref="FetchAndResolveAsync"/>. Returns
    /// the <see cref="PerenualResolver.NoMatch"/> sentinel when no candidate is
    /// found.
    /// </summary>
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

    /// <summary>
    /// Direct-fetch path: skip the search step and send <paramref name="perenualId"/>
    /// straight to <c>/species/details/{id}</c>. Used by the admin endpoint
    /// when the operator knows the upstream id (cultivars, reclassified species).
    /// </summary>
    public Task<PerenualEnrichmentResult> ResolveByIdAsync(int perenualId, CancellationToken ct)
        => FetchAndResolveAsync(perenualId, ct);

    /// <summary>
    /// Shared core for both resolution paths. <paramref name="perenualId"/> is
    /// what we ASK Perenual for; the response carries a (possibly different)
    /// canonical id under <c>response.id</c>. Both are surfaced on
    /// <see cref="PerenualEnrichmentResult"/> so the controller can persist the
    /// audit trail (issue #67).
    /// </summary>
    private async Task<PerenualEnrichmentResult> FetchAndResolveAsync(int perenualId, CancellationToken ct)
    {
        // `perenualId` here is what we ASKED Perenual for — server-side
        // canonicalisation may overwrite the returned `response.id` with a
        // different value (cf. issue #67). Plumb the requested id into the
        // resolver so the audit trail records it on PerenualEnrichmentResult.
        var fetch = await _client.GetSpeciesDetailsWithLiteralAsync(perenualId, ct);
        var rawJson = fetch.Species is not null ? JsonSerializer.Serialize(fetch.Species) : string.Empty;
        var result = _resolver.Resolve(fetch.Species, rawJson, requestedPerenualId: perenualId);

        // No acceptable match → nothing extra to capture (the literal was null or
        // a non-JSON deleted-id body); return the resolver's NONE result as-is.
        if (result.PerenualId is null)
        {
            return result;
        }

        // SMA-71 loss-proof capture. Attach the redacted literal /species/details
        // body — kept even on a canonical mismatch, like RawResponseJson, since it
        // is the diagnostic record of what Perenual actually returned — and fetch
        // the per-species care-guide literal (one extra call, NON-FATAL: null on
        // any miss). The key is already redacted inside the client, so nothing
        // secret flows through here.
        // Key the care-guide on the CANONICAL species id (result.PerenualId) so
        // the captured guide matches the species we actually persist, not the
        // (possibly server-canonicalised — issue #67/#73) requested id. Non-null
        // here: we returned early above when result.PerenualId was null.
        var careGuideJson = await _client.GetCareGuideLiteralAsync(result.PerenualId.Value, ct);
        return result with
        {
            LiteralResponseJson = fetch.LiteralJson,
            CareGuideResponseJson = careGuideJson,
        };
    }
}
