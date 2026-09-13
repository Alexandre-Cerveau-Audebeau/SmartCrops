using System.Diagnostics;
using System.Net;
using System.Text;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Internal;
using Microsoft.Extensions.Logging;
using SmartCrops.Api.Tests.ExternalApis.WeatherApi;
using SmartCrops.Api.Tests.Integration;
using SmartCrops.Infrastructure.ExternalApis.WeatherApi;
using SmartCrops.Infrastructure.Weather;

namespace SmartCrops.Api.Tests.Weather;

/// <summary>
/// SMA-336 PR 3a/5 — the cache's MECHANICS, on a service provider of its own
/// (memory cache, the typed client behind a programmable handler, the cache
/// as a singleton), with the handler's call counter as the proof: a fresh
/// entry is reused; two places are two entries; the language is part of the
/// key; two concurrent misses on one place cost ONE call (single-flight per
/// key); a failure after a success serves the last known data with the
/// FIRST instant; a failure is never memorized (the next request tries
/// again); and a failure with nothing known is unavailable.
/// </summary>
public class WeatherForecastCacheTests
{
    /// <summary>
    /// The cache on a provider of its own. <paramref name="logs"/> captures
    /// what it says; <paramref name="clock"/> is the memory cache's own clock
    /// (<c>MemoryCacheOptions.Clock</c>), so a test can make a day pass.
    /// </summary>
    private static (WeatherForecastCache Cache, CountingHandler Handler) Build(
        int maxConcurrentCalls = 4,
        CapturingLoggerProvider? logs = null,
        ISystemClock? clock = null)
    {
        var handler = new CountingHandler();
        var services = new ServiceCollection();
        services.AddLogging(logging =>
        {
            if (logs is not null)
            {
                logging.AddProvider(logs);
            }
        });
        services.AddMemoryCache(options =>
        {
            if (clock is not null)
            {
                options.Clock = clock;
            }
        });
        services.AddOptions<WeatherApiOptions>().Configure(o =>
        {
            o.ApiKey = "test-key-FAKE-DO-NOT-USE";
            o.MaxConcurrentCalls = maxConcurrentCalls;
        });
        services.AddSingleton<WeatherApiBulkhead>();
        services.AddHttpClient<WeatherApiClient>(client => client.BaseAddress = new Uri("https://api.weatherapi.com/v1/"))
            .ConfigurePrimaryHttpMessageHandler(() => handler);
        services.AddSingleton<WeatherForecastCache>();
        var provider = services.BuildServiceProvider();
        return (provider.GetRequiredService<WeatherForecastCache>(), handler);
    }

    [Fact]
    public async Task GetAsync_FreshEntry_IsReusedWithoutCalling()
    {
        var (cache, handler) = Build();

        var first = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        var second = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);

