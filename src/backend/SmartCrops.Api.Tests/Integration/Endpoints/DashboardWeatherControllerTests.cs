using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.Tests.ExternalApis.WeatherApi;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Weather;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-336 PR 3a/5 — <c>GET /api/dashboard/weather</c> through the stubbed
/// transport. The transport's <c>Received</c> counter is the PROOF every cache
/// claim rests on: without it a cache test asserts nothing.
///
/// <para>Two precautions against the shared, collection-wide cache: every test
/// uses a place of its own (<see cref="FreshPlace"/>) AND evicts its entries
/// first, so a window written by an earlier test can neither hide a call nor
/// add one. Whitelists pin the wire shape — including what deliberately does
/// NOT travel.</para>
/// </summary>
public class DashboardWeatherControllerTests : IntegrationTestBase
{
    public DashboardWeatherControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string Url = "/api/dashboard/weather";

    private static int _placeCounter;

    private static readonly string[] RootWhitelist = ["gardens", "locations", "profileLocated"];

    private static readonly string[] LinkWhitelist = ["gardenId", "locationKey", "source"];

    private static readonly string[] LocationWhitelist =
    [
        "alerts", "country", "current", "days", "fetchedAt", "key", "localTime", "name", "region", "status", "timeZone",
    ];

    private static readonly string[] CurrentWhitelist =
    [
        "conditionCode", "conditionText", "feelsLikeC", "gustKph", "humidity", "isDay", "lastUpdated", "precipMm", "tempC", "uv", "windKph",
    ];

    private static readonly string[] DayWhitelist =
    [
        "avgTempC", "chanceOfRain", "chanceOfSnow", "conditionCode", "conditionText", "date", "hours", "maxTempC", "maxWindKph", "minTempC", "sunrise", "sunset", "totalPrecipMm",
    ];

    private static readonly string[] HourWhitelist =
    [
        "chanceOfRain", "conditionCode", "isDay", "precipMm", "tempC", "time", "windKph",
    ];

    private static readonly string[] AlertWhitelist =
    [
        "areas", "effective", "event", "expires", "headline", "severity", "urgency",
    ];

    // ── Authorization, empty states ──────────────────────────────────────────

    [Fact]
    public async Task Get_NoBearer_Returns401()
    {
        var response = await Client.GetAsync(Url);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(Stub.Received);
    }

    [Fact]
    public async Task Get_NoGardens_IsEmpty_WithoutCalling()
    {
        var userId = await SeedUserAsync();
        AuthAs(userId);

        var body = await GetAsync();

        Assert.Empty(body.GetProperty("locations").EnumerateArray());
        Assert.Empty(body.GetProperty("gardens").EnumerateArray());
        Assert.False(body.GetProperty("profileLocated").GetBoolean());
        Assert.Empty(Stub.Received);
    }

    [Fact]
    public async Task Get_UnlocatedGardens_AreListedWithNullKey_WithoutCalling()
    {
        var userId = await SeedUserAsync();
        var a = await SeedGardenAsync(userId, "Balcon sud");
        var b = await SeedGardenAsync(userId, "Potager du fond");
        AuthAs(userId);

        var body = await GetAsync();

        Assert.Empty(body.GetProperty("locations").EnumerateArray());
        var links = body.GetProperty("gardens").EnumerateArray().ToList();
        Assert.Equal(2, links.Count);
        Assert.Equal(new[] { b, a }.Select(id => id.ToString()), links.Select(l => l.GetProperty("gardenId").GetString()));
        Assert.All(links, l =>
        {
            Assert.Equal(JsonValueKind.Null, l.GetProperty("locationKey").ValueKind);
            Assert.Equal(JsonValueKind.Null, l.GetProperty("source").ValueKind);
        });
        Assert.Empty(Stub.Received);
    }

    // ── One place, one call ──────────────────────────────────────────────────

