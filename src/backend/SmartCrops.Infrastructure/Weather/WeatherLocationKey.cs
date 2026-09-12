using System.Globalization;

namespace SmartCrops.Infrastructure.Weather;

/// <summary>
/// SMA-336 PR 3a/5 — the identity of a PLACE for the weather: its coordinates
/// rounded to two decimals (≈ 1.1 km), invariant culture, « 45.76,4.84 ».
/// Two gardens geocoded to the same town share it, and therefore share one
/// provider call and one cache entry; the dashboard's location tabs are keyed
/// by it too. The forecast itself is fetched with the first garden's exact
/// coordinates — the rounding only decides who shares.
/// </summary>
public static class WeatherLocationKey
{
    public static string From(double latitude, double longitude)
        => string.Create(CultureInfo.InvariantCulture, $"{latitude:F2},{longitude:F2}");
}
