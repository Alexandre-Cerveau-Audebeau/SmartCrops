using System.Text.RegularExpressions;

namespace SmartCrops.Infrastructure.ExternalApis.Perenual;

/// <summary>
/// Scrubs the Perenual API key out of a raw response body before it is persisted
/// to <c>PlantPerenualData.LiteralResponseJson</c> / <c>CareGuideResponseJson</c>.
///
/// <para>Perenual echoes the caller's key back inside URL fields — notably
/// <c>care_guides</c> and <c>hardiness_location.full_url</c>/<c>full_iframe</c> —
/// as a <c>key=...</c> query parameter. Persisting the verbatim body (the SMA-71
/// loss-proof capture) would therefore leak the secret into the database, which
/// is exactly why those fields were excluded from the deserialise-then-reserialise
/// audit JSON. This redactor lets us keep the literal body while guaranteeing the
/// key never lands at rest.</para>
/// </summary>
public static partial class PerenualKeyRedactor
{
    /// <summary>Replacement token substituted for the API key.</summary>
    public const string Placeholder = "REDACTED";

    // Matches a `key=<value>` query parameter, the value running until the next
    // URL/JSON delimiter. Covers `?key=`, `&key=`, and the `&amp;key=` form that
    // appears inside the embedded hardiness-map <iframe> src.
    [GeneratedRegex(@"(\bkey=)[^&""'\s<>\\]+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex KeyParamRegex();

    /// <summary>
    /// Returns <paramref name="body"/> with the API key removed two ways, belt
    /// and braces: (1) the exact configured <paramref name="apiKey"/> string is
    /// replaced wherever it appears, and (2) any residual <c>key=...</c>
    /// query-parameter value is replaced — so neither an unanticipated context
    /// nor a rotated key can leak. Redaction only rewrites characters inside
    /// existing string values, so a valid JSON body stays valid JSON.
    /// </summary>
    public static string Redact(string? body, string? apiKey)
    {
        if (string.IsNullOrEmpty(body))
        {
            return body ?? string.Empty;
        }

        var scrubbed = body;
        if (!string.IsNullOrEmpty(apiKey))
        {
            scrubbed = scrubbed.Replace(apiKey, Placeholder, StringComparison.Ordinal);
        }

        return KeyParamRegex().Replace(scrubbed, $"${{1}}{Placeholder}");
    }

    // Detects a key= / api_key= parameter whose value did NOT get redacted —
    // a credential that slipped past Redact. Group 1 captures the parameter NAME
    // only (never the value), so it is safe to surface in an exception message.
    [GeneratedRegex(@"\b((?:api_)?key)=(?!REDACTED\b)[^&""'\s<>\\]+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ResidualKeyRegex();

    /// <summary>
    /// Persistence-boundary fail-fast guard (SMA-71 second line of defence).
    /// Throws <see cref="InvalidOperationException"/> when <paramref name="json"/>
    /// still carries a non-redacted <c>key=</c>/<c>api_key=</c> credential, so a
    /// regression in the single-point client-side <see cref="Redact"/> can never
    /// make a secret durable in the database. Deliberately throws rather than
    /// re-scrubbing silently: a leak that reaches here is a BUG and must surface,
    /// not be masked. The message names only the parameter, never its value.
    /// </summary>
    public static void AssertRedacted(string? json, string context)
    {
        if (string.IsNullOrEmpty(json))
        {
            return;
        }

        var match = ResidualKeyRegex().Match(json);
        if (match.Success)
        {
            throw new InvalidOperationException(
                $"Refusing to persist {context}: a non-redacted '{match.Groups[1].Value}=' credential parameter survived redaction — a PerenualKeyRedactor regression (SMA-71).");
        }
    }
}