    [Fact]
    public async Task Get_TwoGardensInOneTown_OneLocation_OneCall_Mapped()
    {
        var (lat, lon) = FreshPlace();
        var userId = await SeedUserAsync();
        var a = await SeedGardenAsync(userId, "Terrasse", lat, lon, name: "Lyon 3e");
        var b = await SeedGardenAsync(userId, "Balcon sud", lat, lon, name: "Lyon 3e");
        Stub.SetForecast(lat, lon, WeatherApiFixtures.Forecast);
        AuthAs(userId);
        var before = DateTime.UtcNow.AddSeconds(-1);

        var body = await GetAsync();

        Assert.Equal(1, Stub.ForecastCalls);
        var location = Assert.Single(body.GetProperty("locations").EnumerateArray());
        Assert.Equal(WeatherLocationKey.From(lat, lon), location.GetProperty("key").GetString());
        // The STORED name, not the provider's « Lyon ».
        Assert.Equal("Lyon 3e", location.GetProperty("name").GetString());
        Assert.Equal("fresh", location.GetProperty("status").GetString());
        Assert.InRange(location.GetProperty("fetchedAt").GetDateTime().ToUniversalTime(), before, DateTime.UtcNow.AddSeconds(1));
        Assert.Equal("Europe/Paris", location.GetProperty("timeZone").GetString());
        Assert.Equal("2026-09-12 14:30", location.GetProperty("localTime").GetString());

        var current = location.GetProperty("current");
        Assert.Equal(24.0, current.GetProperty("tempC").GetDouble());
        Assert.Equal(1000, current.GetProperty("conditionCode").GetInt32());
        Assert.Equal("Ensoleillé", current.GetProperty("conditionText").GetString());
        Assert.True(current.GetProperty("isDay").GetBoolean());

        var days = location.GetProperty("days").EnumerateArray().ToList();
        Assert.Equal(5, days.Count);
        Assert.Equal("2026-09-12", days[0].GetProperty("date").GetString());
        Assert.Equal(16.0, days[0].GetProperty("minTempC").GetDouble());
        Assert.Equal(29.0, days[0].GetProperty("maxTempC").GetDouble());
        Assert.Equal(80, days[3].GetProperty("chanceOfRain").GetInt32());
        Assert.Equal(55.1, days[3].GetProperty("maxWindKph").GetDouble());
        // Hours on the first two days only — the fixture carries some on every day.
        Assert.Equal(24, days[0].GetProperty("hours").GetArrayLength());
        Assert.Equal(24, days[1].GetProperty("hours").GetArrayLength());
        Assert.Equal(0, days[2].GetProperty("hours").GetArrayLength());
        Assert.Equal(0, days[4].GetProperty("hours").GetArrayLength());
        Assert.Equal("2026-09-12 13:00", days[0].GetProperty("hours")[13].GetProperty("time").GetString());

        // The expired alert of the fixture is filtered; the current one travels.
        var alert = Assert.Single(location.GetProperty("alerts").EnumerateArray());
        Assert.Equal("Vent violent", alert.GetProperty("event").GetString());
        Assert.Equal("Moderate", alert.GetProperty("severity").GetString());

        var links = body.GetProperty("gardens").EnumerateArray().ToList();
        Assert.Equal(2, links.Count);
        Assert.All(links, l =>
        {
            Assert.Equal(location.GetProperty("key").GetString(), l.GetProperty("locationKey").GetString());
            Assert.Equal("garden", l.GetProperty("source").GetString());
        });
        Assert.Contains(links, l => l.GetProperty("gardenId").GetString() == a.ToString());
        Assert.Contains(links, l => l.GetProperty("gardenId").GetString() == b.ToString());
        Assert.False(body.GetProperty("profileLocated").GetBoolean());
    }

    [Fact]
    public async Task Get_Twice_OneCall_SameInstant()
    {
        var (lat, lon) = FreshPlace();
        var userId = await SeedUserAsync();
        await SeedGardenAsync(userId, "Terrasse", lat, lon);
        Stub.SetForecast(lat, lon, WeatherApiFixtures.Forecast);
        AuthAs(userId);

        var first = await GetAsync();
        var second = await GetAsync();

        Assert.Equal(1, Stub.ForecastCalls);
        var fetchedFirst = first.GetProperty("locations")[0].GetProperty("fetchedAt").GetDateTime();
        var fetchedSecond = second.GetProperty("locations")[0].GetProperty("fetchedAt").GetDateTime();
        Assert.Equal(fetchedFirst, fetchedSecond);
        Assert.Equal("fresh", second.GetProperty("locations")[0].GetProperty("status").GetString());
    }

    [Fact]
    public async Task Get_LanguageIsPartOfTheKey_TwoCalls()
    {
        var (lat, lon) = FreshPlace();
        var userId = await SeedUserAsync();
        await SeedGardenAsync(userId, "Terrasse", lat, lon);
        Stub.SetForecast(lat, lon, WeatherApiFixtures.Forecast);
        AuthAs(userId);

        await GetAsync("fr");
        await GetAsync("en");
        await GetAsync("fr");

        Assert.Equal(2, Stub.ForecastCalls);
    }

