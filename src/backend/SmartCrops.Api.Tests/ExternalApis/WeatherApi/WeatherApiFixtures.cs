namespace SmartCrops.Api.Tests.ExternalApis.WeatherApi;

/// <summary>
/// SMA-336 PR 3a/5 — the SYNTHETIC WeatherAPI.com bodies under
/// <c>ExternalApis/WeatherApi/Fixtures</c>, copied to the test output by the
/// project file. Built from the public documentation on 2026-09-12 (every
/// object carries a <c>_synthetic</c> note saying so): no real call was
/// possible while they were written, so their FIELD NAMES are the documented
/// ones and their values are plausible, not observed. Replace them with a
/// redacted real recording the day one exists; the tests that read them
/// assert shapes and classifications, never a real temperature.
///
/// <para>They deliberately carry what the client must IGNORE too —
/// <c>condition.icon</c>, the <c>*_f</c> / <c>*_mph</c> / <c>*_in</c> twins,
/// the moon fields — so the « not bound » rule is proven against a body that
/// has them.</para>
/// </summary>
public static class WeatherApiFixtures
{
    /// <summary>Lyon, five days, 24 hours on the first two days and three on the rest, one official alert.</summary>
    public static string Forecast => Read("weatherapi-forecast.json");

    /// <summary>« Paris »: two matches — France and Texas.</summary>
    public static string Search => Read("weatherapi-search.json");

    private static string Read(string name)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "ExternalApis", "WeatherApi", "Fixtures", name);
        Assert.True(File.Exists(path), $"Fixture not found at {path} — is CopyToOutputDirectory set in the test project?");
        return File.ReadAllText(path);
    }
}
