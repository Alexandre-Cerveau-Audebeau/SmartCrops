using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SmartCrops.Infrastructure.ExternalApis.WeatherApi;

namespace SmartCrops.Infrastructure.Weather;

/// <summary>A forecast the provider answered, and when.</summary>
/// <param name="Forecast">The provider's answer, as bound.</param>
/// <param name="FetchedAtUtc">The instant of the call that produced it (ADR-0001).</param>
public sealed record CachedForecast(WeatherApiForecastResponse Forecast, DateTime FetchedAtUtc);

/// <summary>
/// What the cache hands back for a place: fresh data, the LAST KNOWN data
/// when the provider just failed, or nothing at all — with the failure that
/// explains the last two.
/// </summary>
/// <param name="Data">The forecast to show, or null when there is none to show.</param>
/// <param name="Stale">True when <paramref name="Data"/> predates a failed refresh.</param>
/// <param name="Failure">The failure of the refresh, when one failed.</param>
public sealed record WeatherFetchOutcome(CachedForecast? Data, bool Stale, WeatherApiFailure? Failure)
{
    public static WeatherFetchOutcome Fresh(CachedForecast data) => new(data, false, null);

    public static WeatherFetchOutcome StaleFrom(CachedForecast data, WeatherApiFailure failure) => new(data, true, failure);

    public static WeatherFetchOutcome Unavailable(WeatherApiFailure failure) => new(null, false, failure);
}

/// <summary>
/// SMA-336 PR 3a/5 — the in-process forecast cache in front of
/// <see cref="WeatherApiClient"/>. One singleton, two entries per place and
/// language:
/// <list type="bullet">
///   <item><b>fresh</b> — absolute TTL of <see cref="FreshTtl"/> (15 minutes:
///   the provider itself refreshes every 10 to 15, and its terms allow up to
///   60 for current conditions);</item>
///   <item><b>last known</b> — sliding TTL of <see cref="LastKnownTtl"/>
///   (24 hours, the terms' ceiling for a forecast), rewritten on every
///   success and read ONLY when a refresh fails: the answer is then the last
///   weather known, flagged stale with its own instant.</item>
/// </list>
///
/// <para><b>Single-flight per key.</b> Every request that misses the fresh
/// entry queues behind one gate for THAT place; the winner calls the
/// provider, the others find its answer on the second look. A global gate —
/// the shape the catalog count uses — would serialize every user behind a
/// network call of several seconds, so the gate is per key. The winner's
/// call runs on <see cref="CancellationToken.None"/> with its own service
/// scope: the browser that started it may leave, the answer still serves
/// everyone queued behind it. A gate lives exactly as long as its callers —
/// the last one out removes it — so the gate set never outgrows the places
/// being refreshed right now.</para>
///
/// <para><b>A failure is never memorized.</b> Nothing is written on a failed
/// refresh, so the next request tries the provider again — through the same
/// gate, so a dead provider costs one call per place per request wave, not
/// per request. No entry carries a <c>Size</c>: the shared
/// <see cref="IMemoryCache"/> has no size limit, and setting one would make
/// every other entry require a size too.</para>
///
/// <para>PER PROCESS, like the catalog count: lost on restart, not shared
/// between instances. The intended trade for a widget behind a 15-minute
/// window.</para>
/// </summary>
public sealed class WeatherForecastCache
{
    /// <summary>How long a forecast is reused before the provider is asked again.</summary>
    public static readonly TimeSpan FreshTtl = TimeSpan.FromMinutes(15);

    /// <summary>How long the last successful answer is kept for a failed refresh.</summary>
    public static readonly TimeSpan LastKnownTtl = TimeSpan.FromHours(24);

    private readonly IMemoryCache _cache;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<WeatherForecastCache> _logger;

    // One gate per fresh key, held only while a caller is inside or waiting
    // (review round 1, C1). The key set is the users' stored places — not a
    // fixed catalogue — so a gate that outlived its callers would let this
    // dictionary grow for the life of the process. A holder counts its
    // callers; the last one out retires it and removes it, comparing the
    // holder itself so a caller that just took a NEW holder for the same key
    // is never dropped. Chosen over a gate stored in the cache entry: an
    // IMemoryCache entry can expire while a refresh holds its gate, and two
    // GetOrCreate calls can race into two gates — either breaks single-flight
    // for exactly the wave it exists to coalesce.
    private readonly ConcurrentDictionary<string, Gate> _gates = new();

    private sealed class Gate
    {
        public readonly SemaphoreSlim Slot = new(1, 1);

        /// <summary>Callers inside or waiting; −1 once retired.</summary>
        public int Callers;
    }

    public WeatherForecastCache(
        IMemoryCache cache,
        IServiceScopeFactory scopes,
        ILogger<WeatherForecastCache> logger)
    {
        _cache = cache;
        _scopes = scopes;
        _logger = logger;
    }

    /// <summary>Single-flight gates currently held in memory; for the test that pins their lifetime.</summary>
    internal int GateCount => _gates.Count;

    /// <summary>Cache key of the fresh entry for a place and a language.</summary>
    internal static string FreshKey(string locationKey, string language) => $"weather:fresh:{locationKey}:{language}";

    /// <summary>Cache key of the last-known entry for a place and a language.</summary>
    internal static string LastKnownKey(string locationKey, string language) => $"weather:last:{locationKey}:{language}";

