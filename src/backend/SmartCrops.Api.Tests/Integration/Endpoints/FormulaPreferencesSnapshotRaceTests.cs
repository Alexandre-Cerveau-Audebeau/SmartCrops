using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartCrops.Api.DTOs;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Core.Dashboard;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Interceptors;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-448, PR #293, fix round 1 — S4: <c>GET /api/dashboard/preferences</c>
/// reads the account's formula and its layout in ONE snapshot, proved by
/// losing the race on purpose (the <see cref="DashboardSnapshotRaceTests"/>
/// pattern).
///
/// <para>A command interceptor waits for the request's read of the account's
/// formula to COME BACK, then runs a real formula switch —
/// <c>PUT /api/formulas/current</c>, the route, for the same account — to its
/// commit before the request goes on. Two reads would pair the formula of
/// before the switch with the layout of after it: the Expert's name over the
/// layout the switch just put in the row. One read answers from one instant:
/// the Expert and the Expert's own layout. The database is asked afterwards
/// whether the switch really happened, so the test cannot pass by the race
/// quietly not running.</para>
///
/// <para>Its own factory, on the shared container: the interceptor must not
/// exist for the rest of the collection.</para>
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class FormulaPreferencesSnapshotRaceTests : IAsyncLifetime
{
    private const string SwitchUrl = "/api/formulas/current";
    private const string PreferencesUrl = "/api/dashboard/preferences";

    private readonly PostgresFixture _fixture;
    private readonly FormulaReadRaceInterceptor _interceptor = new();
    private WebApplicationFactory<Program> _factory = default!;
    private HttpClient _client = default!;

    public FormulaPreferencesSnapshotRaceTests(PostgresFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        await _fixture.Respawner.ResetAsync(connection);

        _factory = new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            .WithConnectionString(_fixture.ConnectionString)
            // Attached to the DbContext OPTIONS, the production timestamp
            // interceptor carried across — see DashboardSnapshotRaceTests for
            // why both descriptor types go.
            .WithServices(services =>
            {
                foreach (var descriptor in services
                    .Where(d => d.ServiceType == typeof(DbContextOptions<SmartCropsDbContext>)
                        || (d.ServiceType.IsGenericType
                            && d.ServiceType.GetGenericTypeDefinition().Name
                                .StartsWith("IDbContextOptionsConfiguration", StringComparison.Ordinal)
                            && d.ServiceType.GenericTypeArguments[0] == typeof(SmartCropsDbContext)))
                    .ToList())
                {
                    services.Remove(descriptor);
                }

                services.AddDbContext<SmartCropsDbContext>((sp, options) =>
                    options
                        .UseNpgsql(_fixture.ConnectionString)
                        .AddInterceptors(
                            sp.GetRequiredService<UpdateTimestampInterceptor>(),
                            _interceptor));
            })
            .Build();
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client?.Dispose();
        if (_factory is not null) await _factory.DisposeAsync();
    }

    /// <summary>
    /// The finding's case: an Expert with a layout of its own, and a switch to
    /// the Gardener — a formula never visited, whose row the switch empties —
    /// landing between the formula read and the layout read.
    /// </summary>
    [Fact]
    public async Task GetPreferences_ASwitchToAFormulaNeverVisited_LandingMidRequest_NeverPairsTheExpertWithAnotherLayout()
    {
        var userId = await SeedUserAsync();
        AuthAs(userId);
        Assert.Equal(HttpStatusCode.NoContent, (await SwitchAsync("expert")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.PutAsJsonAsync(PreferencesUrl, ExpertLayout)).StatusCode);

        var body = await GetWhileSwitchingAsync(userId, to: "gardener");

        AssertTheExpertWithItsOwnLayout(body);
    }

    /// <summary>
    /// The same race towards a formula visited before: the switch brings the
    /// Gardener's archived layout back into the row. Two reads would serve the
    /// Gardener's arrangement brought to the Expert — a layout of neither.
    /// </summary>
    [Fact]
    public async Task GetPreferences_ASwitchToAFormulaWithAnArchivedLayout_LandingMidRequest_NeverPairsTheExpertWithAnotherLayout()
    {
        var userId = await SeedUserAsync();
        AuthAs(userId);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.PutAsJsonAsync(PreferencesUrl, GardenerLayout)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await SwitchAsync("expert")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.PutAsJsonAsync(PreferencesUrl, ExpertLayout)).StatusCode);

        var body = await GetWhileSwitchingAsync(userId, to: "gardener");

        AssertTheExpertWithItsOwnLayout(body);
    }

    private static readonly SaveDashboardPreferencesRequest ExpertLayout = new(
        DashboardLayout.Levels.Expert,
        [
            new("stats", "medium", false, null),
            new("gardens", "medium", false, null),
            new("keyfigures", "wide", false, null),
            new("weather", "large", false, null),
            new("tips", "small", false, null),
            new("month", "large", false, null),
            new("todo", "large", true, null),
            new("counters", "large", false, null),
            new("harvest", "large", true, null),
        ]);

    private static readonly SaveDashboardPreferencesRequest GardenerLayout = new(
        DashboardLayout.Levels.Gardener,
        [
            new("tips", "small", false, null),
            new("weather", "medium", false, null),
            new("gardens", "large", false, null),
            new("month", "medium", false, null),
            new("todo", "medium", false, null),
            new("counters", "medium", true, null),
            new("harvest", "large", true, null),
        ]);

    /// <summary>
    /// Arms the race, reads the preferences, and proves the race RAN: the
    /// interceptor fired on the formula read, the switch answered 204, and the
    /// account really stands at the new formula afterwards.
    /// </summary>
    private async Task<DashboardPreferencesResponse> GetWhileSwitchingAsync(string userId, string to)
    {
        HttpStatusCode? switched = null;
        _interceptor.Arm(async () =>
        {
            using var racer = _factory.CreateClient();
            racer.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _fixture.GenerateToken(userId));
            switched = (await racer.PutAsJsonAsync(SwitchUrl, new { formula = to })).StatusCode;
        });

        var body = await _client.GetFromJsonAsync<DashboardPreferencesResponse>(PreferencesUrl);
        Assert.NotNull(body);

        Assert.True(
            _interceptor.Fired,
            "The interceptor never saw the read of the account's formula — the race was not run. "
                + $"Commands observed while armed: {_interceptor.Seen}.");
        Assert.Equal(HttpStatusCode.NoContent, switched);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(to, await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.Formula).SingleAsync());

        return body;
    }

    /// <summary>
    /// The answer is one instant of the account: the formula read first is the
    /// Expert, so the layout is the Expert's own — never the one the switch put
    /// in the row, whether the Expert's preset over an emptied row or the
    /// Gardener's arrangement brought to the Expert.
    /// </summary>
    private static void AssertTheExpertWithItsOwnLayout(DashboardPreferencesResponse body)
    {
        Assert.Equal("expert", body.Level);
        Assert.Equal("expert", body.Capabilities.Key);
        Assert.False(body.IsPreset);
        Assert.Equal(
            ExpertLayout.Blocks.Select(b => (b.Key, b.Size, b.Hidden)),
            body.Blocks.Select(b => (b.Key, b.Size, b.Hidden)));
    }

    private Task<HttpResponseMessage> SwitchAsync(string formula) =>
        _client.PutAsJsonAsync(SwitchUrl, new { formula });

    private void AuthAs(string userId) =>
        _client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _fixture.GenerateToken(userId));

    private async Task<string> SeedUserAsync()
    {
        var userId = Guid.NewGuid().ToString();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"", ""Formula"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0, 'gardener');",
            userId);
        return userId;
    }
}

