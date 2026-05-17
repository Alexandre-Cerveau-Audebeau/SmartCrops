namespace SmartCrops.Infrastructure.ExternalApis.Gbif;

/// <summary>
/// Options binding for the <c>"Gbif"</c> section of <c>appsettings.json</c>.
/// All defaults are safe for development; the production deployment should
/// confirm the <see cref="UserAgent"/> identifies the SmartCrops instance.
/// </summary>
public class GbifOptions
{
    public const string SectionName = "Gbif";

    public string BaseUrl { get; set; } = "https://api.gbif.org/";

    public int TimeoutSeconds { get; set; } = 30;

    /// <summary>
    /// Minimum confidence (0-100) for a <c>FUZZY</c> match to be accepted.
    /// GBIF docs recommend 80+; values below this returned <c>null</c>.
    /// </summary>
    public int FuzzyConfidenceThreshold { get; set; } = 80;

    /// <summary>
    /// User-Agent header sent on every GBIF call. GBIF asks API consumers to
    /// identify themselves with a contact URL so they can reach out about
    /// rate-limit or correctness issues.
    /// </summary>
    public string UserAgent { get; set; } = "SmartCrops/1.0 (https://github.com/Alexandre-Cerveau-Audebeau/SmartCrops)";
}