    /// <summary>
    /// The forecast for a place, from the cache when fresh, else from the
    /// provider — else the last known answer, else nothing.
    /// </summary>
    /// <param name="latitude">Exact latitude of the place asked for.</param>
    /// <param name="longitude">Exact longitude of the place asked for.</param>
    /// <param name="language">The <c>lang=</c> of the condition texts; part of the key.</param>
    /// <param name="ct">The CALLER's token — honoured while waiting for the gate, never handed to the provider call.</param>
    public async Task<WeatherFetchOutcome> GetAsync(
        double latitude,
        double longitude,
        string language,
        CancellationToken ct)
    {
        var locationKey = WeatherLocationKey.From(latitude, longitude);
        var freshKey = FreshKey(locationKey, language);
        var lastKnownKey = LastKnownKey(locationKey, language);

        if (_cache.TryGetValue(freshKey, out CachedForecast? fresh) && fresh is not null)
        {
            return WeatherFetchOutcome.Fresh(fresh);
        }

        var gate = Acquire(freshKey);
        try
        {
            await gate.Slot.WaitAsync(ct);
            try
            {
                // The waiter that queued behind the winner finds the value here and
                // never reaches the provider — the load-bearing second look.
                if (_cache.TryGetValue(freshKey, out fresh) && fresh is not null)
                {
                    return WeatherFetchOutcome.Fresh(fresh);
                }

                var result = await FetchAsync(latitude, longitude, language);

                if (result.IsSuccess)
                {
                    var entry = new CachedForecast(result.Value, DateTime.UtcNow);
                    _cache.Set(freshKey, entry, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = FreshTtl });
                    _cache.Set(lastKnownKey, entry, new MemoryCacheEntryOptions { SlidingExpiration = LastKnownTtl });
                    return WeatherFetchOutcome.Fresh(entry);
                }

                // The key is the rounded coordinates, so a log line names the
                // place by an opaque tag instead (review round 2, S6).
                var placeTag = WeatherLocationKey.ToLogTag(locationKey);

                if (_cache.TryGetValue(lastKnownKey, out CachedForecast? lastKnown) && lastKnown is not null)
                {
                    _logger.LogWarning(
                        "Weather refresh failed for {PlaceTag} ({Kind}, code {Code}); serving the last known forecast from {FetchedAt:O}",
                        placeTag, result.Failure.Kind, result.Failure.ProviderCode, lastKnown.FetchedAtUtc);
                    return WeatherFetchOutcome.StaleFrom(lastKnown, result.Failure);
                }

                _logger.LogWarning(
                    "Weather unavailable for {PlaceTag} ({Kind}, code {Code}) and nothing known before",
                    placeTag, result.Failure.Kind, result.Failure.ProviderCode);
                return WeatherFetchOutcome.Unavailable(result.Failure);
            }
            finally
            {
                gate.Slot.Release();
            }
        }
        finally
        {
            Release(freshKey, gate);
        }
    }

    /// <summary>
    /// The gate of a key, counted as one more caller. A holder the last caller
    /// retired between our lookup and our lock is skipped: the loop asks the
    /// dictionary again and gets a fresh one.
    /// </summary>
    private Gate Acquire(string key)
    {
        while (true)
        {
            var gate = _gates.GetOrAdd(key, _ => new Gate());
            lock (gate)
            {
                if (gate.Callers >= 0)
                {
                    gate.Callers++;
                    return gate;
                }
            }
        }
    }

    /// <summary>
    /// One caller fewer; the last one retires the holder and removes it — by
    /// value, so a newer holder under the same key is left alone.
    /// </summary>
    private void Release(string key, Gate gate)
    {
        lock (gate)
        {
            if (--gate.Callers > 0)
            {
                return;
            }

            gate.Callers = -1;
            _gates.TryRemove(new KeyValuePair<string, Gate>(key, gate));
            gate.Slot.Dispose();
        }
    }

    /// <summary>
    /// Drops both entries of a place and a language. For tests, which share
    /// one cache across the whole collection and must own the window they
    /// assert on.
    /// </summary>
    internal void Evict(double latitude, double longitude, string language)
    {
        var locationKey = WeatherLocationKey.From(latitude, longitude);
        _cache.Remove(FreshKey(locationKey, language));
        _cache.Remove(LastKnownKey(locationKey, language));
    }

    /// <summary>
    /// Drops the fresh entry only — what the 15-minute window does on its own.
    /// For tests that need « the window has passed, the last known data has
    /// not » without waiting fifteen minutes.
    /// </summary>
    internal void EvictFresh(double latitude, double longitude, string language)
        => _cache.Remove(FreshKey(WeatherLocationKey.From(latitude, longitude), language));

    /// <summary>
    /// The provider call, in a scope of its own and on no cancellation token:
    /// the typed client's <see cref="HttpClient"/> is a scoped dependency, and
    /// the request that won the gate must not take the answer down with it
    /// when its own browser gives up. Bounded by the resilience pipeline.
    /// </summary>
    private async Task<WeatherApiResult<WeatherApiForecastResponse>> FetchAsync(
        double latitude,
        double longitude,
        string language)
    {
        using var scope = _scopes.CreateScope();
        var client = scope.ServiceProvider.GetRequiredService<WeatherApiClient>();
        return await client.ForecastAsync(latitude, longitude, language, CancellationToken.None);
    }
}
