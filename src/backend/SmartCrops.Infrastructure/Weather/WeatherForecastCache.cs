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
///   <item><b>last known</b> — ABSOLUTE TTL of <see cref="LastKnownTtl"/>
///   (60 minutes: the entry holds the whole answer, current conditions
///   included, and the terms cap the caching of current conditions at 60
///   minutes — SMA-387), counted from the success that wrote it, rewritten
///   on every success and read ONLY when a refresh fails: the answer is then
///   the last weather known, flagged stale with its own instant. Reading it
///   never extends it (review round 2, C7): a sliding window would have been
///   renewed by every failed refresh, and under steady traffic during an
///   outage a forecast could have been served stale for ever.</item>
/// </list>
///
/// <para><b>Single-flight per key: one call per wave, one outcome for the
/// wave.</b> Every request that misses the fresh entry goes through one gate
/// for THAT place. The first one in — the winner — STARTS the refresh; it
/// and everyone who arrives while that refresh is in flight await the SAME
/// task and receive the SAME outcome, success or failure (review round 2,
/// C6). A global gate — the shape the catalog count uses — would serialize
/// every user behind a network call of several seconds, so the gate is per
/// key.</para>
///
/// <para><b>The refresh finishes alone; the wait is each caller's own.</b>
/// Two lifetimes, kept apart (review round 3, D3). The REFRESH runs detached
/// from the request that started it — on <see cref="CancellationToken.None"/>,
/// in a service scope of its own, holding the gate itself until it ends — so
/// the browser that started it may leave and the answer still serves
/// everyone behind it, and no request arriving meanwhile can start a second
/// call for the same place: the gate it would need is still held by the
/// refresh in flight. The WAIT, on the other hand, is every caller's own,
/// the winner's included: a request whose token is cancelled leaves at once
/// with <see cref="OperationCanceledException"/>, not when the provider's
/// pipeline gives up, and takes only itself. A gate lives exactly as long as
/// someone holds it — a caller inside or waiting, or the refresh in flight —
/// and the last one out removes it, so the gate set never outgrows the
/// places being refreshed right now.</para>
///
/// <para><b>The wave shares a failure; the cache never keeps one.</b> Nothing
/// is written on a failed refresh. The callers already waiting on the gate
/// receive the failure the winner got — one provider call for the whole wave,
/// not one per waiter — and the NEXT request, the one that arrives after the
/// wave, tries the provider again. A dead provider therefore costs one call
/// per place per wave, and the weather is back the instant the provider is.
/// No entry carries a <c>Size</c>: the shared <see cref="IMemoryCache"/> has
/// no size limit, and setting one would make every other entry require a
/// size too.</para>
///
/// <para>PER PROCESS, like the catalog count: lost on restart, not shared
/// between instances. The intended trade for a widget behind a 15-minute
/// window.</para>
/// </summary>
public sealed class WeatherForecastCache
{
    /// <summary>How long a forecast is reused before the provider is asked again.</summary>
    public static readonly TimeSpan FreshTtl = TimeSpan.FromMinutes(15);

    /// <summary>
    /// How long the last successful answer is kept for a failed refresh,
    /// counted from that success: 60 minutes, because the entry keeps the
    /// whole forecast.json answer, current conditions included, and the
    /// WeatherAPI.com terms of service cap the caching of current conditions
    /// at 60 minutes (https://www.weatherapi.com/terms.aspx, section "API";
    /// SMA-387).
    /// </summary>
    public static readonly TimeSpan LastKnownTtl = TimeSpan.FromMinutes(60);

    private readonly IMemoryCache _cache;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<WeatherForecastCache> _logger;

    // One gate per fresh key, held only while a caller is inside or waiting,
    // or a refresh is in flight (review round 1, C1; round 3, D3). The key
    // set is the users' stored places — not a fixed catalogue — so a gate
    // that outlived its holders would let this dictionary grow for the life
    // of the process. A holder counts its holders — the callers, plus one
    // for the refresh in flight, which must keep the gate after every caller
    // has left or a newcomer would start a second call; the last one out
    // retires it and removes it, comparing the holder itself so a caller
    // that just took a NEW holder for the same key is never dropped. Chosen
    // over a gate stored in the cache entry: an IMemoryCache entry can expire
    // while a refresh holds its gate, and two GetOrCreate calls can race into
    // two gates — either breaks single-flight for exactly the wave it exists
    // to coalesce.
    private readonly ConcurrentDictionary<string, Gate> _gates = new();