    // ── Degradation ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Get_RefusedAfterSuccess_IsStale_WithTheFirstFetchedAt()
    {
        var (lat, lon) = FreshPlace();
        var userId = await SeedUserAsync();
        await SeedGardenAsync(userId, "Terrasse", lat, lon);
        Stub.SetForecast(lat, lon, WeatherApiFixtures.Forecast);
        AuthAs(userId);
        var first = await GetAsync();
        var fetchedFirst = first.GetProperty("locations")[0].GetProperty("fetchedAt").GetDateTime();

        // The fresh window passes; the provider now refuses the call.
        Cache.EvictFresh(lat, lon, "fr");
        Stub.SetForecast(lat, lon, "{\"error\":{\"code\":2007,\"message\":\"synthetic\"}}", HttpStatusCode.Forbidden);

        var response = await Client.GetAsync($"{Url}?lang=fr");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var location = doc.RootElement.GetProperty("locations")[0];

        Assert.Equal(2, Stub.ForecastCalls);
        Assert.Equal("stale", location.GetProperty("status").GetString());
        Assert.Equal(fetchedFirst, location.GetProperty("fetchedAt").GetDateTime());
        Assert.Equal(24.0, location.GetProperty("current").GetProperty("tempC").GetDouble());
        Assert.Equal(5, location.GetProperty("days").GetArrayLength());
    }

    [Fact]
    public async Task Get_RefusedCold_IsUnavailable_Still200()
    {
        var (lat, lon) = FreshPlace();
        var userId = await SeedUserAsync();
        var gardenId = await SeedGardenAsync(userId, "Terrasse", lat, lon);
        Stub.SetForecast(lat, lon, "{\"error\":{\"code\":2009,\"message\":\"synthetic\"}}", HttpStatusCode.Forbidden);
        AuthAs(userId);

        var body = await GetAsync();

        var location = Assert.Single(body.GetProperty("locations").EnumerateArray());
        Assert.Equal("unavailable", location.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, location.GetProperty("fetchedAt").ValueKind);
        Assert.Equal(JsonValueKind.Null, location.GetProperty("timeZone").ValueKind);
        Assert.Equal(JsonValueKind.Null, location.GetProperty("current").ValueKind);
        Assert.Equal(0, location.GetProperty("days").GetArrayLength());
        Assert.Equal(0, location.GetProperty("alerts").GetArrayLength());
        // The place still exists and the garden still points at it.
        Assert.Equal("Lyon", location.GetProperty("name").GetString());
        var link = Assert.Single(body.GetProperty("gardens").EnumerateArray());
        Assert.Equal(gardenId.ToString(), link.GetProperty("gardenId").GetString());
        Assert.Equal(location.GetProperty("key").GetString(), link.GetProperty("locationKey").GetString());
    }

    [Fact]
    public async Task Get_FailureThenSuccess_TheSecondCallIsMade()
    {
        // A 4xx refusal on purpose, not a 5xx: the standard resilience handler
        // RETRIES a 5xx (three attempts inside the 10 s budget — measured: a
        // 503 costs three transport calls and ten seconds), which would make
        // the count below a statement about the retry policy. A refusal is
        // never retried, so the count states exactly what this test is about:
        // the failure was not memorized, the next request went to the provider.
        var (lat, lon) = FreshPlace();
        var userId = await SeedUserAsync();
        await SeedGardenAsync(userId, "Terrasse", lat, lon);
        Stub.SetForecast(lat, lon, "{\"error\":{\"code\":2009,\"message\":\"synthetic\"}}", HttpStatusCode.Forbidden);
        AuthAs(userId);

        var failed = await GetAsync();
        Stub.SetForecast(lat, lon, WeatherApiFixtures.Forecast);
        var recovered = await GetAsync();

        Assert.Equal("unavailable", failed.GetProperty("locations")[0].GetProperty("status").GetString());
        Assert.Equal("fresh", recovered.GetProperty("locations")[0].GetProperty("status").GetString());
        Assert.Equal(2, Stub.ForecastCalls);
    }

