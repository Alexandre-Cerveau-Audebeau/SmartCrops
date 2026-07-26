using System.ComponentModel.DataAnnotations;

namespace SmartCrops.Api.Configuration;

/// <summary>
/// Options binding for the <c>"Frontend"</c> section of <c>appsettings.json</c>
/// (SMA-31 R2). <see cref="BaseUrl"/> is the public base URL of the SPA, used to
/// build the links a user clicks from an email (confirmation) or an OAuth
/// redirect. Validated at startup outside Development — mirroring the
/// <c>SmtpOptions</c> pattern — so a misconfigured deployment fails loud at boot
/// instead of surfacing as generic "delivery failed" log lines (the catch-all
/// around the confirmation send would otherwise mask the lazy throw).
/// <c>AuthController.ResolveFrontendBaseUrl</c> keeps its runtime guard and
/// Development localhost fallback as a belt-and-braces.
/// </summary>
public class FrontendOptions
{
    public const string SectionName = "Frontend";

    [Required]
    public string BaseUrl { get; set; } = string.Empty;
}
