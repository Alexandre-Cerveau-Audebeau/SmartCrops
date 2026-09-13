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
}
