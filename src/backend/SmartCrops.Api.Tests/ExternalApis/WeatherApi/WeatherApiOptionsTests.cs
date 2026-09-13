using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SmartCrops.Infrastructure.ExternalApis.WeatherApi;

namespace SmartCrops.Api.Tests.ExternalApis.WeatherApi;

/// <summary>
/// SMA-336 PR 3a/5, review round 1 — the options contract of the weather
/// client as the host arms it (<c>ValidateDataAnnotations</c> plus
/// <see cref="WeatherApiOptionsValidator"/>): the shipped defaults pass; a
/// User-Agent that would make <c>ParseAdd</c> throw at the first call is
/// refused at options resolution instead, by name (C4).
/// </summary>
public class WeatherApiOptionsTests
{
    private static IOptions<WeatherApiOptions> Resolve(Action<WeatherApiOptions> configure)
    {
        var services = new ServiceCollection();
        services.AddOptions<WeatherApiOptions>().Configure(configure).ValidateDataAnnotations();
        services.AddSingleton<IValidateOptions<WeatherApiOptions>, WeatherApiOptionsValidator>();
        return services.BuildServiceProvider().GetRequiredService<IOptions<WeatherApiOptions>>();
    }

    [Fact]
    public void Defaults_AreValid()
    {
        var options = Resolve(_ => { }).Value;

        Assert.Equal("https://api.weatherapi.com/v1/", options.BaseUrl);
        Assert.Equal(string.Empty, options.ApiKey);
        Assert.Equal(4, options.MaxConcurrentCalls);
    }

    [Theory]
    [InlineData("SmartCrops/1.0 (https://github.com/Alexandre-Cerveau-Audebeau/SmartCrops)")]
    [InlineData("curl/8.4.0")]
    [InlineData("Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101")]
    public void UserAgent_ThatParses_IsAccepted(string userAgent)
    {
        var options = Resolve(o => o.UserAgent = userAgent).Value;

        Assert.Equal(userAgent, options.UserAgent);
    }

    [Theory]
    [InlineData("SmartCrops/1.0 (unbalanced")]
    [InlineData("SmartCrops/1.0/2.0")]
    [InlineData("bad\nvalue")]
    public void UserAgent_ThatWouldMakeParseAddThrow_IsRefusedByName(string userAgent)
    {
        // The proof that the probe is the client's own rule: ParseAdd rejects
        // the same value.
        using var probe = new HttpRequestMessage();
        Assert.Throws<FormatException>(() => probe.Headers.UserAgent.ParseAdd(userAgent));

        var ex = Assert.Throws<OptionsValidationException>(() => Resolve(o => o.UserAgent = userAgent).Value);

        Assert.Contains("WeatherApi:UserAgent", ex.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void UserAgent_Blank_IsRefused(string userAgent)
    {
        var ex = Assert.Throws<OptionsValidationException>(() => Resolve(o => o.UserAgent = userAgent).Value);

        Assert.Contains("UserAgent", ex.Message);
    }

    [Theory]
    [InlineData("http://api.weatherapi.com/v1/")]
    [InlineData("http://api.weatherapi.com/v1")]
    [InlineData("http://weather-proxy.internal/")]
    [InlineData("ftp://api.weatherapi.com/v1/")]
    public void BaseUrl_NotHttps_IsRefusedByName(string baseUrl)
    {
        // Review round 2 (S5): the key and the user's place travel in the
        // query string of every call. [Url] alone admits http:// (and ftp://),
        // which would put both on the wire in clear — the validator refuses
        // any scheme but https at boot, by name, with or without the path's
        // trailing slash (review round 3, D1).
        var ex = Assert.Throws<OptionsValidationException>(() => Resolve(o => o.BaseUrl = baseUrl).Value);

        Assert.Contains("WeatherApi:BaseUrl", ex.Message);
    }

    [Theory]
    [InlineData("https://api.weatherapi.com/v1/")]
    [InlineData("https://api.weatherapi.com/v1")]
    [InlineData("https://weather-proxy.internal/v1/")]
    [InlineData("https://weather-proxy.internal/v1")]
    public void BaseUrl_Https_IsAccepted(string baseUrl)
    {
        // With or without the trailing slash (review round 3, D1): the
        // validator accepts both spellings as given; the client makes them
        // the same base address before any request
        // (WeatherApiClientTests.BaseUrl_WithOrWithoutItsTrailingSlash_…).
        var options = Resolve(o => o.BaseUrl = baseUrl).Value;

        Assert.Equal(baseUrl, options.BaseUrl);
    }

    [Theory]
    [InlineData("v1/")]
    [InlineData("api.weatherapi.com/v1/")]
    public void BaseUrl_Relative_IsRefused(string baseUrl)
    {
        var ex = Assert.Throws<OptionsValidationException>(() => Resolve(o => o.BaseUrl = baseUrl).Value);

        Assert.Contains("BaseUrl", ex.Message);
    }

    [Fact]
    public void TimeoutSeconds_MinimumIsDerivedFromThePipelineTotal()
    {
        // Review round 1 (K2): the floor is a named constant, one above the
        // pipeline's total budget — never a literal that could drift.
        Assert.Equal(10, WeatherApiOptions.PipelineTotalTimeoutSeconds);
        Assert.Equal(11, WeatherApiOptions.MinTimeoutSeconds);
        Assert.True(WeatherApiOptions.PipelineSamplingDurationSeconds >= 2 * WeatherApiOptions.PipelineAttemptTimeoutSeconds);
    }

    [Theory]
    [InlineData(10)]
    [InlineData(1)]
    [InlineData(0)]
    public void TimeoutSeconds_AtOrBelowThePipelineTotal_IsRefused(int seconds)
    {
        // At 10 s HttpClient would cut the pipeline at the same instant it
        // gives up, turning its budget into a plain cancellation.
        var ex = Assert.Throws<OptionsValidationException>(() => Resolve(o => o.TimeoutSeconds = seconds).Value);

        Assert.Contains("TimeoutSeconds", ex.Message);
    }

    [Theory]
    [InlineData(11)]
    [InlineData(12)]
    [InlineData(60)]
    public void TimeoutSeconds_AboveThePipelineTotal_IsAccepted(int seconds)
    {
        var options = Resolve(o => o.TimeoutSeconds = seconds).Value;

        Assert.Equal(seconds, options.TimeoutSeconds);
    }
}
