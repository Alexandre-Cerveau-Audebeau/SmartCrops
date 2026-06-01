namespace SmartCrops.Core.Entities;

/// <summary>
/// SMA-93 — a SHAPE-AGNOSTIC raw cache of the Perenual API, captured wholesale
/// ahead of the Supreme subscription cancel. One row per (endpoint, resource):
/// the verbatim (API-key-redacted) JSON body Perenual served, stored without any
/// DTO binding so nothing the API exposes is ever dropped.
///
/// <para>Deliberately DECOUPLED: filling this cache creates no <c>Plant</c> and
/// touches neither GBIF nor Trefle. Internal/admin/audit only — this table is
/// NEVER surfaced in a public API DTO.</para>
/// </summary>
public class PerenualRawCache
{
    public Guid Id { get; set; }

    /// <summary>
    /// Logical endpoint family: <c>"species-list"</c>, <c>"species-details"</c>,
    /// or <c>"care-guide"</c> (pest-disease-list is already fully captured in
    /// <see cref="PerenualPestCatalog"/>, so it is out of scope here).
    /// </summary>
    public required string Endpoint { get; set; }

    /// <summary>
    /// Resource key within the endpoint: the page number for <c>species-list</c>,
    /// the species id for <c>species-details</c> / <c>care-guide</c>. String-typed
    /// so any endpoint's key shape fits. Unique together with <see cref="Endpoint"/>.
    /// </summary>
    public required string ResourceId { get; set; }

    /// <summary>
    /// Verbatim response body, API key redacted, stored as jsonb. <c>null</c> when
    /// the fetch produced no usable body (e.g. a deleted id ≥8574 returning an HTML
    /// error page) — <see cref="HttpStatus"/> records the attempt either way.
    /// </summary>
    public string? RawJson { get; set; }

    /// <summary>
    /// HTTP status (or a sentinel) of the capture attempt. Lets a non-JSON / deleted
    /// resource be recorded as "attempted, nothing to keep" rather than re-fetched.
    /// </summary>
    public int HttpStatus { get; set; }

    /// <summary>UTC timestamp of the capture attempt.</summary>
    public DateTime FetchedAt { get; set; }
}
