using Microsoft.Extensions.Options;
using SmartCrops.Infrastructure.ExternalApis.WeatherApi;

namespace SmartCrops.Api.Tests.ExternalApis.WeatherApi;

/// <summary>
/// SMA-336 PR 3a/5, review round 2 (S4) — the bulkhead's admission rules on
/// their own, without a client: up to the ceiling at once, up to the queue's
/// depth waiting, and a refusal — a value, never an exception — past that.
/// The wait's expiry is proven with the client
/// (<c>WeatherApiClientTests.ForecastAsync_QueuedPastTheWaitBudget_…</c>).
/// </summary>
public class WeatherApiBulkheadTests
{
    private static WeatherApiBulkhead Build(int maxConcurrentCalls)
        => new(Options.Create(new WeatherApiOptions { MaxConcurrentCalls = maxConcurrentCalls }));

    [Fact]
    public void Bounds_AreTheDocumentedShape()
    {
        var bulkhead = Build(4);

        Assert.Equal(4, bulkhead.Limit);
        Assert.Equal(2, WeatherApiBulkhead.QueueDepthPerSlot);
        Assert.Equal(8, bulkhead.QueueCapacity);
        Assert.Equal(TimeSpan.FromSeconds(WeatherApiOptions.PipelineTotalTimeoutSeconds), WeatherApiBulkhead.QueueWait);
        Assert.Equal(TimeSpan.FromSeconds(10), WeatherApiBulkhead.QueueWait);
    }

    [Fact]
    public async Task EnterAsync_AdmitsUpToTheCeiling_QueuesUpToTheDepth_ThenRefusesOnTheSpot()
    {
        var bulkhead = Build(2);

        // Two slots, taken at once.
        var first = await bulkhead.EnterAsync(CancellationToken.None);
        var second = await bulkhead.EnterAsync(CancellationToken.None);
        Assert.True(first.Admitted);
        Assert.True(second.Admitted);
        Assert.Equal(2, bulkhead.InFlight);

        // Four may wait — none of them is answered yet.
        var waiting = Enumerable.Range(0, 4)
            .Select(_ => bulkhead.EnterAsync(CancellationToken.None))
            .ToArray();
        Assert.All(waiting, w => Assert.False(w.IsCompleted));
        Assert.Equal(4, bulkhead.Waiting);

        // The seventh is refused at once, and the queue is untouched by it.
        var seventh = await bulkhead.EnterAsync(CancellationToken.None);
        Assert.False(seventh.Admitted);
        Assert.Equal(BulkheadRefusal.QueueFull, seventh.Refusal);
        Assert.Equal(4, bulkhead.Waiting);
        Assert.Equal(2, bulkhead.InFlight);

        // A slot given back admits exactly one waiter.
        first.Dispose();
        var admitted = await Task.WhenAny(waiting);
        Assert.True((await admitted).Admitted);
        Assert.Equal(2, bulkhead.InFlight);
        Assert.Equal(3, bulkhead.Waiting);

        // Everything released, each slot given back as soon as it is held:
        // every waiter gets its turn, nothing is left behind.
        second.Dispose();
        (await admitted).Dispose();
        var pending = waiting.Where(w => !ReferenceEquals(w, admitted)).ToList();
        while (pending.Count > 0)
        {
            var next = await Task.WhenAny(pending);
            pending.Remove(next);
            var lease = await next;
            Assert.True(lease.Admitted);
            lease.Dispose();
        }

        Assert.Equal(0, bulkhead.InFlight);
        Assert.Equal(0, bulkhead.Waiting);
    }

    [Fact]
    public async Task Dispose_OfARefusedLease_ReleasesNothing()
    {
        // A refusal holds no slot: disposing it must not give one back (a
        // SemaphoreSlim released past its ceiling would throw). Ceiling one,
        // queue two: the fourth call is the refused one.
        var bulkhead = Build(1);
        var held = await bulkhead.EnterAsync(CancellationToken.None);
        var queued = new[]
        {
            bulkhead.EnterAsync(CancellationToken.None),
            bulkhead.EnterAsync(CancellationToken.None),
        };
        var refused = await bulkhead.EnterAsync(CancellationToken.None);
        Assert.Equal(BulkheadRefusal.QueueFull, refused.Refusal);

        refused.Dispose();
        refused.Dispose();

        Assert.Equal(1, bulkhead.InFlight);
        Assert.Equal(2, bulkhead.Waiting);
        Assert.All(queued, q => Assert.False(q.IsCompleted));

        held.Dispose();
        var pending = queued.ToList();
        while (pending.Count > 0)
        {
            var next = await Task.WhenAny(pending);
            pending.Remove(next);
            var lease = await next;
            Assert.True(lease.Admitted);
            lease.Dispose();
        }

        Assert.Equal(0, bulkhead.InFlight);
        Assert.Equal(0, bulkhead.Waiting);
    }

    [Fact]
    public async Task EnterAsync_HonoursTheCallersToken_WhileWaiting()
    {
        // The geocode path waits on the caller's token: a browser that leaves
        // takes its place in the queue with it, and the queue shrinks.
        var bulkhead = Build(1);
        var held = await bulkhead.EnterAsync(CancellationToken.None);
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => bulkhead.EnterAsync(cts.Token));

        Assert.Equal(0, bulkhead.Waiting);
        Assert.Equal(1, bulkhead.InFlight);
        held.Dispose();
    }
}
