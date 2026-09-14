using Microsoft.Extensions.Options;

namespace SmartCrops.Infrastructure.ExternalApis.WeatherApi;

/// <summary>
/// Startup validation of <see cref="WeatherApiOptions"/> beyond what data
/// annotations can say (SMA-336 PR 3a/5, review rounds 1 and 2). Registered as
/// <see cref="IValidateOptions{TOptions}"/> and armed by <c>ValidateOnStart</c>,
/// so a bad value fails the boot with a message naming the setting, never the
/// first dashboard with a 500.
///
/// <list type="bullet">
///   <item><b>BaseUrl must be an absolute https URL</b> (review round 2, S5).
///   <c>[Url]</c> admits <c>http://</c> and <c>ftp://</c>, and the key and the
///   user's place travel in the query string of every call: any scheme but
///   <c>https</c> would put both on the wire in clear. The same rule
///   <c>Frontend:BaseUrl</c> applies to itself in <c>Program.cs</c>, minus the
///   tolerance for <c>http</c> a browser-facing link can afford. The path's
///   trailing slash is NOT required: with or without it the setting is
///   accepted as given, and <see cref="WeatherApiClient.BaseAddressFrom"/>
///   makes both the same base address before any request (review round 3,
///   D1) — otherwise <c>https://…/v1</c> would have resolved every route at
///   the host root.</item>
///   <item><b>UserAgent must PARSE as a header value</b> (review round 1, C4).
///   The typed client sets it with <c>ParseAdd</c>, which throws
///   <see cref="FormatException"/> on a malformed value — at the first
///   geocoding call or the first cold weather fetch, outside every catch of
///   <see cref="WeatherApiClient"/>. The probe is the same parser the client
///   uses, on a throwaway request: what passes here is exactly what
///   <c>ParseAdd</c> accepts.</item>
/// </list>
/// </summary>
public sealed class WeatherApiOptionsValidator : IValidateOptions<WeatherApiOptions>
{
    public ValidateOptionsResult Validate(string? name, WeatherApiOptions options)
    {
        if (!IsHttpsBaseUrl(options.BaseUrl))
        {
            return ValidateOptionsResult.Fail(
                $"{WeatherApiOptions.SectionName}:BaseUrl must be an absolute https URL " +
                "(the key and the place travel in the query string of every call).");
        }

        if (!IsValidUserAgent(options.UserAgent))
        {
            return ValidateOptionsResult.Fail(
                $"{WeatherApiOptions.SectionName}:UserAgent must be a valid User-Agent header value " +
                "(product tokens and parenthesised comments, e.g. \"SmartCrops/1.0 (https://example.test)\").");
        }

        return ValidateOptionsResult.Success;
    }

    /// <summary>True when <paramref name="value"/> is an absolute URL whose scheme is <c>https</c> — the path's trailing slash is the client's business, not this rule's.</summary>
    public static bool IsHttpsBaseUrl(string? value)
        => Uri.TryCreate(value, UriKind.Absolute, out var uri)
           && uri.Scheme == Uri.UriSchemeHttps;

    /// <summary>True when <paramref name="value"/> parses as a User-Agent header — the client's own <c>ParseAdd</c> rule.</summary>
    public static bool IsValidUserAgent(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        using var probe = new HttpRequestMessage();
        return probe.Headers.UserAgent.TryParseAdd(value);
    }
}
