using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Interceptors;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-437, review of the v3, M1 — a formula switch is never undone in silence
/// by an Identity write of the same account, proved by losing the race on
/// purpose (the <see cref="FormulaPreferencesSnapshotRaceTests"/> pattern).
///
/// <para><c>PUT /api/formulas/current</c> writes the formula OUTSIDE Identity,
/// by a set-based UPDATE; <c>UserManager.UpdateAsync</c> rewrites EVERY column
/// of the row, guarded by <c>ConcurrencyStamp</c> alone. A command interceptor
/// waits for the read of the account by <c>PUT /api/auth/profile/location</c>
/// — the dashboard's « Localisation » door — to COME BACK, then runs a real
/// switch to the Expert, the route, for the same account, to its commit before
/// the request goes on to its write. A switch that left the stamp as it was let
/// that write put back the Gardener and the null « chosen at » it had read: the
/// switch undone, and the obligatory choice screen back. The switch turns the
/// stamp, so the late write fails as Identity's ConcurrencyFailure instead of
/// winning. The database is asked afterwards whether the switch really
/// happened, so the test cannot pass by the race quietly not running.</para>
///
/// <para>Its own factory, on the shared container: the interceptor must not
/// exist for the rest of the collection. The account is registered through the
/// API, not seeded by SQL: <c>UpdateAsync</c>'s validators require the unique
/// email a registration provides (<see cref="ProfileLocationEndpointsTests"/>).</para>
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class FormulaIdentityWriteRaceTests : IAsyncLifetime
{
    private const string SwitchUrl = "/api/formulas/current";
    private const string LocationUrl = "/api/auth/profile/location";
    private const string ValidPassword = "Test-Pass1!";

    private static readonly object Lyon = new
    {
        name = "Lyon",
        region = "Auvergne-Rhône-Alpes",
        country = "France",
        latitude = 45.76,
        longitude = 4.84,
    };

    private readonly PostgresFixture _fixture;
    // Identity's read of the WHOLE account — `FindByIdAsync`, every column of
    // the row, the stamp among them: the switch's own lock on the same row
    // reads its formula alone, `FOR UPDATE`.
    private readonly FormulaReadRaceInterceptor _interceptor = new(text =>
        text.Contains("FROM \"AspNetUsers\"", StringComparison.Ordinal)
        && text.Contains("\"ConcurrencyStamp\"", StringComparison.Ordinal)
        && text.Contains("\"Formula\"", StringComparison.Ordinal)
        && !text.Contains("FOR UPDATE", StringComparison.Ordinal));
    private WebApplicationFactory<Program> _factory = default!;
    private HttpClient _client = default!;

    public FormulaIdentityWriteRaceTests(PostgresFixture fixture) => _fixture = fixture;

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
    /// The review's case: a Gardener that never chose, saving its default
    /// location while the same account, in another tab, switches to the Expert
    /// — the switch landing between the location's read of the account and its
    /// write.
    /// </summary>
    [Fact]
    public async Task PutProfileLocation_ASwitchCommittingBetweenItsReadAndItsWrite_NeverPutsTheOldFormulaBack()
    {
        var userId = await RegisterAsync();
        _client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _fixture.GenerateToken(userId));

        HttpStatusCode? switched = null;
        _interceptor.Arm(async () =>
        {
            using var racer = _factory.CreateClient();
            racer.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _fixture.GenerateToken(userId));
            switched = (await racer.PutAsJsonAsync(SwitchUrl, new { formula = "expert" })).StatusCode;
        });

        var location = await _client.PutAsJsonAsync(LocationUrl, Lyon);

        Assert.True(
            _interceptor.Fired,
            "The interceptor never saw Identity's read of the account — the race was not run. "
                + $"Commands observed while armed: {_interceptor.Seen}.");
        Assert.Equal(HttpStatusCode.NoContent, switched);

        // The switch stands — the formula AND the deliberate choice, without
        // which the obligatory choice screen would come back.
        var account = await LoadUserAsync(userId);
        Assert.Equal("expert", account.Formula);
        Assert.NotNull(account.FormulaChosenAt);

        // The late write is refused for what it is, not lost in silence: the
        // dashboard's door answers its failure, and the next save reads the
        // account afresh.
        Assert.Equal(HttpStatusCode.BadRequest, location.StatusCode);
        Assert.Contains("ConcurrencyFailure", await location.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Null(account.LocationName);
    }

    private async Task<string> RegisterAsync()
    {
        var email = $"formula-race-{Guid.NewGuid():N}@example.com";
        var response = await _client.PostAsJsonAsync("/api/auth/register", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email);
        Assert.NotNull(user);
        return user!.Id;
    }

    private async Task<ApplicationUser> LoadUserAsync(string userId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        return await db.Users.AsNoTracking().SingleAsync(u => u.Id == userId);
    }
}
