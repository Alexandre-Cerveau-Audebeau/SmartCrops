using System.Text.Json.Serialization;

namespace SmartCrops.Infrastructure.ExternalApis.WeatherApi;

// SMA-336 PR 3a/5 — the WeatherAPI.com wire shapes this client binds, and
// NOTHING else. Every property below is a field the public documentation lists
// (https://www.weatherapi.com/docs/, read 2026-09-12); the fixtures the tests
// use are built from that same page. Deliberately unbound:
//   - condition.icon — the provider's icon URL is never shown nor persisted;
//   - every *_f / *_mph / *_in / *_miles twin — the browser converts (D9);
//   - astro moon fields, air quality, pollen, radiation — no reader.
// Numbers are nullable on purpose: a field the provider omits must read as
// « unknown », never as a temperature of zero. Binding is case-insensitive
// (JsonSerializerDefaults.Web), which is what lets the documented `msgType`
// and the observed `msgtype` both land on the same property.

/// <summary>The <c>{ "error": { "code", "message" } }</c> envelope of a 4xx answer.</summary>
public sealed class WeatherApiErrorEnvelope
{
    [JsonPropertyName("error")]
    public WeatherApiError? Error { get; init; }
}

public sealed class WeatherApiError
{
    [JsonPropertyName("code")]
    public int? Code { get; init; }

    /// <summary>The provider's own wording. Logged, never forwarded to a client.</summary>
    [JsonPropertyName("message")]
    public string? Message { get; init; }
}

/// <summary>One match of <c>/search.json</c> — a « Location object » without <c>tz_id</c>, <c>localtime_epoch</c> and <c>localtime</c>, which the search endpoint does not return.</summary>
public sealed class WeatherApiSearchLocation
{
    /// <summary>The provider's location id, reusable as <c>q=id:…</c>.</summary>
    [JsonPropertyName("id")]
    public int? Id { get; init; }

    [JsonPropertyName("name")]
    public string? Name { get; init; }

    [JsonPropertyName("region")]
    public string? Region { get; init; }

    /// <summary>Country NAME (« France ») — the endpoint sends no ISO code.</summary>
    [JsonPropertyName("country")]
    public string? Country { get; init; }

    [JsonPropertyName("lat")]
    public double? Lat { get; init; }

    [JsonPropertyName("lon")]
    public double? Lon { get; init; }
}

/// <summary>The whole <c>/search.json</c> answer: a bare JSON array, wrapped so a caller never sees a list that means « no call was made ».</summary>
public sealed class WeatherApiSearchResponse
{
    public WeatherApiSearchResponse(IReadOnlyList<WeatherApiSearchLocation> locations)
        => Locations = locations;

    public IReadOnlyList<WeatherApiSearchLocation> Locations { get; }
}

/// <summary>The <c>location</c> block of <c>/forecast.json</c>.</summary>
public sealed class WeatherApiLocation
{
    [JsonPropertyName("name")]
    public string? Name { get; init; }

    [JsonPropertyName("region")]
    public string? Region { get; init; }

    [JsonPropertyName("country")]
    public string? Country { get; init; }

    [JsonPropertyName("lat")]
    public double? Lat { get; init; }

    [JsonPropertyName("lon")]
    public double? Lon { get; init; }

    /// <summary>IANA time zone name (« Europe/Paris »).</summary>
    [JsonPropertyName("tz_id")]
    public string? TzId { get; init; }

    [JsonPropertyName("localtime_epoch")]
    public long? LocaltimeEpoch { get; init; }

    /// <summary>Local date and time at the place, « yyyy-MM-dd HH:mm ».</summary>
    [JsonPropertyName("localtime")]
    public string? Localtime { get; init; }
}

/// <summary>A condition: its localized text and its numeric code. The icon URL is deliberately not bound.</summary>
public sealed class WeatherApiCondition
{
    [JsonPropertyName("text")]
    public string? Text { get; init; }

    [JsonPropertyName("code")]
    public int? Code { get; init; }
}

