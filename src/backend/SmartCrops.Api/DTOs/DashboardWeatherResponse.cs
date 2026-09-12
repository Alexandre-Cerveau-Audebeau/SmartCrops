namespace SmartCrops.Api.DTOs;

/// <summary>The three states a place's weather can be in on the wire — the vocabulary of <c>status</c>.</summary>
public static class WeatherStatuses
{
    /// <summary>Data from within the fresh window.</summary>
    public const string Fresh = "fresh";

    /// <summary>The last known data: a refresh failed, <c>fetchedAt</c> says how old.</summary>
    public const string Stale = "stale";

    /// <summary>Nothing to show: the refresh failed and nothing was known before.</summary>
    public const string Unavailable = "unavailable";
}

/// <summary>
/// SMA-336 PR 3a/5 — <c>GET /api/dashboard/weather</c>: the weather of every
/// distinct place the caller's gardens sit in, in ONE call, plus which garden
/// reads which place. A TRANSPORT aggregate (decision D9): metric values as
/// the provider gave them, the browser converts, derives the gardener's
/// sentence and the frost / heat / wind chips, and draws.
///
/// <para>Never a 5xx of the provider's making: a place whose refresh failed
/// carries <see cref="WeatherStatuses.Stale"/> with the last known data, or
/// <see cref="WeatherStatuses.Unavailable"/> with none — the response itself
/// is always 200 for an authenticated caller.</para>
/// </summary>
/// <param name="Locations">One entry per distinct place, in the order of the gardens (newest first).</param>
/// <param name="Gardens">EVERY garden of the caller, located or not, with the place it reads.</param>
/// <param name="ProfileLocated">Whether the account carries a default location.</param>
public record DashboardWeatherResponse(
    IReadOnlyList<WeatherLocationDto> Locations,
    IReadOnlyList<WeatherGardenLinkDto> Gardens,
    bool ProfileLocated);

/// <summary>Which place a garden reads, and why.</summary>
/// <param name="GardenId">The garden.</param>
/// <param name="LocationKey">The <see cref="WeatherLocationDto.Key"/> it reads, or null when it is not located.</param>
/// <param name="Source">« garden » (its own override), « profile » (the account's default), or null.</param>
public record WeatherGardenLinkDto(
    Guid GardenId,
    string? LocationKey,
    string? Source);

/// <summary>One place and its weather.</summary>
/// <param name="Key">Coordinates rounded to two decimals, « 45.76,4.84 » — the identity of the place and of its tab.</param>
/// <param name="Name">The STORED place name (what the user chose), never the provider's.</param>
/// <param name="Region">Stored region, or null.</param>
/// <param name="Country">Stored country NAME, or null.</param>
/// <param name="Status">One of <see cref="WeatherStatuses"/>.</param>
/// <param name="FetchedAt">UTC instant of the provider call that produced the data; null when unavailable.</param>
/// <param name="TimeZone">IANA zone of the place (« Europe/Paris »), from the forecast; null when unavailable.</param>
/// <param name="LocalTime">Local date and time at the place, « yyyy-MM-dd HH:mm », from the forecast.</param>
/// <param name="Current">Current conditions, or null when unavailable.</param>
/// <param name="Days">Up to five days, today first; empty when unavailable.</param>
/// <param name="Alerts">Official alerts, unexpired, at most five; empty when none.</param>
public record WeatherLocationDto(
    string Key,
    string Name,
    string? Region,
    string? Country,
    string Status,
    DateTime? FetchedAt,
    string? TimeZone,
    string? LocalTime,
    WeatherCurrentDto? Current,
    IReadOnlyList<WeatherDayDto> Days,
    IReadOnlyList<WeatherAlertDto> Alerts);

