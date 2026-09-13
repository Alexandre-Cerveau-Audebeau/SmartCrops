using System.Text.RegularExpressions;

namespace SmartCrops.Infrastructure.ExternalApis.WeatherApi;

/// <summary>
/// Scrubs the <c>q=</c> parameter out of a WeatherAPI.com request URI before it
/// is logged (SMA-336 PR 3a/5, review round 1). The value is not a credential:
/// it is the user's own place — the text typed into the geocoding field
/// (<c>search.json?q=…</c>, an address as often as a town) or a garden's
/// coordinates to four decimals (<c>forecast.json?q=lat,lon</c>). The request
/// logger writes every URI at Information level, and a person's place must not
/// be reconstructible from the logs.
///
/// <para>Same shape as <c>PerenualKeyRedactor</c> and <c>TrefleTokenRedactor</c>:
/// a regex on the parameter NAME, a fixed placeholder, no state. Scoped to
/// WeatherAPI requests only (<see cref="IsWeatherApiRequest"/>): the Perenual
/// catalog sends a <c>q=</c> too — a plant name, not a person's place — and its
/// log line stays readable.</para>
/// </summary>
public static partial class WeatherApiQueryRedactor
{
    /// <summary>Replacement substituted for the query value.</summary>
    public const string Placeholder = "REDACTED";

    /// <summary>The provider's domain; a request there, or to its two endpoints, is in scope.</summary>
    public const string Domain = "weatherapi.com";

    // Matches a `q=<value>` query parameter, the value running until the next
    // URL delimiter. The word boundary keeps `aqi=no` (whose `q` follows a
    // letter) and `key=` out of it.
    [GeneratedRegex(@"(\bq=)[^&""'\s<>\\]+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex QueryParamRegex();

    /// <summary>
    /// True for a request to the provider's domain, or to one of its two
    /// endpoint paths whatever the host — the base URL is configurable, the
    /// endpoints are not.
    /// </summary>
    public static bool IsWeatherApiRequest(Uri? uri)
    {
        if (uri is null || !uri.IsAbsoluteUri)
        {
            return false;
        }

        var host = uri.Host;
        if (string.Equals(host, Domain, StringComparison.OrdinalIgnoreCase)
            || host.EndsWith("." + Domain, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var path = uri.AbsolutePath;
        return path.EndsWith("/search.json", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/forecast.json", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Returns <paramref name="uri"/> with any <c>q=…</c> value replaced by
    /// <see cref="Placeholder"/>. Every other parameter (<c>days</c>,
    /// <c>lang</c>, <c>alerts</c>…) is kept: they say what was asked, not where.
    /// </summary>
    public static string Redact(string? uri)
    {
        if (string.IsNullOrEmpty(uri))
        {
            return uri ?? string.Empty;
        }

        return QueryParamRegex().Replace(uri, $"${{1}}{Placeholder}");
    }
}
