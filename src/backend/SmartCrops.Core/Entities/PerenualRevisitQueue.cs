namespace SmartCrops.Core.Entities;

/// <summary>
/// SMA-103 — a persisted retry queue for Perenual resources that failed
/// <i>transiently</i> during the catalogue aspiration (a truncated/throttled body,
/// 5xx, 429, transport flap). Decouples cursor advance from transient resolution:
/// the forward sweep enqueues a transient id here and advances PAST it (instead of
/// pinning the cursor and re-hammering the same throttled cluster), then a spaced
/// <c>revisit</c> pass drains the queue one id at a time.
///
/// <para>One row per (<see cref="Endpoint"/>, <see cref="ResourceId"/>) — the SAME
/// logical endpoint values as <see cref="PerenualRawCache"/> (<c>"species-details"</c>
/// / <c>"care-guide"</c>; the <c>list</c> phase is not queued). There is deliberately
/// <b>no</b> foreign key to <see cref="PerenualRawCache"/>: by construction a
/// transient failure writes NO cache row, so a FK would have nothing to point at and
/// would break the enqueue. A non-null <see cref="ResolvedAt"/> means the resource
/// was later captured (success) or proven gone (404/410); a null one means it is
/// still pending and will be retried — for free — on a future forward sweep.</para>
/// </summary>
public class PerenualRevisitQueue
{
    public Guid Id { get; set; }

    /// <summary>
    /// Logical endpoint family, matching <see cref="PerenualRawCache.Endpoint"/>:
    /// <c>"species-details"</c> or <c>"care-guide"</c>. Unique together with
    /// <see cref="ResourceId"/>.
    /// </summary>
    public required string Endpoint { get; set; }

    /// <summary>The Perenual species id (string-typed, mirroring the raw cache key).</summary>
    public required string ResourceId { get; set; }

    /// <summary>How many times this resource has been (re-)attempted. Never negative.</summary>
    public int Attempts { get; set; }

    /// <summary>
    /// HTTP status of the last attempt: 200 for a truncated/malformed JSON body,
    /// 429/5xx for an upstream fault; <c>null</c> for a transport failure or timeout
    /// (no status reached).
    /// </summary>
    public int? LastHttpStatus { get; set; }

    /// <summary>Short diagnostic for the last attempt (e.g. the failure category) — never a body or key.</summary>
    public string? LastError { get; set; }

    /// <summary>UTC timestamp the resource was first enqueued.</summary>
    public DateTime FirstSeenAt { get; set; }

    /// <summary>UTC timestamp of the most recent attempt.</summary>
    public DateTime LastAttemptAt { get; set; }

    /// <summary>
    /// UTC timestamp the resource was resolved (captured or proven gone) during a
    /// revisit pass. <c>null</c> while still failing/pending — the drain query and
    /// the FailedIds report both filter on <c>ResolvedAt IS NULL</c>.
    /// </summary>
    public DateTime? ResolvedAt { get; set; }
}
