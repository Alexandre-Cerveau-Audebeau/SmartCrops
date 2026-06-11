using System.Net;
using Microsoft.Extensions.Logging;
using SmartCrops.Infrastructure.ExternalApis.Logging;

namespace SmartCrops.Api.Tests.ExternalApis.Logging;

/// <summary>
/// Unit tests for <see cref="RedactingHttpClientLogger"/> — the guarantee that the
/// Perenual <c>key=</c> / Trefle <c>token=</c> credential never reaches the logs via
/// the default IHttpClientFactory request-URI logging (SMA-104). Covers the pure
/// <see cref="RedactingHttpClientLogger.RedactUri"/> helper and the emitted message
/// on the <c>LogRequestStart</c> path.
/// </summary>
public class RedactingHttpClientLoggerTests
{
    // Synthetic, obviously-fake secrets — never real credentials.
    private const string PerenualKey = "sk-SECRET123-FAKE-DO-NOT-USE";
    private const string TrefleToken = "tok-SECRET456-FAKE-DO-NOT-USE";

    [Fact]
    public void RedactUri_PerenualKey_IsRedacted()
    {
        var uri = new Uri($"https://perenual.com/api/v2/species-list?key={PerenualKey}&q=rose");

        var result = RedactingHttpClientLogger.RedactUri(uri);

        Assert.Contains("key=REDACTED", result);
        Assert.DoesNotContain(PerenualKey, result);
        // Non-secret query params are preserved.
        Assert.Contains("q=rose", result);
    }

    [Fact]
    public void RedactUri_TrefleToken_IsRedacted()
    {
        var uri = new Uri($"https://trefle.io/api/v1/species/123?token={TrefleToken}");

        var result = RedactingHttpClientLogger.RedactUri(uri);

        Assert.Contains("token=REDACTED", result);
        Assert.DoesNotContain(TrefleToken, result);
    }

    [Fact]
    public void RedactUri_BothCredentials_AreRedacted()
    {
        var uri = new Uri($"https://example.test/x?key={PerenualKey}&token={TrefleToken}");

        var result = RedactingHttpClientLogger.RedactUri(uri);

        Assert.Contains("key=REDACTED", result);
        Assert.Contains("token=REDACTED", result);
        Assert.DoesNotContain(PerenualKey, result);
        Assert.DoesNotContain(TrefleToken, result);
    }

    [Fact]
    public void RedactUri_NoSecret_IsUnchanged()
    {
        // A GBIF call carries no credential — the URI must pass through verbatim.
        var raw = "https://api.gbif.org/v1/species/match?name=Anemone%20nemorosa&verbose=true";
        var uri = new Uri(raw);

        var result = RedactingHttpClientLogger.RedactUri(uri);

        Assert.Equal(raw, result);
    }

    [Fact]
    public void RedactUri_Null_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, RedactingHttpClientLogger.RedactUri(null));
    }

    [Fact]
    public void LogRequestStart_EmitsRedactedUri_NotTheSecret()
    {
        var logger = new CapturingLogger<RedactingHttpClientLogger>();
        var sut = new RedactingHttpClientLogger(logger);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://perenual.com/api/v2/species-list?key={PerenualKey}&q=rose");

        sut.LogRequestStart(request);

        var message = Assert.Single(logger.Messages);
        Assert.Contains("key=REDACTED", message);
        Assert.DoesNotContain(PerenualKey, message);
        Assert.Contains("GET", message);
    }

    [Fact]
    public void LogRequestStop_EmitsRedactedUri_NotTheSecret()
    {
        var logger = new CapturingLogger<RedactingHttpClientLogger>();
        var sut = new RedactingHttpClientLogger(logger);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://trefle.io/api/v1/species/123?token={TrefleToken}");
        using var response = new HttpResponseMessage(HttpStatusCode.OK);

        sut.LogRequestStop(null, request, response, TimeSpan.FromMilliseconds(25));

        var message = Assert.Single(logger.Messages);
        Assert.Contains("token=REDACTED", message);
        Assert.DoesNotContain(TrefleToken, message);
    }

    [Fact]
    public void LogRequestFailed_EmitsRedactedUri_NotTheSecret()
    {
        var logger = new CapturingLogger<RedactingHttpClientLogger>();
        var sut = new RedactingHttpClientLogger(logger);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://perenual.com/api/v2/species-list?key={PerenualKey}&q=rose");

        sut.LogRequestFailed(null, request, null, new HttpRequestException("boom"), TimeSpan.FromMilliseconds(25));

        var message = Assert.Single(logger.Messages);
        Assert.Contains("key=REDACTED", message);
        Assert.DoesNotContain(PerenualKey, message);
    }

    /// <summary>
    /// Minimal <see cref="ILogger{T}"/> that captures the formatted message text of
    /// each log call so a test can assert on what would actually be written.
    /// </summary>
    private sealed class CapturingLogger<T> : ILogger<T>
    {
        public List<string> Messages { get; } = new();

        public IDisposable BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
            => Messages.Add(formatter(state, exception));

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            public void Dispose() { }
        }
    }
}
