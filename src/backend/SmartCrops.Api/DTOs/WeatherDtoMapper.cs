using System.Globalization;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.ExternalApis.WeatherApi;
using SmartCrops.Infrastructure.Weather;

namespace SmartCrops.Api.DTOs;

/// <summary>
/// SMA-336 PR 3a/5 — projects a cached provider answer (or its absence) onto
/// <see cref="WeatherLocationDto"/>. Pure and total: every provider field is
/// nullable, so the mapper DROPS what it cannot state — an hour without a
/// temperature, a day without its bounds, an alert without a headline — rather
/// than inventing a zero the browser would draw. The place's name comes from
/// what the user stored, never from the provider.
///
/// <para>Here, in the Api project, because it produces wire records and the
/// Infrastructure project cannot reference them — the cache it reads from
/// stays provider-shaped.</para>
/// </summary>
public static class WeatherDtoMapper
{
    /// <summary>Days carried at most: the widget's five rows.</summary>
    public const int MaxDays = 5;

    /// <summary>Days that carry their hours: the six slots can straddle midnight, nothing reads further.</summary>
    public const int DaysWithHours = 2;

    /// <summary>Official alerts carried at most.</summary>
    public const int MaxAlerts = 5;

    /// <summary>
    /// A place's entry, from the outcome the cache produced for it.
    /// </summary>
    /// <param name="key">The place's key (<see cref="WeatherLocationKey"/>).</param>
    /// <param name="stored">The stored location — the name shown is this one.</param>
    /// <param name="outcome">What the cache handed back.</param>
    /// <param name="nowUtc">The instant against which alert expiry is judged.</param>
    public static WeatherLocationDto Map(
        string key,
        GeoLocation stored,
        WeatherFetchOutcome outcome,
        DateTime nowUtc)
    {
        if (outcome.Data is null)
        {
            return new WeatherLocationDto(
                key,
                stored.Name,
                stored.Region,
                stored.Country,
                WeatherStatuses.Unavailable,
                FetchedAt: null,
                TimeZone: null,
                LocalTime: null,
                Current: null,
                Days: [],
                Alerts: []);
        }

        var forecast = outcome.Data.Forecast;
        return new WeatherLocationDto(
            key,
            stored.Name,
            stored.Region,
            stored.Country,
            outcome.Stale ? WeatherStatuses.Stale : WeatherStatuses.Fresh,
            outcome.Data.FetchedAtUtc,
            forecast.Location?.TzId,
            forecast.Location?.Localtime,
            MapCurrent(forecast.Current),
            MapDays(forecast.Forecast?.Forecastday),
            MapAlerts(forecast.Alerts?.Alert, nowUtc));
    }

    private static WeatherCurrentDto? MapCurrent(WeatherApiCurrent? current)
    {
        if (current?.TempC is not { } temp || current.Condition?.Code is not { } code) return null;

        return new WeatherCurrentDto(
            temp,
            current.FeelslikeC,
            code,
            current.Condition.Text,
            current.IsDay == 1,
            current.WindKph,
            current.GustKph,
            current.Humidity,
            current.PrecipMm,
            current.Uv,
            current.LastUpdated);
    }

    private static List<WeatherDayDto> MapDays(List<WeatherApiForecastDay>? days)
    {
        if (days is null) return [];

        var mapped = new List<WeatherDayDto>(MaxDays);
        foreach (var day in days)
        {
            if (mapped.Count == MaxDays) break;
            if (day?.Date is null
                || day.Day?.MintempC is not { } min
                || day.Day.MaxtempC is not { } max
                || day.Day.Condition?.Code is not { } code)
            {
                continue;
            }

            var hours = mapped.Count < DaysWithHours ? MapHours(day.Hour) : [];

            mapped.Add(new WeatherDayDto(
                day.Date,
                min,
                max,
                day.Day.AvgtempC,
                code,
                day.Day.Condition.Text,
                Percent(day.Day.DailyChanceOfRain),
                Percent(day.Day.DailyChanceOfSnow),
                day.Day.TotalprecipMm,
                day.Day.MaxwindKph,
                day.Astro?.Sunrise,
                day.Astro?.Sunset,
                hours));
        }

        return mapped;
    }

    private static List<WeatherHourDto> MapHours(List<WeatherApiHour>? hours)
    {
        if (hours is null) return [];

        var mapped = new List<WeatherHourDto>(hours.Count);
        foreach (var hour in hours)
        {
            if (hour?.Time is null
                || hour.TempC is not { } temp
                || hour.Condition?.Code is not { } code)
            {
                continue;
            }

            mapped.Add(new WeatherHourDto(
                hour.Time,
                temp,
                code,
                hour.IsDay == 1,
                Percent(hour.ChanceOfRain),
                hour.PrecipMm,
                hour.WindKph));
        }

        return mapped;
    }

    private static List<WeatherAlertDto> MapAlerts(List<WeatherApiAlert>? alerts, DateTime nowUtc)
    {
        if (alerts is null) return [];

        var mapped = new List<WeatherAlertDto>(MaxAlerts);
        foreach (var alert in alerts)
        {
            if (mapped.Count == MaxAlerts) break;
            if (alert is null || string.IsNullOrWhiteSpace(alert.Headline)) continue;
            if (IsExpired(alert.Expires, nowUtc)) continue;

            mapped.Add(new WeatherAlertDto(
                alert.Headline,
                alert.Event,
                alert.Severity,
                alert.Urgency,
                alert.Effective,
                alert.Expires,
                alert.Areas));
        }

        return mapped;
    }

    /// <summary>
    /// True when the alert's <c>expires</c> parses and lies in the past. An
    /// unparsable value keeps the alert: an official warning is worth more
    /// than a date format.
    /// </summary>
    private static bool IsExpired(string? expires, DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(expires)) return false;
        return DateTimeOffset.TryParse(
                   expires, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var at)
               && at.UtcDateTime <= nowUtc;
    }

    /// <summary>A percentage the browser can trust: 0..100, unknown reads as 0.</summary>
    private static int Percent(int? value) => Math.Clamp(value ?? 0, 0, 100);
}
