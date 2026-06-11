using Microsoft.Extensions.Http.Logging;
using Microsoft.Extensions.Logging;
using SmartCrops.Infrastructure.ExternalApis.Perenual;
using SmartCrops.Infrastructure.ExternalApis.Trefle;

namespace SmartCrops.Infrastructure.ExternalApis.Logging;

/// <summary>
/// Drop-in replacement for the default <c>IHttpClientFactory</c> request/response
/// logging that <b>redacts API credentials carried in the request URI query
/// string</b> (Perenual <c>key=</c>, Trefle <c>token=</c>) before anything is
/// written to the logs.
///
/// <para>The framework's stock <c>LoggingScopeHttpMessageHandler</c> /
/// <c>LoggingHttpMessageHandler</c> emit the full request URI at
/// <see cref="LogLevel.Information"/> (e.g. <c>Sending HTTP request GET
/// https://perenual.com/...?key=sk-...</c>), which leaks the secret into stdout —
/// a real exposure on a public repo (SMA-104). A plain <c>DelegatingHandler</c>
/// can't fix this: it runs <i>inside</i> those logging handlers, after the URI has
/// already been logged. Wiring this logger via
/// <c>RemoveAllLoggers().AddLogger&lt;RedactingHttpClientLogger&gt;()</c> on the
/// credential-bearing typed clients replaces that logging entirely.</para>
///
/// <para>Diagnostics are preserved — method, status code and elapsed time are still
/// logged; only the URI is scrubbed. Redaction reuses the existing
/// <see cref="PerenualKeyRedactor"/> / <see cref="TrefleTokenRedactor"/> regex with
/// a <c>null</c> secret: the value after <c>key=</c>/<c>token=</c> is neutralised
/// regardless of the configured key, so the logger stays stateless and needs no
/// options. Combining the two into one shared redaction primitive is tracked by
/// SMA-90.</para>
/// </summary>
public sealed class RedactingHttpClientLogger : IHttpClientLogger
{
    private readonly ILogger<RedactingHttpClientLogger> _logger;

    public RedactingHttpClientLogger(ILogger<RedactingHttpClientLogger> logger)
        => _logger = logger;

    /// <summary>
    /// Returns the request URI as a string with any <c>key=</c> (Perenual) and
    /// <c>token=</c> (Trefle) credential value replaced by
    /// <see cref="PerenualKeyRedactor.Placeholder"/>. A URI carrying no credential
    /// (e.g. a GBIF call) is returned unchanged. <c>null</c> → empty string.
    ///
    /// <para><c>internal</c> by design: this is an implementation detail of the
    /// logger, not a shared redaction primitive (it covers only this logger's two
    /// known credential parameters — unlike the public
    /// <see cref="PerenualKeyRedactor"/> / <see cref="TrefleTokenRedactor"/>).
    /// Exposed to the test assembly via <c>InternalsVisibleTo</c>.</para>
    /// </summary>
    internal static string RedactUri(Uri? uri)
    {
        if (uri is null)
        {
            return string.Empty;
        }

        // AbsoluteUri (not ToString()) preserves percent-encoding — ToString()
        // decodes %20→space etc., mutating the URI it logs. By the send time a
        // typed client's RequestUri is absolute; guard for a relative URI anyway.
        var raw = uri.IsAbsoluteUri ? uri.AbsoluteUri : uri.ToString();
        // Regex-only redaction (secret arg null): a request URI only ever carries
        // the credential as ?key=.../?token=..., so neutralising the value after
        // those parameter names fully covers the log path without the exact key.
        return TrefleTokenRedactor.Redact(PerenualKeyRedactor.Redact(raw, null), null);
    }

    public object? LogRequestStart(HttpRequestMessage request)
    {
        _logger.LogInformation(
            "Sending HTTP request {Method} {Uri}",
            request.Method, RedactUri(request.RequestUri));
        return null;
    }

    public void LogRequestStop(
        object? context,
        HttpRequestMessage request,
        HttpResponseMessage response,
        TimeSpan elapsed)
    {
        _logger.LogInformation(
            "Received HTTP response {Method} {Uri} - {StatusCode} in {ElapsedMs}ms",
            request.Method, RedactUri(request.RequestUri), (int)response.StatusCode, elapsed.TotalMilliseconds);
    }

    public void LogRequestFailed(
        object? context,
        HttpRequestMessage request,
        HttpResponseMessage? response,
        Exception exception,
        TimeSpan elapsed)
    {
        // The exception carries no raw URI; the only URI logged is the redacted one.
        _logger.LogError(
            exception,
            "HTTP request failed {Method} {Uri} after {ElapsedMs}ms",
            request.Method, RedactUri(request.RequestUri), elapsed.TotalMilliseconds);
    }
}
