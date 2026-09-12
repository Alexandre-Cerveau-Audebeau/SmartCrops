using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SmartCrops.Api.Controllers;
using SmartCrops.Api.Tests.ExternalApis.WeatherApi;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-336 PR 3a/5 — <c>GET /api/geocode/search</c> through the stubbed
/// transport. What it pins: the mapped list, the two spellings of « nothing
/// matches » both answering an empty 200, a bad query refused WITHOUT a call,
/// trimming, and every provider failure collapsing to one neutral 503 whose
/// body never carries the provider's wording.
/// </summary>
public class GeocodeControllerTests : IntegrationTestBase
{
    public GeocodeControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string Url = "/api/geocode/search";

    /// <summary>camelCase keys of <c>GeocodeResultResponse</c>, ordinal order.</summary>
    private static readonly string[] ResultWhitelist =
    [
        "country",
        "latitude",
        "longitude",
        "name",
        "region",
    ];

    [Fact]
    public async Task Search_NoBearer_Returns401()
    {
        var response = await Client.GetAsync($"{Url}?q=Lyon");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(Fixture.WeatherApiHttpStub.Received);
    }

    [Fact]
    public async Task Search_ReturnsMappedMatches()
    {
        Fixture.WeatherApiHttpStub.SetSearch("Paris", WeatherApiFixtures.Search);
        AuthAs();

        var response = await Client.GetAsync($"{Url}?q=Paris");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var items = doc.RootElement.EnumerateArray().ToList();
        Assert.Equal(2, items.Count);

        Assert.Equal(ResultWhitelist, items[0].EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
        Assert.Equal("Paris", items[0].GetProperty("name").GetString());
        Assert.Equal("Ile-de-France", items[0].GetProperty("region").GetString());
        Assert.Equal("France", items[0].GetProperty("country").GetString());
        Assert.Equal(48.87, items[0].GetProperty("latitude").GetDouble());
        Assert.Equal(2.33, items[0].GetProperty("longitude").GetDouble());
        Assert.Equal("United States of America", items[1].GetProperty("country").GetString());

        Assert.Equal(new[] { "search:Paris" }, Fixture.WeatherApiHttpStub.Received);
    }

    [Fact]
    public async Task Search_ProviderNoLocationCode_Returns200Empty()
    {
        // Code 1006 is « nothing matches », not an error: the user keeps typing.
        Fixture.WeatherApiHttpStub.SetSearch(
            "zzzzqqq",
            "{\"error\":{\"code\":1006,\"message\":\"No matching location found.\"}}",
            HttpStatusCode.BadRequest);
        AuthAs();

        var response = await Client.GetAsync($"{Url}?q=zzzzqqq");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<List<JsonElement>>();
        Assert.NotNull(body);
        Assert.Empty(body!);
    }

    [Fact]
    public async Task Search_ProviderEmptyArray_Returns200Empty()
    {
        // The other spelling — the stub's default for an unconfigured query.
        AuthAs();

        var response = await Client.GetAsync($"{Url}?q=Nulle-Part");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<List<JsonElement>>();
        Assert.Empty(body!);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("a")]
    [InlineData(" a ")]
    public async Task Search_QueryTooShort_Returns400_WithoutCalling(string q)
    {
        AuthAs();

        var response = await Client.GetAsync($"{Url}?q={Uri.EscapeDataString(q)}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(Fixture.WeatherApiHttpStub.Received);
    }

    [Fact]
    public async Task Search_MissingQuery_Returns400_WithoutCalling()
    {
        AuthAs();

        var response = await Client.GetAsync(Url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(Fixture.WeatherApiHttpStub.Received);
    }

    [Fact]
    public async Task Search_QueryTooLong_Returns400_WithoutCalling()
    {
        AuthAs();
        var q = new string('a', GeocodeController.MaxQueryLength + 1);

        var response = await Client.GetAsync($"{Url}?q={q}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(Fixture.WeatherApiHttpStub.Received);
    }

    [Fact]
    public async Task Search_QueryAtBounds_IsForwarded()
    {
        AuthAs();
        var longest = new string('b', GeocodeController.MaxQueryLength);

        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync($"{Url}?q=Ly")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync($"{Url}?q={longest}")).StatusCode);

        Assert.Contains("search:Ly", Fixture.WeatherApiHttpStub.Received);
        Assert.Contains($"search:{longest}", Fixture.WeatherApiHttpStub.Received);
    }

    [Fact]
    public async Task Search_TrimsQuery_BeforeCalling()
    {
        AuthAs();

        var response = await Client.GetAsync($"{Url}?q={Uri.EscapeDataString("  Lyon  ")}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new[] { "search:Lyon" }, Fixture.WeatherApiHttpStub.Received);
    }

    [Theory]
    [InlineData(2007, HttpStatusCode.Forbidden)]      // Refused
    [InlineData(2009, HttpStatusCode.Forbidden)]      // Refused
    [InlineData(2006, HttpStatusCode.Unauthorized)]   // Misconfigured
    [InlineData(9999, HttpStatusCode.BadRequest)]     // Transport
    public async Task Search_ProviderFailure_Returns503_WithNeutralBody(int code, HttpStatusCode providerStatus)
    {
        const string providerWording = "synthetic provider wording that must never reach a client";
        Fixture.WeatherApiHttpStub.SetSearch(
            "Lyon",
            $"{{\"error\":{{\"code\":{code},\"message\":\"{providerWording}\"}}}}",
            providerStatus);
        AuthAs();

        var response = await Client.GetAsync($"{Url}?q=Lyon");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains(GeocodeController.UnavailableError, body);
        Assert.DoesNotContain(providerWording, body);
        Assert.DoesNotContain(code.ToString(), body);
    }

    [Fact]
    public async Task Search_ProviderServerError_Returns503()
    {
        Fixture.WeatherApiHttpStub.SetSearch("Lyon", "", HttpStatusCode.BadGateway, "text/html");
        AuthAs();

        var response = await Client.GetAsync($"{Url}?q=Lyon");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    private void AuthAs()
    {
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken($"u-{Guid.NewGuid():N}"));
    }
}