    [Fact]
    public async Task Get_SlowProvider_DegradesInsideTheBrowserBudget()
    {
        // A provider that stalls beyond the attempt timeout: the resilience
        // pipeline (5 s attempt, 10 s total) gives up, the place answers
        // unavailable, and the whole response lands well inside the browser's
        // 15 s fetch budget — never an exception, never a 5xx.
        var (lat, lon) = FreshPlace();
        var userId = await SeedUserAsync();
        await SeedGardenAsync(userId, "Terrasse", lat, lon);
        Stub.SetForecast(lat, lon, WeatherApiFixtures.Forecast);
        Stub.ForecastDelay = TimeSpan.FromSeconds(20);
        AuthAs(userId);
        var watch = Stopwatch.StartNew();

        var response = await Client.GetAsync($"{Url}?lang=fr");
        watch.Stop();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("unavailable", doc.RootElement.GetProperty("locations")[0].GetProperty("status").GetString());
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(15), $"took {watch.Elapsed}");
    }

    // ── Partial, inherited, overridden ───────────────────────────────────────

    [Fact]
    public async Task Get_PartiallyLocated_LinksSayWhichGardenReadsWhat()
    {
        var (lat, lon) = FreshPlace();
        var userId = await SeedUserAsync();
        var located = await SeedGardenAsync(userId, "Terrasse", lat, lon);
        var b = await SeedGardenAsync(userId, "Balcon sud");
        var c = await SeedGardenAsync(userId, "Potager du fond");
        Stub.SetForecast(lat, lon, WeatherApiFixtures.Forecast);
        AuthAs(userId);

        var body = await GetAsync();

        Assert.Equal(1, Stub.ForecastCalls);
        var location = Assert.Single(body.GetProperty("locations").EnumerateArray());
        var links = body.GetProperty("gardens").EnumerateArray().ToDictionary(
            l => l.GetProperty("gardenId").GetString()!,
            l => l);
        Assert.Equal(location.GetProperty("key").GetString(), links[located.ToString()].GetProperty("locationKey").GetString());
        Assert.Equal("garden", links[located.ToString()].GetProperty("source").GetString());
        Assert.Equal(JsonValueKind.Null, links[b.ToString()].GetProperty("locationKey").ValueKind);
        Assert.Equal(JsonValueKind.Null, links[c.ToString()].GetProperty("locationKey").ValueKind);
        Assert.False(body.GetProperty("profileLocated").GetBoolean());
    }

    [Fact]
    public async Task Get_ProfileDefault_IsInheritedAsSourceProfile_OneCall()
    {
        var (lat, lon) = FreshPlace();
        var userId = await SeedUserAsync();
        await SetProfileLocationAsync(userId, "Annecy", lat, lon);
        await SeedGardenAsync(userId, "Terrasse");
        await SeedGardenAsync(userId, "Balcon sud");
        Stub.SetForecast(lat, lon, WeatherApiFixtures.Forecast);
        AuthAs(userId);

        var body = await GetAsync();

        Assert.Equal(1, Stub.ForecastCalls);
        var location = Assert.Single(body.GetProperty("locations").EnumerateArray());
        Assert.Equal("Annecy", location.GetProperty("name").GetString());
        Assert.True(body.GetProperty("profileLocated").GetBoolean());
        var links = body.GetProperty("gardens").EnumerateArray().ToList();
        Assert.Equal(2, links.Count);
        Assert.All(links, l =>
        {
            Assert.Equal(location.GetProperty("key").GetString(), l.GetProperty("locationKey").GetString());
            Assert.Equal("profile", l.GetProperty("source").GetString());
        });
    }

    [Fact]
    public async Task Get_OverrideWins_TwoPlaces_TwoCalls_InGardenOrder()
    {
        var (profileLat, profileLon) = FreshPlace();
        var (ownLat, ownLon) = FreshPlace();
        var userId = await SeedUserAsync();
        await SetProfileLocationAsync(userId, "Annecy", profileLat, profileLon);
        var inheriting = await SeedGardenAsync(userId, "Balcon sud", createdAt: DateTime.UtcNow.AddMinutes(-1));
        var overriding = await SeedGardenAsync(userId, "Terrasse", ownLat, ownLon, name: "Lyon", createdAt: DateTime.UtcNow);
        Stub.SetForecast(profileLat, profileLon, WeatherApiFixtures.Forecast);
        Stub.SetForecast(ownLat, ownLon, WeatherApiFixtures.Forecast);
        AuthAs(userId);

        var body = await GetAsync();

        Assert.Equal(2, Stub.ForecastCalls);
        var locations = body.GetProperty("locations").EnumerateArray().ToList();
        Assert.Equal(2, locations.Count);
        // Newest garden first: its own place leads, the inherited one follows.
        Assert.Equal("Lyon", locations[0].GetProperty("name").GetString());
        Assert.Equal("Annecy", locations[1].GetProperty("name").GetString());
        var links = body.GetProperty("gardens").EnumerateArray().ToDictionary(
            l => l.GetProperty("gardenId").GetString()!,
            l => l);
        Assert.Equal("garden", links[overriding.ToString()].GetProperty("source").GetString());
        Assert.Equal(locations[0].GetProperty("key").GetString(), links[overriding.ToString()].GetProperty("locationKey").GetString());
        Assert.Equal("profile", links[inheriting.ToString()].GetProperty("source").GetString());
        Assert.Equal(locations[1].GetProperty("key").GetString(), links[inheriting.ToString()].GetProperty("locationKey").GetString());
    }

    // ── The wire shape ───────────────────────────────────────────────────────

    [Fact]
    public async Task Get_ResponseKeysAreWhitelisted_AndNothingElseTravels()
    {
        var (lat, lon) = FreshPlace();
        var userId = await SeedUserAsync();
        await SeedGardenAsync(userId, "Terrasse", lat, lon);
        Stub.SetForecast(lat, lon, WeatherApiFixtures.Forecast);
        AuthAs(userId);

        var response = await Client.GetAsync($"{Url}?lang=fr");
        var raw = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(raw);
        var root = doc.RootElement;

        Assert.Equal(RootWhitelist, Keys(root));
        Assert.Equal(LinkWhitelist, Keys(root.GetProperty("gardens")[0]));
        var location = root.GetProperty("locations")[0];
        Assert.Equal(LocationWhitelist, Keys(location));
        Assert.Equal(CurrentWhitelist, Keys(location.GetProperty("current")));
        Assert.Equal(DayWhitelist, Keys(location.GetProperty("days")[0]));
        Assert.Equal(HourWhitelist, Keys(location.GetProperty("days")[0].GetProperty("hours")[0]));
        Assert.Equal(AlertWhitelist, Keys(location.GetProperty("alerts")[0]));

        // What deliberately does NOT travel, as raw text so a nested leak is
        // caught wherever it sits.
        Assert.DoesNotContain("\"icon\"", raw);
        Assert.DoesNotContain("tempF", raw);
        Assert.DoesNotContain("Mph", raw);
        Assert.DoesNotContain("\"description\"", raw);
        Assert.DoesNotContain("\"instruction\"", raw);
        Assert.DoesNotContain("\"latitude\"", raw);
        Assert.DoesNotContain("\"longitude\"", raw);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private StubWeatherApiHttpHandler Stub => Fixture.WeatherApiHttpStub;

    private WeatherForecastCache Cache => Fixture.Factory.Services.GetRequiredService<WeatherForecastCache>();

    private static string[] Keys(JsonElement element) =>
        element.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();

    /// <summary>
    /// A place no other test uses, with its cache entries evicted in both
    /// languages — the test owns its window.
    /// </summary>
    private (double Lat, double Lon) FreshPlace()
    {
        var n = Interlocked.Increment(ref _placeCounter);
        var lat = Math.Round(40.0 + n * 0.01, 2);
        const double lon = 3.5;
        Cache.Evict(lat, lon, "fr");
        Cache.Evict(lat, lon, "en");
        return (lat, lon);
    }

    private void AuthAs(string userId)
    {
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }

    private async Task<JsonElement> GetAsync(string lang = "fr")
    {
        var response = await Client.GetAsync($"{Url}?lang={lang}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private async Task<string> SeedUserAsync()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0);",
            userId);
        return userId;
    }

    private async Task<Guid> SeedGardenAsync(
        string userId,
        string gardenName,
        double? latitude = null,
        double? longitude = null,
        string name = "Lyon",
        DateTime? createdAt = null)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var garden = new Garden
        {
            Id = Guid.NewGuid(),
            Name = gardenName,
            UserId = userId,
            CreatedAt = createdAt ?? DateTime.UtcNow,
            LocationName = latitude is null ? null : name,
            LocationRegion = latitude is null ? null : "Auvergne-Rhône-Alpes",
            LocationCountry = latitude is null ? null : "France",
            Latitude = latitude,
            Longitude = longitude,
            LocationResolvedAt = latitude is null ? null : DateTime.UtcNow,
        };
        db.Gardens.Add(garden);
        await db.SaveChangesAsync();
        return garden.Id;
    }

    private async Task SetProfileLocationAsync(string userId, string name, double latitude, double longitude)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"UPDATE ""AspNetUsers"" SET ""LocationName"" = {1}, ""Latitude"" = {2}, ""Longitude"" = {3},
                ""LocationResolvedAt"" = {4} WHERE ""Id"" = {0};",
            userId, name, latitude, longitude, DateTime.UtcNow);
    }

}
