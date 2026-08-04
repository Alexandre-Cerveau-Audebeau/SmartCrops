using System.ComponentModel.DataAnnotations;

namespace SmartCrops.Infrastructure.ExternalApis.Trefle;

/// <summary>
/// Options binding for the <c>"Trefle"</c> section of <c>appsettings.json</c>.
/// Validated at startup via <c>AddOptionsWithValidateOnStart</c> so misconfig
/// of the shape-level members (<see cref="BaseUrl"/>, <see cref="UserAgent"/>,
/// <see cref="TimeoutSeconds"/>) fails the host boot rather than the first
/// enrichment call.
///
/// <para>The <see cref="Token"/> is deliberately <b>not</b> required at boot
/// (SMA-377): Trefle only ever served ingestion — runtime code paths read the
/// database — and Production must start without the credential. When set, it
/// comes from <c>dotnet user-secrets</c> locally or the <c>Trefle__Token</c>
/// env var in containerised environments; it is <b>never</b> in
/// <c>appsettings.json</c> — Trefle's API requires it on every request as a
/// query string parameter and it must not leak into source control.</para>
/// </summary>
public class TrefleOptions
{
    public const string SectionName = "Trefle";

    [Required]
    [Url]
    public string BaseUrl { get; set; } = "https://trefle.io/api/v1/";

    /// <summary>
    /// Trefle API access token, sent on every request as <c>?token=...</c>.
    /// Optional in Production (SMA-377): the upstream is ingestion-only —
    /// runtime code paths read the database — and <see cref="TrefleClient"/>
    /// fails meaningfully at call time if ever invoked without it. Populated
    /// from user-secrets (dev) or environment variable (containers); never
    /// committed to source control.
    /// </summary>
    public string Token { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int TimeoutSeconds { get; set; } = 30;

    /// <summary>
    /// User-Agent header sent on every Trefle call. Identifies the SmartCrops
    /// instance for rate-limit and correctness contact per common API etiquette.
    /// </summary>
    [Required]
    public string UserAgent { get; set; } = "SmartCrops/1.0 (https://github.com/Alexandre-Cerveau-Audebeau/SmartCrops)";
}
