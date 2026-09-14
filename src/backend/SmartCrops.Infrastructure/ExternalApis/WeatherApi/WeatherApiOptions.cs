using System.ComponentModel.DataAnnotations;

namespace SmartCrops.Infrastructure.ExternalApis.WeatherApi;

/// <summary>
/// Options binding for the <c>"WeatherApi"</c> section of <c>appsettings.json</c>
/// (SMA-336 PR 3a/5 — WeatherAPI.com, the garden weather AND geocoding
/// provider). Validated at startup via <c>ValidateOnStart</c> so a misconfigured
/// shape member (<see cref="BaseUrl"/>, <see cref="ForecastDays"/>,
/// <see cref="UserAgent"/>…) fails the host boot rather than the first call.
///
/// <para>The <see cref="ApiKey"/> is deliberately <b>not</b> required at boot
/// (the SMA-377 lesson: a boot that depends on a non-critical third party
/// crash-loops). Without it, <see cref="WeatherApiClient"/> answers
/// <c>MissingKey</c> at call time — no request is sent, a warning is logged
/// once — and the weather endpoints degrade to their invitation. When set, it
/// comes from the <c>WeatherApi__ApiKey</c> environment variable
/// (docker-compose.override.yml locally, the VPS <c>.env</c> in production);
/// it is <b>never</b> in <c>appsettings.json</c>: the provider requires it on
/// every request as a query-string parameter (<c>?key=…</c>), which is also why
/// the typed client logs through <c>RedactingHttpClientLogger</c>.</para>
/// </summary>
public class WeatherApiOptions
{
    public const string SectionName = "WeatherApi";

    /// <summary>
    /// The provider's base address. <c>[Url]</c> alone admits <c>http://</c>
    /// and <c>ftp://</c>; <see cref="WeatherApiOptionsValidator"/> requires an
    /// absolute <c>https</c> URL at boot, because the key and the user's place
    /// travel in the query string of every call (review round 2, S5). With or
    /// without its trailing slash: the client adds one before any request
    /// (<see cref="WeatherApiClient.BaseAddressFrom"/>, review round 3, D1),
    /// so the two routes resolve under <c>/v1/</c> either way.
    /// </summary>
    [Required]
    [Url]
    public string BaseUrl { get; set; } = "https://api.weatherapi.com/v1/";

    /// <summary>
    /// WeatherAPI.com access key, sent on every request as <c>?key=…</c>.
    /// Optional at boot; empty means « no weather », never « no API ».
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>Resilience pipeline — one attempt's timeout, in seconds. The host builds the handler from these three.</summary>
    public const int PipelineAttemptTimeoutSeconds = 5;

    /// <summary>Resilience pipeline — the whole call's budget, retries included, in seconds.</summary>
    public const int PipelineTotalTimeoutSeconds = 10;

    /// <summary>Resilience pipeline — the circuit breaker's sampling window, in seconds (at least twice the attempt timeout).</summary>
    public const int PipelineSamplingDurationSeconds = 10;

    /// <summary>
    /// End-to-end budget of ONE call, in seconds — the wait for a bulkhead
    /// slot and the resilience pipeline together (review round 3, D2). Past
    /// it the call is classified <c>Transport</c>, wherever it stands.
    /// Strictly above the pipeline's total, so a call admitted at once keeps
    /// its whole budget and its retries; strictly under the browser's 15 s
    /// fetch budget, so a slot freed late followed by a stalled provider —
    /// the queue wait plus the pipeline's total otherwise, twenty seconds —
    /// can no longer outlast the dashboard request that carries it.
    /// </summary>
    public const int CallDeadlineSeconds = 12;

    /// <summary>
    /// Lowest <see cref="TimeoutSeconds"/> accepted: strictly ABOVE the
    /// pipeline's total, so <see cref="HttpClient.Timeout"/> can never cut the
    /// pipeline short and turn its retries and its budget into a plain
    /// cancellation (review round 1, K2 — the SMA-71 lesson, enforced).
    /// </summary>
    public const int MinTimeoutSeconds = PipelineTotalTimeoutSeconds + 1;

    /// <summary>
    /// Per-request <see cref="HttpClient.Timeout"/> ceiling (seconds). Kept
    /// ABOVE the resilience pipeline's total (<see cref="PipelineTotalTimeoutSeconds"/>)
    /// so the pipeline governs the call and HttpClient never re-cuts it early;
    /// the range enforces it at boot.
    /// </summary>
    [Range(MinTimeoutSeconds, int.MaxValue)]
    public int TimeoutSeconds { get; set; } = 12;

    /// <summary>
    /// Days of forecast requested (<c>days=</c>). Five: today and four more,
    /// the widget's « five days » rows. The provider may return FEWER — the
    /// client passes what comes back and logs the shortfall.
    /// </summary>
    [Range(1, 14)]
    public int ForecastDays { get; set; } = 5;

    /// <summary>
    /// Default <c>lang=</c> for <c>condition:text</c> when the caller passes
    /// none. Official alerts are never translated by it.
    /// </summary>
    [Required]
    public string Language { get; set; } = "fr";

    /// <summary>
    /// Provider-wide ceiling on calls in flight at once, across every request
    /// of the process and both endpoints (<see cref="WeatherApiBulkhead"/>).
    /// Four: a dashboard with more distinct places than that queues the rest
    /// behind the first four rather than bursting them all against the shared
    /// key. The queue itself is bounded — at most
    /// <see cref="WeatherApiBulkhead.QueueDepthPerSlot"/> times this many
    /// waiting calls, none for longer than the pipeline's total budget
    /// (review round 2, S4).
    /// </summary>
    [Range(1, 64)]
    public int MaxConcurrentCalls { get; set; } = 4;

    /// <summary>User-Agent sent on every call, same identity string as the other external clients.</summary>
    [Required]
    public string UserAgent { get; set; } = "SmartCrops/1.0 (https://github.com/Alexandre-Cerveau-Audebeau/SmartCrops)";
}
