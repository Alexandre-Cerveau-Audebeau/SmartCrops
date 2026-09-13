using System.Text.Json;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.ExternalApis.WeatherApi;
using SmartCrops.Infrastructure.Weather;

namespace SmartCrops.Api.Tests.DTOs;

/// <summary>
/// SMA-336 PR 3a/5, review round 1 (K3) — the mapper's honesty on what the
/// provider did NOT say: a missing <c>is_day</c> or chance of rain travels as
/// null, never as « night » or « 0 % », while a present value is carried as
/// is (clamped to 0..100 for a percentage).
/// </summary>
public class WeatherDtoMapperTests
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private static readonly GeoLocation Lyon = new("Lyon", "Auvergne-Rhône-Alpes", "France", 45.76, 4.84, null);

    private static WeatherLocationDto MapFresh(string json)
    {
        var forecast = JsonSerializer.Deserialize<WeatherApiForecastResponse>(json, Web)!;
        var outcome = WeatherFetchOutcome.Fresh(new CachedForecast(forecast, DateTime.UtcNow));
        return WeatherDtoMapper.Map("45.76,4.84", Lyon, outcome, DateTime.UtcNow);
    }

    private static string Document(string current, string day, string hour) => $$"""
        {
          "location": { "name": "Lyon", "tz_id": "Europe/Paris", "localtime": "2026-09-13 10:00" },
          "current": { "temp_c": 21.0, "condition": { "text": "Ensoleillé", "code": 1000 }{{current}} },
          "forecast": { "forecastday": [ {
            "date": "2026-09-13",
            "day": { "mintemp_c": 12.0, "maxtemp_c": 24.0, "condition": { "text": "Ensoleillé", "code": 1000 }{{day}} },
            "hour": [ { "time": "2026-09-13 10:00", "temp_c": 19.0, "condition": { "text": "Ensoleillé", "code": 1000 }{{hour}} } ]
          } ] }
        }
        """;

    [Fact]
    public void Map_PresentValues_AreCarried()
    {
        var dto = MapFresh(Document(
            current: ", \"is_day\": 1",
            day: ", \"daily_chance_of_rain\": 80, \"daily_chance_of_snow\": 5",
            hour: ", \"is_day\": 0, \"chance_of_rain\": 30"));

        Assert.True(dto.Current!.IsDay);
        var day = Assert.Single(dto.Days);
        Assert.Equal(80, day.ChanceOfRain);
        Assert.Equal(5, day.ChanceOfSnow);
        var hour = Assert.Single(day.Hours);
        Assert.False(hour.IsDay);
        Assert.Equal(30, hour.ChanceOfRain);
    }

    [Fact]
    public void Map_AbsentValues_AreNull_NotNightNorZero()
    {
        // The provider said nothing about day/night or about rain: the wire
        // says nothing either — a false here would draw a moon, a 0 a dry day.
        var dto = MapFresh(Document(current: "", day: "", hour: ""));

        Assert.NotNull(dto.Current);
        Assert.Null(dto.Current!.IsDay);
        var day = Assert.Single(dto.Days);
        Assert.Null(day.ChanceOfRain);
        Assert.Null(day.ChanceOfSnow);
        var hour = Assert.Single(day.Hours);
        Assert.Null(hour.IsDay);
        Assert.Null(hour.ChanceOfRain);
    }

    [Theory]
    [InlineData(2)]
    [InlineData(-1)]
    public void Map_IsDayOutsideZeroAndOne_IsNull(int value)
    {
        var dto = MapFresh(Document(current: $", \"is_day\": {value}", day: "", hour: $", \"is_day\": {value}"));

        Assert.Null(dto.Current!.IsDay);
        Assert.Null(Assert.Single(Assert.Single(dto.Days).Hours).IsDay);
    }

    [Theory]
    [InlineData(250, 100)]
    [InlineData(-5, 0)]
    [InlineData(0, 0)]
    [InlineData(100, 100)]
    public void Map_PresentPercentage_IsClampedNotDropped(int given, int expected)
    {
        var dto = MapFresh(Document(current: "", day: $", \"daily_chance_of_rain\": {given}", hour: $", \"chance_of_rain\": {given}"));

        var day = Assert.Single(dto.Days);
        Assert.Equal(expected, day.ChanceOfRain);
        Assert.Equal(expected, Assert.Single(day.Hours).ChanceOfRain);
    }

    [Fact]
    public void Map_Unavailable_HasNoCurrentNoDays()
    {
        var outcome = WeatherFetchOutcome.Unavailable(new WeatherApiFailure(WeatherApiFailureKind.Refused, 2007, 403));

        var dto = WeatherDtoMapper.Map("45.76,4.84", Lyon, outcome, DateTime.UtcNow);

        Assert.Equal(WeatherStatuses.Unavailable, dto.Status);
        Assert.Null(dto.Current);
        Assert.Empty(dto.Days);
        Assert.Equal("Lyon", dto.Name);
    }
}
