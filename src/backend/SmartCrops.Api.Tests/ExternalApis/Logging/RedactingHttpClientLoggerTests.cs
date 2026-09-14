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
    public void RedactUri_WeatherApiForecast_RedactsKeyAndCoordinates_KeepsTheRest()
    {
        // SMA-336 PR 3a/5: WeatherAPI.com carries its credential as `key=` too,
        // so the Perenual rule covers it with no change. Review round 1: its
        // q= is a garden's coordinates — the user's place — and is scrubbed as
        // well, while the parameters that say WHAT was asked stay readable.
        var uri = new Uri($"https://api.weatherapi.com/v1/forecast.json?key={PerenualKey}&q=45.7640,4.8357&days=5&alerts=yes&aqi=no&lang=fr");

        var result = RedactingHttpClientLogger.RedactUri(uri);

        Assert.Contains("key=REDACTED", result);
        Assert.DoesNotContain(PerenualKey, result);
        Assert.Contains("q=REDACTED", result);
        Assert.DoesNotContain("45.7640", result);
        Assert.DoesNotContain("4.8357", result);
        Assert.Contains("days=5", result);
        Assert.Contains("alerts=yes", result);
        Assert.Contains("aqi=no", result);
        Assert.Contains("lang=fr", result);
    }

    [Fact]
    public void RedactUri_WeatherApiSearch_RedactsKeyAndTypedQuery()
    {
        // The geocoding field forwards what the user typed — a town, as often
        // an address. Neither the key nor the text may reach the log.
        var uri = new Uri("https://api.weatherapi.com/v1/search.json?key=abc&q=lyon");

        var result = RedactingHttpClientLogger.RedactUri(uri);

        Assert.Equal("https://api.weatherapi.com/v1/search.json?key=REDACTED&q=REDACTED", result);
    }

    [Fact]
    public void RedactUri_WeatherApiSearch_EncodedAddress_IsRedacted()
    {
        var uri = new Uri($"https://api.weatherapi.com/v1/search.json?key={PerenualKey}&q=12%20rue%20des%20Lilas%2C%20Lyon");

        var result = RedactingHttpClientLogger.RedactUri(uri);

        Assert.Contains("q=REDACTED", result);
        Assert.DoesNotContain("rue", result);
        Assert.DoesNotContain("Lilas", result);
        Assert.DoesNotContain("Lyon", result);
    }

    [Fact]
    public void RedactUri_WeatherApiEndpointOnAnotherHost_IsStillRedacted()
    {
        // The base URL is configurable; the two endpoint paths are not — a
        // proxy in front of the provider must not un-scrub the place.
        var uri = new Uri("https://weather-proxy.internal/v1/forecast.json?key=abc&q=45.7640,4.8357&days=5");

        var result = RedactingHttpClientLogger.RedactUri(uri);

        Assert.Contains("q=REDACTED", result);
        Assert.DoesNotContain("45.7640", result);
        Assert.Contains("days=5", result);
    }

    [Fact]
    public void RedactUri_QueryOutsideWeatherApi_IsKept()
    {
        // The Perenual catalog sends a q= too — a plant name, not a person's
        // place — and its line stays readable (the first test pins q=rose as
        // well; this one pins the rule by name).
        var uri = new Uri("https://perenual.com/api/v2/species-list?key=abc&q=lavandula&page=2");

        var result = RedactingHttpClientLogger.RedactUri(uri);

        Assert.Equal("https://perenual.com/api/v2/species-list?key=REDACTED&q=lavandula&page=2", result);
    }

    [Fact]
    public void LogRequestStart_WeatherApiSearch_NeverEmitsTheTypedText()
    {
        var logger = new CapturingLogger<RedactingHttpClientLogger>();
        var sut = new RedactingHttpClientLogger(logger);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://api.weatherapi.com/v1/search.json?key={PerenualKey}&q=12%20rue%20des%20Lilas");

        sut.LogRequestStart(request);

        var message = Assert.Single(logger.Messages);
        Assert.Contains("key=REDACTED", message);
        Assert.Contains("q=REDACTED", message);
        Assert.DoesNotContain(PerenualKey, message);
        Assert.DoesNotContain("Lilas", message);
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
