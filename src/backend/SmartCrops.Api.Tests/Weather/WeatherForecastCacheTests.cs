using System.Net;
using System.Text;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.Tests.ExternalApis.WeatherApi;
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
    private static (WeatherForecastCache Cache, CountingHandler Handler) Build(int maxConcurrentCalls = 4)
    {
        var handler = new CountingHandler();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddMemoryCache();
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
    public void Keys_AreTheDocumentedShape()
    {
        Assert.Equal("weather:fresh:45.76,4.84:fr", WeatherForecastCache.FreshKey(WeatherLocationKey.From(45.764, 4.8357), "fr"));
        Assert.Equal("weather:last:45.76,4.84:fr", WeatherForecastCache.LastKnownKey(WeatherLocationKey.From(45.764, 4.8357), "fr"));
        Assert.Equal(TimeSpan.FromMinutes(15), WeatherForecastCache.FreshTtl);
        Assert.Equal(TimeSpan.FromHours(24), WeatherForecastCache.LastKnownTtl);
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