    private sealed class Gate
    {
        /// <summary>Holders: callers inside or waiting, plus one for the refresh in flight; −1 once retired.</summary>
        public int Callers;

        /// <summary>
        /// The refresh in flight for this key, whose outcome every caller of
        /// the wave receives (review round 2, C6); null between waves. Guarded
        /// by the lock on the gate.
        /// </summary>
        public TaskCompletionSource<WeatherFetchOutcome>? Flight;
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
    /// <param name="ct">The CALLER's token — honoured while waiting for the wave's outcome, by the request that started the refresh too; never handed to the provider call.</param>
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
            TaskCompletionSource<WeatherFetchOutcome>? started = null;
            Task<WeatherFetchOutcome> shared;
            lock (gate)
            {
                if (gate.Flight is null)
                {
                    // We are the winner: the refresh is ours to START. The
                    // flight takes a hold on the gate of its own, given back
                    // when the refresh ends — not when we leave (D3).
                    started = new TaskCompletionSource<WeatherFetchOutcome>(TaskCreationOptions.RunContinuationsAsynchronously);
                    gate.Flight = started;
                    gate.Callers++;
                }

                shared = gate.Flight.Task;
            }

            if (started is not null)
            {
                // Detached on purpose: the refresh depends neither on this
                // request's token nor on its staying. It never throws — its
                // outcome or its exception goes to the flight, and the flight
                // gives the gate back itself.
                _ = FlyAsync(gate, started, freshKey, lastKnownKey, locationKey, latitude, longitude, language);
            }

            // Winner or not, the wave's outcome is ours — and the wait is on
            // OUR token: a caller that gives up leaves here, at once, and
            // takes only itself.
            return await shared.WaitAsync(ct);
        }
        finally
        {
            Release(freshKey, gate);
        }
    }

    /// <summary>
    /// The refresh in flight for a gate, as a task of its own: runs
    /// <see cref="RefreshAsync"/> to the end whatever the callers do, then
    /// closes the wave and gives the gate back, then hands the outcome — or
    /// the exception — to every caller of the wave. The wave is closed
    /// (<see cref="Gate.Flight"/> cleared) BEFORE the outcome is published,
    /// so a request that arrives after it starts a refresh of its own.
    /// </summary>
    private async Task FlyAsync(
        Gate gate,
        TaskCompletionSource<WeatherFetchOutcome> flight,
        string freshKey,
        string lastKnownKey,
        string locationKey,
        double latitude,
        double longitude,
        string language)
    {
        WeatherFetchOutcome? outcome = null;
        Exception? failure = null;
        try
        {
            outcome = await RefreshAsync(freshKey, lastKnownKey, locationKey, latitude, longitude, language);
        }
        catch (Exception ex)
        {
            failure = ex;
        }

        lock (gate)
        {
            gate.Flight = null;
        }

        // The flight's own hold on the gate (taken when it was started): with
        // every caller gone, this is what kept a newcomer from starting a
        // second call for the same place while this one was in flight.
        Release(freshKey, gate);

        if (failure is null)
        {
            flight.SetResult(outcome!);
        }
        else
        {
            flight.SetException(failure);
        }
    }

    /// <summary>
    /// The winner's work: a second look at the fresh entry (a wave that just
    /// ended may have written it), else the provider call, then the two
    /// entries on success, the last known answer or nothing on failure.
    /// </summary>
    private async Task<WeatherFetchOutcome> RefreshAsync(
        string freshKey,
        string lastKnownKey,
        string locationKey,
        double latitude,
        double longitude,
        string language)
    {
        if (_cache.TryGetValue(freshKey, out CachedForecast? fresh) && fresh is not null)
        {
            return WeatherFetchOutcome.Fresh(fresh);
        }

        var result = await FetchAsync(latitude, longitude, language);

        if (result.IsSuccess)
        {
            var entry = new CachedForecast(result.Value, DateTime.UtcNow);
            _cache.Set(freshKey, entry, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = FreshTtl });
            // Absolute, not sliding (review round 2, C7): the age of the last
            // known forecast is counted from the success that wrote it, and
            // reading it during an outage never extends it.
            _cache.Set(lastKnownKey, entry, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = LastKnownTtl });
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
    /// One holder fewer — a caller leaving, or the refresh in flight ending;
    /// the last one retires the gate and removes it — by value, so a newer
    /// gate under the same key is left alone.
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
    /// when its own browser gives up. Bounded by the client's own end-to-end
    /// deadline, which covers its wait for a slot and the resilience pipeline
    /// together (review round 3, D2).
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
