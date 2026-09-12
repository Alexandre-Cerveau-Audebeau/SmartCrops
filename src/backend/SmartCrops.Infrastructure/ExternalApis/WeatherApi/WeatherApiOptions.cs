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

    [Required]
    [Url]
    public string BaseUrl { get; set; } = "https://api.weatherapi.com/v1/";

    /// <summary>
    /// WeatherAPI.com access key, sent on every request as <c>?key=…</c>.
    /// Optional at boot; empty means « no weather », never « no API ».
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Per-request <see cref="HttpClient.Timeout"/> ceiling (seconds). Kept
    /// ABOVE the resilience pipeline's 10 s total so the pipeline governs the
    /// call and HttpClient never re-cuts it early (the SMA-71 lesson).
    /// </summary>
    [Range(1, int.MaxValue)]
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

    /// <summary>User-Agent sent on every call, same identity string as the other external clients.</summary>
    [Required]
    public string UserAgent { get; set; } = "SmartCrops/1.0 (https://github.com/Alexandre-Cerveau-Audebeau/SmartCrops)";
}