        Assert.Equal(1, handler.Calls);
        Assert.False(first.Stale);
        Assert.False(second.Stale);
        Assert.NotNull(second.Data);
        Assert.Equal(first.Data!.FetchedAtUtc, second.Data!.FetchedAtUtc);
    }

    [Fact]
    public async Task GetAsync_SamePlaceWithinRounding_SharesOneEntry()
    {
        // 45.764 and 45.7612 both round to 45.76: one place, one call.
        var (cache, handler) = Build();

        await cache.GetAsync(45.764, 4.8357, "fr", CancellationToken.None);
        await cache.GetAsync(45.7612, 4.8401, "fr", CancellationToken.None);

        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task GetAsync_TwoPlaces_AreTwoCalls()
    {
        var (cache, handler) = Build();

        await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        await cache.GetAsync(45.9, 6.12, "fr", CancellationToken.None);

        Assert.Equal(2, handler.Calls);
    }

    [Fact]
    public async Task GetAsync_LanguageIsPartOfTheKey()
    {
        var (cache, handler) = Build();

        await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        await cache.GetAsync(45.76, 4.84, "en", CancellationToken.None);

        Assert.Equal(2, handler.Calls);
    }

    [Fact]
    public async Task GetAsync_ConcurrentMissesOnOnePlace_CostOneCall()
    {
        // The provider is held open until BOTH requests are in flight, so the
        // second cannot have found a fresh entry on its first look.
        var (cache, handler) = Build();
        handler.Hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var first = cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        var second = cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        await handler.Started.Task;
        handler.Hold.SetResult();
        var outcomes = await Task.WhenAll(first, second);

        Assert.Equal(1, handler.Calls);
        Assert.All(outcomes, o => Assert.NotNull(o.Data));
        Assert.Equal(outcomes[0].Data!.FetchedAtUtc, outcomes[1].Data!.FetchedAtUtc);
    }

    [Fact]
    public async Task GetAsync_ConcurrentMissesOnOnePlace_ProviderFailing_ShareOneFailure_AndTheNextRequestTriesAgain()
    {
        // Review round 2 (C6): five requests for one cold place while the
        // provider refuses. The winner's answer is EVERYONE'S answer — one
        // call, five identical failures — and nothing is memorized: the
        // request that comes after the wave goes to the provider again.
        var (cache, handler) = Build();
        handler.Respond(HttpStatusCode.Forbidden, "{\"error\":{\"code\":2009,\"message\":\"synthetic\"}}");
        handler.Hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var wave = Enumerable.Range(0, 5)
            .Select(_ => cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None))
            .ToArray();
        await handler.Started.Task;
        // Every chance for the four others to reach the provider — they must not.
        await Task.Delay(200);
        Assert.Equal(1, handler.Calls);

        handler.Hold.SetResult();
        var outcomes = await Task.WhenAll(wave);

        Assert.Equal(1, handler.Calls);
        Assert.All(outcomes, o =>
        {
            Assert.Null(o.Data);
            Assert.False(o.Stale);
            Assert.Equal(WeatherApiFailureKind.Refused, o.Failure!.Kind);
        });

        handler.Respond(HttpStatusCode.OK, WeatherApiFixtures.Forecast);
        var after = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);

        Assert.NotNull(after.Data);
        Assert.False(after.Stale);
        Assert.Equal(2, handler.Calls);
    }

    [Fact]
    public async Task GetAsync_AWaiterThatGivesUp_DoesNotStopTheFlight()
    {
        // A caller queued behind the winner may leave (its token): the
        // refresh it was waiting for goes on and serves the winner.
        var (cache, handler) = Build();
        handler.Hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var winner = cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        await handler.Started.Task;
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => cache.GetAsync(45.76, 4.84, "fr", cts.Token));

        handler.Hold.SetResult();
        var outcome = await winner;

        Assert.NotNull(outcome.Data);
        Assert.Equal(1, handler.Calls);
        Assert.Equal(0, cache.GateCount);
    }

    [Fact]
    public async Task GetAsync_TheCreatorThatGivesUp_LeavesAtOnce_AndTheFlightGoesOn_WithoutADuplicate()
    {
        // Review round 3 (D3): the request that STARTED the refresh leaves
        // (its token) while the provider still holds the answer. It must get
        // a clean OperationCanceledException at once — not the outcome after
        // the pipeline's ten seconds — and the refresh must go on, holding
        // the gate itself: a second request for the same place, arriving
        // while the first is gone and the refresh still runs, joins that
        // refresh instead of starting a second provider call.
        var (cache, handler) = Build();
        handler.Hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var cts = new CancellationTokenSource();

        var creator = cache.GetAsync(45.76, 4.84, "fr", cts.Token);
        await handler.Started.Task;
        var watch = Stopwatch.StartNew();
        cts.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => creator.WaitAsync(TimeSpan.FromSeconds(2)));
        watch.Stop();
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(1), $"the creator left after {watch.Elapsed}");

        var second = cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        // Every chance for a second provider call to start — it must not.
        await Task.Delay(200);
        Assert.Equal(1, handler.Calls);
        Assert.Equal(1, cache.GateCount);

        handler.Hold.SetResult();
        var outcome = await second;

        Assert.NotNull(outcome.Data);
        Assert.False(outcome.Stale);
        Assert.Equal(1, handler.Calls);
        Assert.Equal(0, cache.GateCount);
    }

    [Fact]
    public async Task LastKnown_IsNotRenewedByReads_AndExpiresAfterItsTtl()
    {
        // Review round 2 (C7), under the memory cache's own clock
        // (MemoryCacheOptions.Clock): a success at T0, then a day of hourly
        // reads during an outage. A sliding expiration renewed the last known
        // entry on every read, so a forecast could be served stale for ever
        // under traffic; the entry has an ABSOLUTE age now — stale through
        // the 23rd hour, unavailable from the 24th.
        var clock = new ManualClock(new DateTimeOffset(2026, 9, 13, 12, 0, 0, TimeSpan.Zero));
        var (cache, handler) = Build(clock: clock);
        var first = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        Assert.False(first.Stale);
        handler.Respond(HttpStatusCode.Forbidden, "{\"error\":{\"code\":2009,\"message\":\"synthetic\"}}");

        for (var hour = 1; hour <= 23; hour++)
        {
            clock.Advance(TimeSpan.FromHours(1));
            var outcome = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
            Assert.True(outcome.Stale, $"hour {hour}: expected the last known forecast");
            Assert.Equal(first.Data!.FetchedAtUtc, outcome.Data!.FetchedAtUtc);
        }

        clock.Advance(TimeSpan.FromHours(1));
        var expired = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        Assert.Null(expired.Data);
        Assert.False(expired.Stale);
        Assert.Equal(WeatherApiFailureKind.Refused, expired.Failure!.Kind);

        clock.Advance(TimeSpan.FromHours(1));
        var stillExpired = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        Assert.Null(stillExpired.Data);
        // Every hour tried the provider again: the failure was never memorized.
        Assert.Equal(1 + 25, handler.Calls);
    }

    [Fact]
    public async Task GetAsync_DistinctPlaces_NeverExceedTheProviderWideCeiling()
    {
        // Review round 1 (S3): six cold places at once and a ceiling of two.
        // The handler is held open, so at most two requests can be in flight;
        // the four others must queue for a slot, not burst against the key.
        var (cache, handler) = Build(maxConcurrentCalls: 2);
        handler.Hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var calls = Enumerable.Range(0, 6)
            .Select(i => cache.GetAsync(40 + i, 3.5, "fr", CancellationToken.None))
            .ToArray();
        await handler.WaitForInFlightAsync(2);
        // Every chance for a third call to slip through — it must not.
        await Task.Delay(200);
        Assert.Equal(2, handler.InFlight);
        Assert.Equal(2, handler.Calls);

        handler.Hold.SetResult();
        var outcomes = await Task.WhenAll(calls);

        Assert.Equal(6, handler.Calls);
        Assert.Equal(2, handler.MaxInFlight);
        Assert.Equal(0, handler.InFlight);
        Assert.All(outcomes, o => Assert.NotNull(o.Data));
    }

    [Fact]
    public async Task GetAsync_FailureAfterSuccess_ServesLastKnown_WithTheFirstInstant()
    {
        var (cache, handler) = Build();
        var first = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);

        // The fresh window ends (evicted, as time would; the last known entry
        // stays) and the provider now refuses the call.
        cache.EvictFresh(45.76, 4.84, "fr");
        handler.Respond(HttpStatusCode.Forbidden, "{\"error\":{\"code\":2007,\"message\":\"synthetic\"}}");

        var stale = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);

        Assert.True(stale.Stale);
        Assert.NotNull(stale.Data);
        Assert.Equal(first.Data!.FetchedAtUtc, stale.Data!.FetchedAtUtc);
        Assert.Equal(WeatherApiFailureKind.Refused, stale.Failure!.Kind);
        Assert.Equal(2007, stale.Failure.ProviderCode);
    }

    [Fact]
    public async Task GetAsync_FailureIsNotMemorized_TheNextRequestTriesAgain()
    {
        var (cache, handler) = Build();
        handler.Respond(HttpStatusCode.ServiceUnavailable, "");

        var failed = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        handler.Respond(HttpStatusCode.OK, WeatherApiFixtures.Forecast);
        var recovered = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);

        Assert.Null(failed.Data);
        Assert.Equal(WeatherApiFailureKind.Transport, failed.Failure!.Kind);
        Assert.NotNull(recovered.Data);
        Assert.False(recovered.Stale);
        Assert.Equal(2, handler.Calls);
    }

    [Fact]
    public async Task GetAsync_FailureWithNothingKnown_IsUnavailable()
    {
        var (cache, handler) = Build();
        handler.Respond(HttpStatusCode.Forbidden, "{\"error\":{\"code\":2009,\"message\":\"synthetic\"}}");

        var outcome = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);

        Assert.Null(outcome.Data);
        Assert.False(outcome.Stale);
        Assert.Equal(WeatherApiFailureKind.Refused, outcome.Failure!.Kind);
    }

    [Fact]
    public async Task Gates_AreReleased_OnceNoCallerIsInFlight()
    {
        // Review round 1 (C1): the single-flight gate of a place lives while a
        // caller holds or waits for it, and not one instant longer — five
        // places fetched one after the other leave nothing behind.
        var (cache, handler) = Build();

        for (var i = 0; i < 5; i++)
        {
            await cache.GetAsync(40 + i, 3.5, "fr", CancellationToken.None);
        }

        Assert.Equal(5, handler.Calls);
        Assert.Equal(0, cache.GateCount);
    }

    [Fact]
    public async Task Gates_ExistOnlyWhileACallIsInFlight()
    {
        var (cache, handler) = Build();
        handler.Hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var first = cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        var second = cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        await handler.Started.Task;
        Assert.Equal(1, cache.GateCount);

        handler.Hold.SetResult();
        await Task.WhenAll(first, second);

        Assert.Equal(1, handler.Calls);
        Assert.Equal(0, cache.GateCount);
    }

    [Fact]
    public async Task Warnings_NeverCarryThePlacesCoordinates()
    {
        // Review round 2 (S6): the cache key IS the rounded coordinates, so
        // the two warnings of a failed refresh must name the place some other
        // way — an opaque tag — and carry no digit of latitude or longitude.
        var logs = new CapturingLoggerProvider();
        var (cache, handler) = Build(logs: logs);
        await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);

        // Failed refresh with a last known answer, then one with nothing known.
        cache.EvictFresh(45.76, 4.84, "fr");
        handler.Respond(HttpStatusCode.Forbidden, "{\"error\":{\"code\":2007,\"message\":\"synthetic\"}}");
        var stale = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);
        cache.Evict(45.76, 4.84, "fr");
        var gone = await cache.GetAsync(45.76, 4.84, "fr", CancellationToken.None);

        Assert.True(stale.Stale);
        Assert.Null(gone.Data);
        var warnings = logs.Entries
            .Where(e => e.Category == typeof(WeatherForecastCache).FullName && e.Level == LogLevel.Warning)
            .ToList();
        Assert.Equal(2, warnings.Count);
        Assert.Contains(warnings, w => w.Message.Contains("serving the last known forecast"));
        Assert.Contains(warnings, w => w.Message.Contains("nothing known before"));
        var tag = WeatherLocationKey.ToLogTag(WeatherLocationKey.From(45.76, 4.84));
        Assert.All(warnings, w =>
        {
            Assert.Contains(tag, w.Message);
            Assert.DoesNotContain("45.76", w.Message);
            Assert.DoesNotContain("4.84", w.Message);
            Assert.DoesNotContain("45.7", w.Message);
        });
    }

    [Fact]
    public void LogTag_IsOpaque_StableWithinTheProcess_AndDistinctPerPlace()
    {
        // Review round 2 (S6): the tag reads the same for the same key
        // throughout a run, differs between places, and has the documented
        // opaque shape — « place- » and twelve hexadecimal digits. Opacity is
        // asserted on the coordinates as they are FORMATTED, under either
        // decimal separator: a bare « 45 » can occur in any hexadecimal
        // digest by chance (about one run in twenty-four), so it is not
        // asserted (review round 3, D4).
        var lyon = WeatherLocationKey.ToLogTag(WeatherLocationKey.From(45.76, 4.84));
        var annecy = WeatherLocationKey.ToLogTag(WeatherLocationKey.From(45.9, 6.12));

        Assert.Matches("^place-[0-9a-f]{12}$", lyon);
        Assert.DoesNotContain("45.76", lyon);
        Assert.DoesNotContain("45,76", lyon);
        Assert.DoesNotContain("4.84", lyon);
        Assert.DoesNotContain("4,84", lyon);
        Assert.Equal(lyon, WeatherLocationKey.ToLogTag("45.76,4.84"));
        Assert.NotEqual(lyon, annecy);
    }

    [Fact]
    public void Keys_AreTheDocumentedShape()
    {
        Assert.Equal("weather:fresh:45.76,4.84:fr", WeatherForecastCache.FreshKey(WeatherLocationKey.From(45.764, 4.8357), "fr"));
        Assert.Equal("weather:last:45.76,4.84:fr", WeatherForecastCache.LastKnownKey(WeatherLocationKey.From(45.764, 4.8357), "fr"));
        Assert.Equal(TimeSpan.FromMinutes(15), WeatherForecastCache.FreshTtl);
        Assert.Equal(TimeSpan.FromHours(24), WeatherForecastCache.LastKnownTtl);
    }

    /// <summary>The memory cache's clock, advanced by hand.</summary>
    private sealed class ManualClock(DateTimeOffset start) : ISystemClock
    {
        public DateTimeOffset UtcNow { get; private set; } = start;

        public void Advance(TimeSpan by) => UtcNow += by;
    }

    /// <summary>
    /// Counts calls, answers a configurable body, and can hold the answer until
    /// released so requests can be proven concurrent — and counts how many are
    /// inside it at once, the proof the provider-wide ceiling rests on.
    /// </summary>
    private sealed class CountingHandler : HttpMessageHandler
    {
        private HttpStatusCode _status = HttpStatusCode.OK;
        private string _body = WeatherApiFixtures.Forecast;
        private int _calls;
        private int _inFlight;
        private int _maxInFlight;

        public int Calls => Volatile.Read(ref _calls);

        /// <summary>Requests inside the handler right now.</summary>
        public int InFlight => Volatile.Read(ref _inFlight);

        /// <summary>The most requests ever inside the handler at once.</summary>
        public int MaxInFlight => Volatile.Read(ref _maxInFlight);

        public TaskCompletionSource? Hold { get; set; }

        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void Respond(HttpStatusCode status, string body)
        {
            _status = status;
            _body = body;
        }

        /// <summary>Waits until at least <paramref name="count"/> requests are inside the handler (five seconds at most).</summary>
        public async Task WaitForInFlightAsync(int count)
        {
            var deadline = DateTime.UtcNow.AddSeconds(5);
            while (InFlight < count)
            {
                if (DateTime.UtcNow > deadline)
                {
                    throw new TimeoutException($"Expected {count} requests in flight, saw {InFlight}");
                }

                await Task.Delay(10);
            }
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref _calls);
            var now = Interlocked.Increment(ref _inFlight);
            int seen;
            while ((seen = Volatile.Read(ref _maxInFlight)) < now
                   && Interlocked.CompareExchange(ref _maxInFlight, now, seen) != seen)
            {
            }

            try
            {
                Started.TrySetResult();
                if (Hold is { } hold)
                {
                    await hold.Task;
                }

                return new HttpResponseMessage(_status)
                {
                    Content = new StringContent(_body, Encoding.UTF8, "application/json"),
                };
            }
            finally
            {
                Interlocked.Decrement(ref _inFlight);
            }
        }
    }
}