/// <summary>The <c>current</c> block.</summary>
public sealed class WeatherApiCurrent
{
    [JsonPropertyName("last_updated_epoch")]
    public long? LastUpdatedEpoch { get; init; }

    [JsonPropertyName("last_updated")]
    public string? LastUpdated { get; init; }

    [JsonPropertyName("temp_c")]
    public double? TempC { get; init; }

    [JsonPropertyName("feelslike_c")]
    public double? FeelslikeC { get; init; }

    [JsonPropertyName("condition")]
    public WeatherApiCondition? Condition { get; init; }

    /// <summary>1 = day, 0 = night.</summary>
    [JsonPropertyName("is_day")]
    public int? IsDay { get; init; }

    [JsonPropertyName("wind_kph")]
    public double? WindKph { get; init; }

    [JsonPropertyName("wind_degree")]
    public int? WindDegree { get; init; }

    [JsonPropertyName("wind_dir")]
    public string? WindDir { get; init; }

    [JsonPropertyName("gust_kph")]
    public double? GustKph { get; init; }

    [JsonPropertyName("humidity")]
    public int? Humidity { get; init; }

    [JsonPropertyName("cloud")]
    public int? Cloud { get; init; }

    [JsonPropertyName("precip_mm")]
    public double? PrecipMm { get; init; }

    [JsonPropertyName("uv")]
    public double? Uv { get; init; }
}

/// <summary>The <c>day</c> block of one forecast day.</summary>
public sealed class WeatherApiDay
{
    [JsonPropertyName("maxtemp_c")]
    public double? MaxtempC { get; init; }

    [JsonPropertyName("mintemp_c")]
    public double? MintempC { get; init; }

    [JsonPropertyName("avgtemp_c")]
    public double? AvgtempC { get; init; }

    [JsonPropertyName("maxwind_kph")]
    public double? MaxwindKph { get; init; }

    [JsonPropertyName("totalprecip_mm")]
    public double? TotalprecipMm { get; init; }

    [JsonPropertyName("totalsnow_cm")]
    public double? TotalsnowCm { get; init; }

    [JsonPropertyName("avghumidity")]
    public int? Avghumidity { get; init; }

    [JsonPropertyName("condition")]
    public WeatherApiCondition? Condition { get; init; }

    [JsonPropertyName("uv")]
    public double? Uv { get; init; }

    [JsonPropertyName("daily_will_it_rain")]
    public int? DailyWillItRain { get; init; }

    [JsonPropertyName("daily_chance_of_rain")]
    public int? DailyChanceOfRain { get; init; }

    [JsonPropertyName("daily_will_it_snow")]
    public int? DailyWillItSnow { get; init; }

    [JsonPropertyName("daily_chance_of_snow")]
    public int? DailyChanceOfSnow { get; init; }
}

/// <summary>The <c>astro</c> block — sunrise and sunset only; the moon has no reader.</summary>
public sealed class WeatherApiAstro
{
    [JsonPropertyName("sunrise")]
    public string? Sunrise { get; init; }

    [JsonPropertyName("sunset")]
    public string? Sunset { get; init; }
}

/// <summary>One entry of a day's <c>hour[]</c>.</summary>
public sealed class WeatherApiHour
{
    [JsonPropertyName("time_epoch")]
    public long? TimeEpoch { get; init; }

    /// <summary>Local date and time at the place, « yyyy-MM-dd HH:mm ».</summary>
    [JsonPropertyName("time")]
    public string? Time { get; init; }

    [JsonPropertyName("temp_c")]
    public double? TempC { get; init; }

    [JsonPropertyName("feelslike_c")]
    public double? FeelslikeC { get; init; }

    [JsonPropertyName("condition")]
    public WeatherApiCondition? Condition { get; init; }

    [JsonPropertyName("is_day")]
    public int? IsDay { get; init; }

    [JsonPropertyName("wind_kph")]
    public double? WindKph { get; init; }

