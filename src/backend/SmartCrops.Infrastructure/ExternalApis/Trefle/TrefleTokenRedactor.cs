using System.Text.RegularExpressions;

namespace SmartCrops.Infrastructure.ExternalApis.Trefle;

/// <summary>
/// Scrubs the Trefle API token out of a raw response body before it is persisted
/// to <c>PlantTrefleData.RawResponseJson</c> (SMA-71 verbatim capture).
///
/// <para>Trefle requires the token on every request as a <c>?token=...</c> query
/// parameter. The <c>/species/{id}</c> response body does NOT echo it today
/// (verified: top-level <c>data</c>/<c>meta</c>, no <c>links</c>), so this is a
/// defence-in-depth net for a credential-bearing API — belt-and-braces consistent
/// with <c>PerenualKeyRedactor</c> (#102): if Trefle ever starts echoing the token
/// in a self-link, the verbatim capture can never make it durable at rest.</para>
/// </summary>
public static partial class TrefleTokenRedactor
{
    /// <summary>Replacement substituted for the token.</summary>
    public const string Placeholder = "REDACTED";

    // Residual-guard pattern built FROM Placeholder (not a hardcoded "REDACTED") so
    // AssertRedacted can never drift out of sync with Redact if the placeholder
    // changes. Const string concatenation is evaluated at compile time, so it is
    // still a valid [GeneratedRegex] argument.
    private const string ResidualTokenPattern =
        @"\b(token)=(?!" + Placeholder + @"\b)[^&""'\s<>\\]+";

    // Matches a `token=<value>` query parameter, the value running until the next
    // URL/JSON delimiter. Covers `?token=`, `&token=`, and the `&amp;token=` form.
    [GeneratedRegex(@"(\btoken=)[^&""'\s<>\\]+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex TokenParamRegex();

    /// <summary>
    /// Returns <paramref name="body"/> with the token removed two ways: (1) the
    /// exact configured <paramref name="token"/> string is replaced wherever it
    /// appears, and (2) any residual <c>token=...</c> query-parameter value is
    /// replaced — so neither an unanticipated context nor a rotated token can leak.
    /// Only rewrites characters inside existing values, so valid JSON stays valid.
    /// </summary>
    public static string Redact(string? body, string? token)
    {
        if (string.IsNullOrEmpty(body))
        {
            return body ?? string.Empty;
        }

        var scrubbed = body;
        if (!string.IsNullOrEmpty(token))
        {
            scrubbed = scrubbed.Replace(token, Placeholder, StringComparison.Ordinal);
        }

        return TokenParamRegex().Replace(scrubbed, $"${{1}}{Placeholder}");
    }

    // Detects a token= parameter whose value did NOT get redacted — a credential
    // that slipped past Redact. Group 1 captures the parameter NAME only (never the
    // value), so it is safe to surface in an exception message. The negative
    // lookahead references <see cref="Placeholder"/> via ResidualTokenPattern.
    [GeneratedRegex(ResidualTokenPattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ResidualTokenRegex();

    /// <summary>
    /// Persistence-boundary fail-fast guard (SMA-71 second line of defence). Throws
    /// <see cref="InvalidOperationException"/> when <paramref name="json"/> still
    /// carries a non-redacted <c>token=</c> credential, so a regression in the
    /// single-point client-side <see cref="Redact"/> can never make a secret durable.
    /// Deliberately throws rather than re-scrubbing silently: a leak that reaches
    /// here is a BUG and must surface. The message names only the parameter, never
    /// its value.
    /// </summary>
    public static void AssertRedacted(string? json, string context)
    {
        if (string.IsNullOrEmpty(json))
        {
            return;
        }

        var residual = ResidualTokenRegex().Match(json);
        if (residual.Success)
        {
            throw new InvalidOperationException(
                $"Refusing to persist a non-redacted Trefle credential to {context}: " +
                $"the '{residual.Groups[1].Value}' query parameter survived redaction.");
        }
    }
}
