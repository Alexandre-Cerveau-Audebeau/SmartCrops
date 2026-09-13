using Microsoft.Extensions.Options;

namespace SmartCrops.Infrastructure.ExternalApis.WeatherApi;

/// <summary>
/// Startup validation of <see cref="WeatherApiOptions"/> beyond what data
/// annotations can say (SMA-336 PR 3a/5, review round 1, C4): the User-Agent
/// must PARSE as a header value. The typed client sets it with
/// <c>ParseAdd</c>, which throws <see cref="FormatException"/> on a malformed
/// value — at the first geocoding call or the first cold weather fetch, outside
/// every catch of <see cref="WeatherApiClient"/>. Registered as
/// <see cref="IValidateOptions{TOptions}"/> and armed by <c>ValidateOnStart</c>,
/// so a bad value fails the boot with a message naming the setting, never the
/// first dashboard with a 500.
///
/// <para>The probe is the same parser the client uses, on a throwaway request:
/// what passes here is exactly what <c>ParseAdd</c> accepts.</para>
/// </summary>
public sealed class WeatherApiOptionsValidator : IValidateOptions<WeatherApiOptions>
{
    public ValidateOptionsResult Validate(string? name, WeatherApiOptions options)
    {
        if (!IsValidUserAgent(options.UserAgent))
        {
            return ValidateOptionsResult.Fail(
                $"{WeatherApiOptions.SectionName}:UserAgent must be a valid User-Agent header value " +
                "(product tokens and parenthesised comments, e.g. \"SmartCrops/1.0 (https://example.test)\").");
        }

        return ValidateOptionsResult.Success;
    }

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