/// <summary>Current conditions, metric.</summary>
/// <param name="TempC">Temperature, °C.</param>
/// <param name="FeelsLikeC">Feels-like temperature, °C, or null.</param>
/// <param name="ConditionCode">The provider's condition code; the browser maps it to an icon.</param>
/// <param name="ConditionText">The condition in the requested language.</param>
/// <param name="IsDay">Day or night, for the icon variant.</param>
/// <param name="WindKph">Wind, km/h, or null.</param>
/// <param name="GustKph">Gusts, km/h, or null.</param>
/// <param name="Humidity">Relative humidity, %, or null.</param>
/// <param name="PrecipMm">Precipitation, mm, or null.</param>
/// <param name="Uv">UV index, or null.</param>
/// <param name="LastUpdated">Local time the provider last refreshed these conditions.</param>
public record WeatherCurrentDto(
    double TempC,
    double? FeelsLikeC,
    int ConditionCode,
    string? ConditionText,
    bool IsDay,
    double? WindKph,
    double? GustKph,
    int? Humidity,
    double? PrecipMm,
    double? Uv,
    string? LastUpdated);

/// <summary>One forecast day, metric.</summary>
/// <param name="Date">« yyyy-MM-dd », local to the place.</param>
/// <param name="MinTempC">Minimum, °C.</param>
/// <param name="MaxTempC">Maximum, °C.</param>
/// <param name="AvgTempC">Average, °C, or null.</param>
/// <param name="ConditionCode">The day's condition code.</param>
/// <param name="ConditionText">The day's condition in the requested language.</param>
/// <param name="ChanceOfRain">0..100.</param>
/// <param name="ChanceOfSnow">0..100.</param>
/// <param name="TotalPrecipMm">Total precipitation, mm, or null.</param>
/// <param name="MaxWindKph">Maximum wind, km/h, or null.</param>
/// <param name="Sunrise">As the provider formats it (« 07:16 AM »).</param>
/// <param name="Sunset">As the provider formats it.</param>
/// <param name="Hours">24 entries on the first two days, none on the others: the six slots the widget shows can straddle midnight, nothing reads further.</param>
public record WeatherDayDto(
    string Date,
    double MinTempC,
    double MaxTempC,
    double? AvgTempC,
    int ConditionCode,
    string? ConditionText,
    int ChanceOfRain,
    int ChanceOfSnow,
    double? TotalPrecipMm,
    double? MaxWindKph,
    string? Sunrise,
    string? Sunset,
    IReadOnlyList<WeatherHourDto> Hours);

/// <summary>One hourly slot, metric.</summary>
/// <param name="Time">« yyyy-MM-dd HH:mm », local to the place.</param>
/// <param name="TempC">Temperature, °C.</param>
/// <param name="ConditionCode">The slot's condition code.</param>
/// <param name="IsDay">Day or night, for the icon variant.</param>
/// <param name="ChanceOfRain">0..100.</param>
/// <param name="PrecipMm">Precipitation, mm, or null.</param>
/// <param name="WindKph">Wind, km/h, or null.</param>
public record WeatherHourDto(
    string Time,
    double TempC,
    int ConditionCode,
    bool IsDay,
    int ChanceOfRain,
    double? PrecipMm,
    double? WindKph);

/// <summary>
/// One official alert — its identity and timing, never its paragraphs: the
/// description and the instruction are long, in the local language, and have
/// no reader on the dashboard.
/// </summary>
/// <param name="Headline">The alert's headline.</param>
/// <param name="Event">The event name (« Vent violent »), or null.</param>
/// <param name="Severity">CAP severity as the provider gives it, or null.</param>
/// <param name="Urgency">CAP urgency, or null.</param>
/// <param name="Effective">Start, as the provider formats it, or null.</param>
/// <param name="Expires">End, as the provider formats it, or null.</param>
/// <param name="Areas">Areas covered, or null.</param>
public record WeatherAlertDto(
    string Headline,
    string? Event,
    string? Severity,
    string? Urgency,
    string? Effective,
    string? Expires,
    string? Areas);
