using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Test-only <see cref="IPlantTrefleEnrichmentService"/> that returns pre-loaded
/// <see cref="TrefleEnrichmentResult"/> values in FIFO order. Mirrors the GBIF
/// taxonomy stub: tests enqueue canned responses via <see cref="Enqueue"/> and
/// inspect captured calls via <see cref="ReceivedNames"/>;
/// <see cref="IntegrationTestBase.InitializeAsync"/> calls <see cref="Reset"/>
/// after Respawn so each test starts from a clean queue.
///
/// <para>Registered as a Singleton in <see cref="PostgresFixture"/> so the
/// in-memory queue survives the per-request <c>IPlantTrefleEnrichmentService</c>
/// scope resolution.</para>
/// </summary>
public sealed class StubPlantTrefleEnrichmentService : IPlantTrefleEnrichmentService
{
    private readonly object _lock = new();
    private readonly Queue<TrefleEnrichmentResult> _responses = new();
    private readonly List<string> _received = [];

    public IReadOnlyList<string> ReceivedNames
    {
        get
        {
            lock (_lock)
            {
                return _received.ToArray();
            }
        }
    }

    /// <summary>Enqueue one response to be returned by the next call.</summary>
    public void Enqueue(TrefleEnrichmentResult result)
    {
        lock (_lock)
        {
            _responses.Enqueue(result);
        }
    }

    /// <summary>Enqueue a NONE result (no Trefle id) for the next call.</summary>
    public void EnqueueNoMatch() => Enqueue(NoMatch());

    public static TrefleEnrichmentResult NoMatch() => new(
        TrefleId: null,
        TrefleSlug: null,
        WfoId: null,
        CanonicalName: null,
        RawResponseJson: string.Empty,
        GrowthHabit: null,
        IsEdible: null,
        IsVegetable: null,
        LightLevel: null,
        SoilPhMin: null,
        SoilPhMax: null,
        MinTempC: null,
        MaxTempC: null,
        SoilNutriments: null,
        FlowerColorsJson: null,
        FoliageColorsJson: null,
        NativeRegionsJson: null,
        IntroducedRegionsJson: null,
        Images: Array.Empty<TrefleImage>(),
        CommonNames: Array.Empty<TrefleCommonName>(),
        Synonyms: Array.Empty<TrefleSynonym>(),
        MatchType: "NONE");

    public Task<TrefleEnrichmentResult> ResolveAsync(string scientificName, CancellationToken ct)
    {
        lock (_lock)
        {
            _received.Add(scientificName);
            // Default to NONE if nothing queued so tests that forget to enqueue
            // get a deterministic outcome rather than blocking on a null.
            var next = _responses.Count > 0 ? _responses.Dequeue() : NoMatch();
            return Task.FromResult(next);
        }
    }

    public void Reset()
    {
        lock (_lock)
        {
            _responses.Clear();
            _received.Clear();
        }
    }
}
