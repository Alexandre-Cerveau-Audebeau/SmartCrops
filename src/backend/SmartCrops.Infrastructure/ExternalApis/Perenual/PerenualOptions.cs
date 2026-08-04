using System.ComponentModel.DataAnnotations;

namespace SmartCrops.Infrastructure.ExternalApis.Perenual;

/// <summary>
/// Options binding for the <c>"Perenual"</c> section of <c>appsettings.json</c>.
/// Validated at startup via <c>AddOptionsWithValidateOnStart</c> so misconfig
/// of the shape-level members (<see cref="BaseUrl"/>, <see cref="UserAgent"/>,
/// <see cref="TimeoutSeconds"/>) fails the host boot rather than the first
/// enrichment call.
///
/// <para>The <see cref="ApiKey"/> is deliberately <b>not</b> required at boot
/// (SMA-377): the Perenual subscription is retired (June 2026, cache-only
/// forever — runtime reads <c>PerenualRawCache</c>/<c>PlantPerenualData</c>)
/// and Production must start without the credential. When set, it comes from
/// <c>dotnet user-secrets</c> locally or the <c>Perenual__ApiKey</c> env var
/// in containerised environments; it is <b>never</b> in
/// <c>appsettings.json</c> — Perenual's API requires it on every request as a
/// query string parameter (<c>?key=...</c>) and it must not leak into source
/// control.</para>
/// </summary>
public class PerenualOptions
{
    public const string SectionName = "Perenual";

    [Required]
    [Url]
    public string BaseUrl { get; set; } = "https://perenual.com/api/v2/";

    /// <summary>
    /// Perenual API access key, sent on every request as <c>?key=...</c>.
    /// Optional in Production (SMA-377): the upstream is retired/cache-only
    /// and <see cref="PerenualClient"/> fails meaningfully at call time if
    /// ever invoked without it. Populated from user-secrets (dev) or
    /// environment variable (containers); never committed to source control.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Per-request <see cref="HttpClient.Timeout"/> ceiling (seconds). Set to
    /// 200s — above the standard resilience handler's 180s TotalRequestTimeout
    /// (SMA-71) — so the slow, large pest-disease-list catalogue harvest is
    /// governed by the resilience pipeline rather than re-cut by HttpClient. A
    /// ceiling, not a fixed wait: fast enrichment/search calls are unaffected.
    /// </summary>
    [Range(1, int.MaxValue)]
    public int TimeoutSeconds { get; set; } = 200;

    /// <summary>
    /// User-Agent header sent on every Perenual call. Identifies the SmartCrops
    /// instance for rate-limit and correctness contact per common API etiquette.
    /// </summary>
    [Required]
    public string UserAgent { get; set; } = "SmartCrops/1.0 (https://github.com/Alexandre-Cerveau-Audebeau/SmartCrops)";
}
