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
/// everyone queued behind it.</para>
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

    // One gate per fresh key. Bounded by the number of distinct places the
    // process has seen; a gate is a few dozen bytes and is never contended
    // outside a refresh, so nothing evicts it.
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _gates = new();

    public WeatherForecastCache(
        IMemoryCache cache,
        IServiceScopeFactory scopes,
        ILogger<WeatherForecastCache> logger)
    {
        _cache = cache;
        _scopes = scopes;
        _logger = logger;
    }

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

        var gate = _gates.GetOrAdd(freshKey, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
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

            if (_cache.TryGetValue(lastKnownKey, out CachedForecast? lastKnown) && lastKnown is not null)
            {
                _logger.LogWarning(
                    "Weather refresh failed for {LocationKey} ({Kind}, code {Code}); serving the last known forecast from {FetchedAt:O}",
                    locationKey, result.Failure.Kind, result.Failure.ProviderCode, lastKnown.FetchedAtUtc);
                return WeatherFetchOutcome.StaleFrom(lastKnown, result.Failure);
            }

            _logger.LogWarning(
                "Weather unavailable for {LocationKey} ({Kind}, code {Code}) and nothing known before",
                locationKey, result.Failure.Kind, result.Failure.ProviderCode);
            return WeatherFetchOutcome.Unavailable(result.Failure);
        }
        finally
        {
            gate.Release();
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
