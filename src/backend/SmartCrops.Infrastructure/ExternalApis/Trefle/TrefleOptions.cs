using System.ComponentModel.DataAnnotations;

namespace SmartCrops.Infrastructure.ExternalApis.Trefle;

/// <summary>
/// Options binding for the <c>"Trefle"</c> section of <c>appsettings.json</c>.
/// Validated at startup via <c>AddOptionsWithValidateOnStart</c> so misconfig
/// (notably a missing token) fails the host boot rather than the first
/// enrichment call.
///
/// <para>The <see cref="Token"/> is intentionally <see cref="RequiredAttribute"/>
/// with an empty default so the host refuses to start until it is set via
/// <c>dotnet user-secrets</c> locally or the <c>Trefle__Token</c> env var in
/// containerised environments. The token is <b>never</b> in
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
    /// Trefle API access token. Required on every request as <c>?token=...</c>.
    /// Populated from user-secrets (dev) or environment variable (containers);
    /// never committed to source control.
    /// </summary>
    [Required]
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