/// <summary>
/// Runs the armed race the instant the preferences' read of the account's
/// formula comes back — before the request reads anything else. Fires at most
/// once, and only while armed; the race's own commands pass through untouched.
/// </summary>
internal sealed class FormulaReadRaceInterceptor : DbCommandInterceptor
{
    private Func<Task>? _race;
    private int _fired;
    private int _seen;

    public bool Fired => Volatile.Read(ref _fired) == 1;

    /// <summary>How many commands passed through while armed — zero means the interceptor was never wired.</summary>
    public int Seen => Volatile.Read(ref _seen);

    public void Arm(Func<Task> race)
    {
        Volatile.Write(ref _fired, 0);
        Volatile.Write(ref _seen, 0);
        _race = race;
    }

    public override async ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result,
        CancellationToken cancellationToken = default)
    {
        // AFTER the read, not before: under READ COMMITTED a statement's
        // snapshot is taken when it starts, so a switch committed before the
        // formula read would simply be part of it and prove nothing.
        var race = _race;
        if (race is null) return await base.ReaderExecutedAsync(command, eventData, result, cancellationToken);

        Interlocked.Increment(ref _seen);

        // The read of the account's formula, and only it: the switch's own
        // lock on the same row reads `FOR UPDATE`, and a read of the whole
        // user would carry its other columns.
        var text = command.CommandText;
        if (text.Contains("FROM \"AspNetUsers\"", StringComparison.Ordinal)
            && text.Contains("\"Formula\"", StringComparison.Ordinal)
            && !text.Contains("FOR UPDATE", StringComparison.Ordinal)
            && !text.Contains("\"NormalizedUserName\"", StringComparison.Ordinal)
            && Interlocked.Exchange(ref _fired, 1) == 0)
        {
            _race = null;
            await race();
        }

        return await base.ReaderExecutedAsync(command, eventData, result, cancellationToken);
    }
}