    [JsonPropertyName("gust_kph")]
    public double? GustKph { get; init; }

    [JsonPropertyName("precip_mm")]
    public double? PrecipMm { get; init; }

    [JsonPropertyName("humidity")]
    public int? Humidity { get; init; }

    [JsonPropertyName("cloud")]
    public int? Cloud { get; init; }

    [JsonPropertyName("will_it_rain")]
    public int? WillItRain { get; init; }

    [JsonPropertyName("chance_of_rain")]
    public int? ChanceOfRain { get; init; }

    [JsonPropertyName("will_it_snow")]
    public int? WillItSnow { get; init; }

    [JsonPropertyName("chance_of_snow")]
    public int? ChanceOfSnow { get; init; }

    [JsonPropertyName("uv")]
    public double? Uv { get; init; }
}

/// <summary>One entry of <c>forecast.forecastday[]</c>.</summary>
public sealed class WeatherApiForecastDay
{
    /// <summary>« yyyy-MM-dd », local to the place.</summary>
    [JsonPropertyName("date")]
    public string? Date { get; init; }

    [JsonPropertyName("date_epoch")]
    public long? DateEpoch { get; init; }

    [JsonPropertyName("day")]
    public WeatherApiDay? Day { get; init; }

    [JsonPropertyName("astro")]
    public WeatherApiAstro? Astro { get; init; }

    [JsonPropertyName("hour")]
    public List<WeatherApiHour>? Hour { get; init; }
}

public sealed class WeatherApiForecast
{
    [JsonPropertyName("forecastday")]
    public List<WeatherApiForecastDay>? Forecastday { get; init; }
}

/// <summary>
/// One official alert. The documentation's field table spells <c>msgType</c>
/// and <c>desc</c>; its example answer spells <c>msgtype</c>. Case-insensitive
/// binding covers the first pair; <see cref="Description"/> covers a body that
/// would spell the second out in full.
/// </summary>
public sealed class WeatherApiAlert
{
    [JsonPropertyName("headline")]
    public string? Headline { get; init; }

    [JsonPropertyName("msgtype")]
    public string? MsgType { get; init; }

    [JsonPropertyName("severity")]
    public string? Severity { get; init; }

    [JsonPropertyName("urgency")]
    public string? Urgency { get; init; }

    [JsonPropertyName("areas")]
    public string? Areas { get; init; }

    [JsonPropertyName("category")]
    public string? Category { get; init; }

    [JsonPropertyName("certainty")]
    public string? Certainty { get; init; }

    [JsonPropertyName("event")]
    public string? Event { get; init; }

    [JsonPropertyName("note")]
    public string? Note { get; init; }

    [JsonPropertyName("effective")]
    public string? Effective { get; init; }

    [JsonPropertyName("expires")]
    public string? Expires { get; init; }

    [JsonPropertyName("desc")]
    public string? Desc { get; init; }

    /// <summary>The same text under its unabbreviated name, should a body ever use it.</summary>
    [JsonPropertyName("description")]
    public string? DescriptionLong { get; init; }

    [JsonPropertyName("instruction")]
    public string? Instruction { get; init; }

    /// <summary>The alert text, whichever spelling the body used.</summary>
    [JsonIgnore]
    public string? Description => Desc ?? DescriptionLong;
}

public sealed class WeatherApiAlerts
{
    [JsonPropertyName("alert")]
    public List<WeatherApiAlert>? Alert { get; init; }
}

/// <summary>The whole <c>/forecast.json</c> answer.</summary>
public sealed class WeatherApiForecastResponse
{
    [JsonPropertyName("location")]
    public WeatherApiLocation? Location { get; init; }

    [JsonPropertyName("current")]
    public WeatherApiCurrent? Current { get; init; }

    [JsonPropertyName("forecast")]
    public WeatherApiForecast? Forecast { get; init; }

    [JsonPropertyName("alerts")]
    public WeatherApiAlerts? Alerts { get; init; }
}
