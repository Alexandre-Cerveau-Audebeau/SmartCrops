using Microsoft.Extensions.Options;

namespace SmartCrops.Infrastructure.ExternalApis.WeatherApi;

/// <summary>Why the bulkhead did not admit a call — <see cref="BulkheadRefusal.None"/> when it did.</summary>
public enum BulkheadRefusal
{
    /// <summary>Admitted: the lease holds a slot.</summary>
    None,

    /// <summary>Every slot was held and the queue was already full: refused on the spot, no wait.</summary>
    QueueFull,

    /// <summary>The call waited its whole budget (<see cref="WeatherApiBulkhead.QueueWait"/>) and no slot freed.</summary>
    WaitExpired,
}

/// <summary>
/// Provider-wide ceiling on WeatherAPI.com calls in flight at once (SMA-336
/// PR 3a/5, review rounds 1 and 2). ONE singleton for the whole process,
/// shared by every request and by both endpoints: what it protects is the
/// deployment's single key, not a request — a caller with many distinct
/// garden locations would otherwise start that many provider calls in the
/// same instant, and a burst from one user would degrade the weather of
/// every other.
///
/// <para>The ceiling is <see cref="WeatherApiOptions.MaxConcurrentCalls"/>. A
/// call past it WAITS for a slot rather than being refused — but the wait is
/// bounded twice over (review round 2, S4). At most
/// <see cref="QueueDepthPerSlot"/> × ceiling calls may wait at once: a fuller
/// queue is refused on the spot. And no call waits longer than
/// <see cref="QueueWait"/>, the resilience pipeline's total budget: the wait
/// sits BEFORE the HTTP pipeline, outside its timeouts, and the dashboard path
/// hands the client no cancellation token (a refresh must outlive the browser
/// that started it), so without this bound a cold burst of distinct places
/// would queue work for the life of the process. A refusal, either way, is a
/// RESULT — <see cref="Lease.Refusal"/>, classified <c>Transport</c> by the
/// client — never an exception. The wait is counted, besides, against the
/// call's end-to-end deadline (<see cref="WeatherApiOptions.CallDeadlineSeconds"/>,
/// held by the client, review round 3, D2): a slot freed late followed by a
/// stalled provider cannot stack the two budgets past the browser's.</para>
///
/// <para>Not an <c>IHostedService</c>, not a Polly strategy inside the HTTP
/// pipeline (where retries would re-enter it): a semaphore around the whole
/// call, taken before the request and released after the body is read.</para>
/// </summary>
public sealed class WeatherApiBulkhead
{
    /// <summary>
    /// Calls allowed to WAIT for a slot, per slot: the queue holds at most this
    /// many times the ceiling. Two: a dashboard with three times the ceiling
    /// in distinct places still gets every one of them served, in waves; a
    /// burst past that is answered unavailable at once rather than queued.
    /// </summary>
    public const int QueueDepthPerSlot = 2;

    /// <summary>
    /// Longest a call waits for a slot on its own — the pipeline's total
    /// budget (<see cref="WeatherApiOptions.PipelineTotalTimeoutSeconds"/>):
    /// a call that never gets a slot costs its caller no more than a stalled
    /// provider would. The wait and the call that follows it share ONE
    /// deadline besides, <see cref="WeatherApiOptions.CallDeadlineSeconds"/>,
    /// held by the client: a late admission does not buy the provider a
    /// second full budget (review round 3, D2).
    /// </summary>
    public static readonly TimeSpan QueueWait = TimeSpan.FromSeconds(WeatherApiOptions.PipelineTotalTimeoutSeconds);

    private readonly SemaphoreSlim _slots;
    private int _inFlight;
    private int _waiting;

    public WeatherApiBulkhead(IOptions<WeatherApiOptions> options)
    {
        Limit = options.Value.MaxConcurrentCalls;
        QueueCapacity = Limit * QueueDepthPerSlot;
        _slots = new SemaphoreSlim(Limit, Limit);
    }

    /// <summary>Calls allowed in flight at once — <see cref="WeatherApiOptions.MaxConcurrentCalls"/>.</summary>
    public int Limit { get; }

    /// <summary>Calls allowed to wait for a slot at once — <see cref="Limit"/> × <see cref="QueueDepthPerSlot"/>.</summary>
    public int QueueCapacity { get; }

    /// <summary>Calls holding a slot right now; for diagnostics and tests.</summary>
    public int InFlight => Volatile.Read(ref _inFlight);

    /// <summary>Calls waiting for a slot right now; for diagnostics and tests.</summary>
    public int Waiting => Volatile.Read(ref _waiting);

    /// <summary>
    /// Asks for a slot: taken at once when one is free, waited for (up to
    /// <see cref="QueueWait"/>, honouring <paramref name="ct"/>) when the queue
    /// has room, refused otherwise. Read <see cref="Lease.Admitted"/> before
    /// calling the provider; dispose the lease to give the slot back — a
    /// <c>using</c> around the provider call. Disposing a refused lease does
    /// nothing.
    /// </summary>
    public async Task<Lease> EnterAsync(CancellationToken ct)
    {
        if (_slots.Wait(0))
        {
            Interlocked.Increment(ref _inFlight);
            return new Lease(this);
        }

        if (Interlocked.Increment(ref _waiting) > QueueCapacity)
        {
            Interlocked.Decrement(ref _waiting);
            return new Lease(BulkheadRefusal.QueueFull);
        }

        bool admitted;
        try
        {
            admitted = await _slots.WaitAsync(QueueWait, ct);
        }
        finally
        {
            Interlocked.Decrement(ref _waiting);
        }

        if (!admitted)
        {
            return new Lease(BulkheadRefusal.WaitExpired);
        }

        Interlocked.Increment(ref _inFlight);
        return new Lease(this);
    }

    private void Exit()
    {
        Interlocked.Decrement(ref _inFlight);
        _slots.Release();
    }

    /// <summary>
    /// The answer to <see cref="EnterAsync"/>: a held slot, released exactly
    /// once on dispose, or a refusal that says why and holds nothing.
    /// </summary>
    public sealed class Lease : IDisposable
    {
        private WeatherApiBulkhead? _owner;

        internal Lease(WeatherApiBulkhead owner)
        {
            _owner = owner;
            Refusal = BulkheadRefusal.None;
        }

        internal Lease(BulkheadRefusal refusal) => Refusal = refusal;

        /// <summary>Why the call was not admitted; <see cref="BulkheadRefusal.None"/> when it was.</summary>
        public BulkheadRefusal Refusal { get; }

        /// <summary>True when this lease holds a slot and the provider may be called.</summary>
        public bool Admitted => Refusal == BulkheadRefusal.None;

        public void Dispose() => Interlocked.Exchange(ref _owner, null)?.Exit();
    }
}
