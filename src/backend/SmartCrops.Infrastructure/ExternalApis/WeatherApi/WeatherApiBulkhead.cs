using Microsoft.Extensions.Options;

namespace SmartCrops.Infrastructure.ExternalApis.WeatherApi;

/// <summary>
/// Provider-wide ceiling on WeatherAPI.com calls in flight at once (SMA-336
/// PR 3a/5, review round 1). ONE singleton for the whole process, shared by
/// every request and by both endpoints: what it protects is the deployment's
/// single key, not a request — a caller with many distinct garden locations
/// would otherwise start that many provider calls in the same instant, and a
/// burst from one user would degrade the weather of every other.
///
/// <para>The ceiling is <see cref="WeatherApiOptions.MaxConcurrentCalls"/>. A
/// call past it WAITS for a slot (honouring the caller's cancellation) rather
/// than being refused: every slot frees inside the resilience pipeline's total
/// timeout, so the wait is bounded by it. Not an <c>IHostedService</c>, not a
/// Polly strategy inside the HTTP pipeline (where retries would re-enter it):
/// a semaphore around the whole call, taken before the request and released
/// after the body is read.</para>
/// </summary>
public sealed class WeatherApiBulkhead
{
    private readonly SemaphoreSlim _slots;
    private int _inFlight;

    public WeatherApiBulkhead(IOptions<WeatherApiOptions> options)
    {
        Limit = options.Value.MaxConcurrentCalls;
        _slots = new SemaphoreSlim(Limit, Limit);
    }

    /// <summary>Calls allowed in flight at once — <see cref="WeatherApiOptions.MaxConcurrentCalls"/>.</summary>
    public int Limit { get; }

    /// <summary>Calls holding a slot right now; for diagnostics and tests.</summary>
    public int InFlight => Volatile.Read(ref _inFlight);

    /// <summary>
    /// Takes a slot, waiting for one when all are held. Dispose the lease to
    /// give the slot back — a <c>using</c> around the provider call.
    /// </summary>
    public async Task<Lease> EnterAsync(CancellationToken ct)
    {
        await _slots.WaitAsync(ct);
        Interlocked.Increment(ref _inFlight);
        return new Lease(this);
    }

    private void Exit()
    {
        Interlocked.Decrement(ref _inFlight);
        _slots.Release();
    }

    /// <summary>A held slot; disposing it releases the slot exactly once.</summary>
    public sealed class Lease : IDisposable
    {
        private WeatherApiBulkhead? _owner;

        internal Lease(WeatherApiBulkhead owner) => _owner = owner;

        public void Dispose() => Interlocked.Exchange(ref _owner, null)?.Exit();
    }
}
