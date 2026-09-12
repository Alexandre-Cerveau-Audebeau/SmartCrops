using System.Globalization;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Polly.Timeout;
using SmartCrops.Infrastructure.ExternalApis.WeatherApi;

namespace SmartCrops.Api.Tests.ExternalApis.WeatherApi;

/// <summary>
/// Unit tests for <see cref="WeatherApiClient"/> on the hand-rolled
/// <see cref="HttpMessageHandler"/> pattern of <c>TrefleClientTests</c>. What
/// they pin: the exact URLs (key, invariant coordinates, the four flags), the
/// binding of the synthetic bodies, and above all the CLASSIFICATION — every
/// documented provider code lands on the failure kind the product branches on,
/// a missing key produces no request at all, and every transport-level
/// failure the resilience pipeline can surface reads as <c>Transport</c>.
/// </summary>
public class WeatherApiClientTests
{
    // Synthetic, obviously-fake credential — never a real one.
    private const string TestKey = "test-key-FAKE-DO-NOT-USE";

    private static WeatherApiClient NewClient(
        HttpMessageHandler handler,
        string apiKey = TestKey,
        ILogger<WeatherApiClient>? logger = null,
        int forecastDays = 5)
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.weatherapi.com/v1/") };
        var options = Options.Create(new WeatherApiOptions { ApiKey = apiKey, ForecastDays = forecastDays });
        return new WeatherApiClient(http, options, logger ?? NullLogger<WeatherApiClient>.Instance);
    }

    private static string ErrorBody(int code) =>
        $"{{\"error\":{{\"code\":{code},\"message\":\"synthetic message for {code}\"}}}}";

    // ── URL composition ──────────────────────────────────────────────────────

    [Fact]
    public async Task SearchAsync_BuildsUrl_WithKeyAndEncodedQuery()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, "[]");
        var client = NewClient(handler);

        await client.SearchAsync("Saint-Étienne", CancellationToken.None);

        Assert.Equal(
            $"https://api.weatherapi.com/v1/search.json?key={TestKey}&q=Saint-%C3%89tienne",
            handler.LastRequestUri!.AbsoluteUri);
    }

    [Fact]
    public async Task ForecastAsync_BuildsUrl_WithInvariantCoordinatesAndFlags()
    {
        // Under fr-FR a naive format writes « 45,7640 » — a different query.
        var previous = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = new CultureInfo("fr-FR");
        try
        {
            var handler = new RecordingHandler(HttpStatusCode.OK, WeatherApiFixtures.Forecast);
            var client = NewClient(handler);

            await client.ForecastAsync(45.764, 4.8357, "fr", CancellationToken.None);

            Assert.Equal(
                $"https://api.weatherapi.com/v1/forecast.json?key={TestKey}&q=45.7640,4.8357&days=5&alerts=yes&aqi=no&lang=fr",
                handler.LastRequestUri!.AbsoluteUri);
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    [Fact]
    public async Task ForecastAsync_NegativeCoordinates_AndDefaultLanguage()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, WeatherApiFixtures.Forecast);
        var client = NewClient(handler);

        await client.ForecastAsync(-33.8688, -151.2093, null, CancellationToken.None);

        Assert.Contains("&q=-33.8688,-151.2093&", handler.LastRequestUri!.AbsoluteUri);
        Assert.EndsWith("&lang=fr", handler.LastRequestUri.AbsoluteUri);
    }

    // ── Binding the documented shapes ────────────────────────────────────────

    [Fact]
    public async Task ForecastAsync_ParsesSyntheticFixture()
    {
        var client = NewClient(new RecordingHandler(HttpStatusCode.OK, WeatherApiFixtures.Forecast));

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.True(result.IsSuccess);
        var body = result.Value;
        Assert.Equal("Lyon", body.Location!.Name);
        Assert.Equal("Europe/Paris", body.Location.TzId);
        Assert.Equal("2026-09-12 14:30", body.Location.Localtime);
        Assert.Equal(24.0, body.Current!.TempC);
        Assert.Equal(1, body.Current.IsDay);
        Assert.Equal(1000, body.Current.Condition!.Code);
        Assert.Equal("Ensoleillé", body.Current.Condition.Text);

        var days = body.Forecast!.Forecastday!;
        Assert.Equal(5, days.Count);
        Assert.Equal("2026-09-12", days[0].Date);
        var today = days[0].Day!;
        Assert.Equal(16.0, today.MintempC);
        Assert.Equal(29.0, today.MaxtempC);
        Assert.Equal(0, today.DailyChanceOfRain);
        var todayHours = days[0].Hour!;
        Assert.Equal(24, todayHours.Count);
        Assert.Equal("2026-09-12 13:00", todayHours[13].Time);
        Assert.Equal(3, days[2].Hour!.Count);
        var thursday = days[3].Day!;
        Assert.Equal(1189, thursday.Condition!.Code);
        Assert.Equal(80, thursday.DailyChanceOfRain);
        Assert.Equal(55.1, thursday.MaxwindKph);
        Assert.Equal("07:16 AM", days[0].Astro!.Sunrise);

        var alert = Assert.Single(body.Alerts!.Alert!);
        Assert.Equal("Vent violent", alert.Event);
        Assert.Equal("Moderate", alert.Severity);
        Assert.Equal("Alert", alert.MsgType);
        Assert.Equal("Rafales jusqu'à 90 km/h attendues en plaine.", alert.Description);
    }

    [Fact]
    public async Task SearchAsync_ParsesSyntheticFixture()
    {
        var client = NewClient(new RecordingHandler(HttpStatusCode.OK, WeatherApiFixtures.Search));

        var result = await client.SearchAsync("Paris", CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value.Locations.Count);
        Assert.Equal("Paris", result.Value.Locations[0].Name);
        Assert.Equal("France", result.Value.Locations[0].Country);
        Assert.Equal(48.87, result.Value.Locations[0].Lat);
        Assert.Equal(2.33, result.Value.Locations[0].Lon);
        Assert.Equal("United States of America", result.Value.Locations[1].Country);
        Assert.Equal(-95.56, result.Value.Locations[1].Lon);
    }

    [Fact]
    public async Task SearchAsync_EmptyArray_IsSuccessWithNoLocation()
    {
        // The other spelling of « nothing matches » (next to code 1006).
        var client = NewClient(new RecordingHandler(HttpStatusCode.OK, "[]"));

        var result = await client.SearchAsync("zzzzqqq", CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value.Locations);
    }

    [Fact]
    public async Task Alerts_BindBothDocumentedSpellings()
    {
        // The field table says msgType / desc; the example answer says msgtype;
        // a body spelling description in full must land on the same property.
        const string tableSpelling = """
            {"location":{"name":"Lyon"},"alerts":{"alert":[{"headline":"h","msgType":"Update","severity":"Severe","description":"long form"}]}}
            """;
        const string exampleSpelling = """
            {"location":{"name":"Lyon"},"alerts":{"alert":[{"headline":"h","msgtype":"Alert","severity":"Moderate","desc":"short form"}]}}
            """;

        var fromTable = await NewClient(new RecordingHandler(HttpStatusCode.OK, tableSpelling))
            .ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);
        var fromExample = await NewClient(new RecordingHandler(HttpStatusCode.OK, exampleSpelling))
            .ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        var a = Assert.Single(fromTable.Value!.Alerts!.Alert!);
        Assert.Equal("Update", a.MsgType);
        Assert.Equal("long form", a.Description);
        var b = Assert.Single(fromExample.Value!.Alerts!.Alert!);
        Assert.Equal("Alert", b.MsgType);
        Assert.Equal("short form", b.Description);
    }

    [Fact]
    public void Models_BindNoIcon_AndNoImperialTwin()
    {
        // The provider's icon URL is never shown nor persisted, and the browser
        // converts units (D9): none of the wire models may bind them, whatever
        // a future edit adds. Reflection over every model in the namespace.
        var models = typeof(WeatherApiClient).Assembly.GetTypes()
            .Where(t => t.Namespace == typeof(WeatherApiClient).Namespace && t.IsClass && t.IsSealed);
        Assert.NotEmpty(models);

        foreach (var model in models)
        {
            foreach (var property in model.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                var wireName = property.GetCustomAttribute<JsonPropertyNameAttribute>()?.Name;
                if (wireName is null) continue;
                Assert.NotEqual("icon", wireName);
                Assert.False(wireName.EndsWith("_f", StringComparison.Ordinal), $"{model.Name}.{wireName}");
                Assert.False(wireName.EndsWith("_mph", StringComparison.Ordinal), $"{model.Name}.{wireName}");
                Assert.False(wireName.EndsWith("_in", StringComparison.Ordinal), $"{model.Name}.{wireName}");
                Assert.False(wireName.EndsWith("_miles", StringComparison.Ordinal), $"{model.Name}.{wireName}");
            }
        }

        Assert.Null(typeof(WeatherApiCondition).GetProperty("Icon"));
    }

    // ── Classification of provider codes ─────────────────────────────────────

    [Theory]
    [InlineData(1006, HttpStatusCode.BadRequest, WeatherApiFailureKind.NoLocation)]
    [InlineData(2007, HttpStatusCode.Forbidden, WeatherApiFailureKind.Refused)]
    [InlineData(2009, HttpStatusCode.Forbidden, WeatherApiFailureKind.Refused)]
    [InlineData(1002, HttpStatusCode.Unauthorized, WeatherApiFailureKind.Misconfigured)]
    [InlineData(2006, HttpStatusCode.Unauthorized, WeatherApiFailureKind.Misconfigured)]
    [InlineData(2008, HttpStatusCode.Forbidden, WeatherApiFailureKind.Misconfigured)]
    [InlineData(9999, HttpStatusCode.BadRequest, WeatherApiFailureKind.Transport)]
    public async Task ForecastAsync_ClassifiesProviderCode(int code, HttpStatusCode status, WeatherApiFailureKind expected)
    {
        var client = NewClient(new RecordingHandler(status, ErrorBody(code)));

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(expected, result.Failure.Kind);
        Assert.Equal(code, result.Failure.ProviderCode);
        Assert.Equal((int)status, result.Failure.HttpStatus);
    }

    [Fact]
    public async Task SearchAsync_NoLocationCode_IsNoLocation()
    {
        var client = NewClient(new RecordingHandler(HttpStatusCode.BadRequest, ErrorBody(1006)));

        var result = await client.SearchAsync("nowhere", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(WeatherApiFailureKind.NoLocation, result.Failure.Kind);
    }

    [Fact]
    public async Task ForecastAsync_ServerError_IsTransport()
    {
        var client = NewClient(new RecordingHandler(HttpStatusCode.ServiceUnavailable, ""));

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(WeatherApiFailureKind.Transport, result.Failure.Kind);
        Assert.Null(result.Failure.ProviderCode);
        Assert.Equal(503, result.Failure.HttpStatus);
    }

    [Fact]
    public async Task ForecastAsync_ErrorStatusWithHtmlBody_IsTransport()
    {
        // A 4xx whose body is not the envelope carries no code to classify.
        var client = NewClient(new HtmlHandler("<html>gateway</html>", HttpStatusCode.BadGateway));

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(WeatherApiFailureKind.Transport, result.Failure.Kind);
        Assert.Null(result.Failure.ProviderCode);
    }

    [Fact]
    public async Task ForecastAsync_HtmlOk_IsTransport()
    {
        var client = NewClient(new HtmlHandler("<html>maintenance</html>", HttpStatusCode.OK));

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(WeatherApiFailureKind.Transport, result.Failure.Kind);
    }

    [Fact]
    public async Task ForecastAsync_MalformedJson_IsTransport()
    {
        var client = NewClient(new RecordingHandler(HttpStatusCode.OK, "{ not json"));

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(WeatherApiFailureKind.Transport, result.Failure.Kind);
    }

    [Fact]
    public async Task ForecastAsync_TruncatedDays_IsSuccess_AndWarns()
    {
        // A key served fewer days than requested: still weather. The rows that
        // came back are the answer, and the shortfall is said once.
        const string threeDays = """
            {"location":{"name":"Lyon"},"current":{"temp_c":20.0},
             "forecast":{"forecastday":[{"date":"2026-09-12"},{"date":"2026-09-13"},{"date":"2026-09-14"}]}}
            """;
        var logger = new CapturingLogger();
        var client = NewClient(new RecordingHandler(HttpStatusCode.OK, threeDays), logger: logger);

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(3, result.Value.Forecast!.Forecastday!.Count);
        Assert.Contains(logger.Entries, e => e.Level == LogLevel.Warning && e.Message.Contains("3 day(s)"));
    }

    // ── Missing key: no request at all ───────────────────────────────────────

    [Fact]
    public async Task ForecastAsync_MissingKey_FailsWithoutCalling()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, WeatherApiFixtures.Forecast);
        var client = NewClient(handler, apiKey: "");

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(WeatherApiFailureKind.MissingKey, result.Failure.Kind);
        Assert.Null(handler.LastRequestUri);
    }

    [Fact]
    public async Task SearchAsync_MissingKey_FailsWithoutCalling()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK, WeatherApiFixtures.Search);
        var client = NewClient(handler, apiKey: "   ");

        var result = await client.SearchAsync("Lyon", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(WeatherApiFailureKind.MissingKey, result.Failure.Kind);
        Assert.Null(handler.LastRequestUri);
    }

    // ── Transport-level failures ─────────────────────────────────────────────

    [Fact]
    public async Task ForecastAsync_TransportException_IsTransport()
    {
        var client = NewClient(new ThrowingHandler(new HttpRequestException("dns failure")));

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(WeatherApiFailureKind.Transport, result.Failure.Kind);
    }

    [Fact]
    public async Task ForecastAsync_HttpClientTimeout_IsTransport()
    {
        // HttpClient.Timeout surfaces as TaskCanceledException on a token that
        // is not the caller's — a transport failure, not a caller's decision.
        var client = NewClient(new ThrowingHandler(new TaskCanceledException("request timed out")));

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(WeatherApiFailureKind.Transport, result.Failure.Kind);
    }

    [Fact]
    public async Task ForecastAsync_PollyTimeoutRejected_IsTransport()
    {
        // The standard resilience handler's TotalRequestTimeout throws this when
        // retries cannot complete within the pipeline's budget.
        var client = NewClient(new ThrowingHandler(new TimeoutRejectedException("pipeline budget exhausted")));

        var result = await client.ForecastAsync(45.75, 4.85, "fr", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(WeatherApiFailureKind.Transport, result.Failure.Kind);
    }

    [Fact]
    public async Task ForecastAsync_CallerCancellation_Propagates()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var client = NewClient(new RecordingHandler(HttpStatusCode.OK, WeatherApiFixtures.Forecast));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => client.ForecastAsync(45.75, 4.85, "fr", cts.Token));
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _status;
        private readonly string _json;
        public Uri? LastRequestUri { get; private set; }

        public RecordingHandler(HttpStatusCode status, string json)
        {
            _status = status;
            _json = json;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            LastRequestUri = request.RequestUri;
            return Task.FromResult(new HttpResponseMessage(_status)
            {
                Content = new StringContent(_json, Encoding.UTF8, "application/json"),
            });
        }
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        private readonly Exception _ex;
        public ThrowingHandler(Exception ex) => _ex = ex;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
            => throw _ex;
    }

    private sealed class HtmlHandler : HttpMessageHandler
    {
        private readonly string _content;
        private readonly HttpStatusCode _status;

        public HtmlHandler(string content, HttpStatusCode status)
        {
            _content = content;
            _status = status;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(new HttpResponseMessage(_status)
            {
                Content = new StringContent(_content, Encoding.UTF8, "text/html"),
            });
        }
    }

    /// <summary>Captures level and formatted message of every log call.</summary>
    private sealed class CapturingLogger : ILogger<WeatherApiClient>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = new();

        public IDisposable BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
            => Entries.Add((logLevel, formatter(state, exception)));

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            public void Dispose() { }
        }
    }
}
