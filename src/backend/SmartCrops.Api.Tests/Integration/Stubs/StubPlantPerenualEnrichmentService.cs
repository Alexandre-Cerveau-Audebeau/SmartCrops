using SmartCrops.Core.Enums;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Test-only <see cref="IPlantPerenualEnrichmentService"/> that returns
/// pre-loaded <see cref="PerenualEnrichmentResult"/> values in FIFO order.
/// Mirrors the Trefle stub: tests enqueue canned responses via
/// <see cref="Enqueue"/> and inspect captured calls via
/// <see cref="ReceivedNames"/> and <see cref="ReceivedIds"/>;
/// <c>IntegrationTestBase.InitializeAsync</c> calls <see cref="Reset"/> after
/// Respawn so each test starts from a clean queue.
///
/// <para>Registered as a Singleton in <c>PostgresFixture</c> so the in-memory
/// queue survives the per-request <c>IPlantPerenualEnrichmentService</c>
/// scope resolution.</para>
/// </summary>
public sealed class StubPlantPerenualEnrichmentService : IPlantPerenualEnrichmentService
{
    private readonly object _lock = new();
    private readonly Queue<PerenualEnrichmentResult> _responses = new();
    private readonly List<string> _receivedNames = [];
    private readonly List<int> _receivedIds = [];

    public IReadOnlyList<string> ReceivedNames
    {
        get
        {
            lock (_lock)
            {
                return _receivedNames.ToArray();
            }
        }
    }

    public IReadOnlyList<int> ReceivedIds
    {
        get
        {
            lock (_lock)
            {
                return _receivedIds.ToArray();
            }
        }
    }

    /// <summary>Enqueue one response to be returned by the next call (name or id path).</summary>
    public void Enqueue(PerenualEnrichmentResult result)
    {
        lock (_lock)
        {
            _responses.Enqueue(result);
        }
    }

    /// <summary>Enqueue a NONE result (no Perenual id) for the next call.</summary>
    public void EnqueueNoMatch() => Enqueue(NoMatch());

    public static PerenualEnrichmentResult NoMatch() => new(
        PerenualId: null,
        RequestedPerenualId: null,
        Cultivar: null,
        PerenualType: null,
        CanonicalScientificName: null,
        RawResponseJson: string.Empty,
        HasSupremeData: false,
        LifeCycle: null,
        GrowthRate: null,
        WateringNeed: null,
        CareLevel: null,
        HardinessZoneMin: null,
        HardinessZoneMax: null,
        MinHeightCm: null,
        MaxHeightCm: null,
        IsEdible: null,
        IsIndoor: null,
        IsDroughtTolerant: null,
        IsSaltTolerant: null,
        IsThorny: null,
        IsInvasive: null,
        IsTropical: null,
        IsMedicinal: null,
        IsToxicToHumans: null,
        IsToxicToPets: null,
        EdiblePartsJson: null,
        PropagationInstructions: null,
        SowingInstructions: null,
        OriginCountries: null,
        SunlightPreferences: null,
        PruningMonths: null,
        Maintenance: null,
        FloweringSeason: null,
        HarvestSeason: null,
        PlantAnatomyJson: null,
        HasEdibleFruit: null,
        HasEdibleLeaves: null,
        IsCulinary: null,
        PropagationMethods: null,
        WateringBenchmark: null,
        WateringBenchmarkUnit: null,
        Images: Array.Empty<PerenualImage>(),
        Pests: Array.Empty<PerenualPest>(),
        LongDescriptionEn: null,
        HardinessRejectedAsSuspect: false,
        IsCanonicalMismatchDangerous: false,
        MatchType: "NONE");

    public Task<PerenualEnrichmentResult> ResolveAsync(string scientificName, CancellationToken ct)
    {
        lock (_lock)
        {
            _receivedNames.Add(scientificName);
            var next = _responses.Count > 0 ? _responses.Dequeue() : NoMatch();
            return Task.FromResult(next);
        }
    }

    public Task<PerenualEnrichmentResult> ResolveByIdAsync(int perenualId, CancellationToken ct)
    {
        lock (_lock)
        {
            _receivedIds.Add(perenualId);
            var next = _responses.Count > 0 ? _responses.Dequeue() : NoMatch();
            return Task.FromResult(next);
        }
    }

    public void Reset()
    {
        lock (_lock)
        {
            _responses.Clear();
            _receivedNames.Clear();
            _receivedIds.Clear();
        }
    }
}
