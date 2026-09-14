using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace SmartCrops.Infrastructure.Weather;

/// <summary>
/// SMA-336 PR 3a/5 — the identity of a PLACE for the weather: its coordinates
/// rounded to two decimals (≈ 1.1 km), invariant culture, « 45.76,4.84 ».
/// Two gardens geocoded to the same town share it, and therefore share one
/// provider call and one cache entry; the dashboard's location tabs are keyed
/// by it too. The forecast itself is fetched with the first garden's exact
/// coordinates — the rounding only decides who shares.
///
/// <para>The key IS the place, so it never goes to a log line: a log names a
/// place by <see cref="ToLogTag"/>, an opaque tag (review round 2, S6).</para>
/// </summary>
public static class WeatherLocationKey
{
    // A secret drawn once per process: the tag of a key is stable for the
    // life of the process (the same place reads the same in every line of a
    // run) and meaningless outside it — a key cannot be recovered from its
    // tag, not even by hashing every cell of the rounded grid, because the
    // salt is never written anywhere.
    private static readonly byte[] TagSalt = RandomNumberGenerator.GetBytes(32);

    public static string From(double latitude, double longitude)
        => string.Create(CultureInfo.InvariantCulture, $"{latitude:F2},{longitude:F2}");

    /// <summary>
    /// An opaque, per-process name for a place's key, for logs only: no digit
    /// of the coordinates, stable within a run, worthless outside it.
    /// </summary>
    public static string ToLogTag(string key)
    {
        var digest = HMACSHA256.HashData(TagSalt, Encoding.UTF8.GetBytes(key));
        return "place-" + Convert.ToHexString(digest.AsSpan(0, 6)).ToLowerInvariant();
    }
}
