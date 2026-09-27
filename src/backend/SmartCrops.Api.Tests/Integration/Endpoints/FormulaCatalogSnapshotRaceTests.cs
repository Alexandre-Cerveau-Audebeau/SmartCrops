using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
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
/// SMA-448, lot F3, step L2 — E9 (PR #293, fix round 1): <c>GET /api/formulas</c>
/// reads the account's formula and its gardens in ONE snapshot, proved by
/// losing the race on purpose (the <see cref="FormulaPreferencesSnapshotRaceTests"/>
/// pattern, the same interceptor).
///
/// <para>A Novice at its limit — three gardens, its formula chosen — asks for
/// the catalogue. The instant its joined read comes back, a real switch to
/// the Expert and a real creation of a fourth garden run to their commits.
/// Two reads would pair the formula of before — the Novice — with the
/// gardens of after — four: a Novice « beyond its limit », with a reason
/// the account never had. One read answers from one instant: the Novice,
/// three gardens, no reason. The database is asked afterwards whether the
/// race really happened, so the test cannot pass by the race quietly not
/// running.</para>
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class FormulaCatalogSnapshotRaceTests : IAsyncLifetime
{
    private const string Url = "/api/formulas";
    private const string SwitchUrl = "/api/formulas/current";
    private const string GardensUrl = "/api/gardens";

    private readonly PostgresFixture _fixture;
    // The ONE statement that reads the account's formula AND its gardens —
    // the joined read, and only it: the switch's lock reads `FOR UPDATE`, the
    // creation counts (`count(`), and a read of the whole user would carry
    // its other columns.
    private readonly FormulaReadRaceInterceptor _interceptor = new(text =>
        text.Contains("FROM \"AspNetUsers\"", StringComparison.Ordinal)
        && text.Contains("\"Formula\"", StringComparison.Ordinal)
        && text.Contains("\"Gardens\"", StringComparison.Ordinal)
        && !text.Contains("FOR UPDATE", StringComparison.Ordinal)
        && !text.Contains("count(", StringComparison.OrdinalIgnoreCase)
        && !text.Contains("\"NormalizedUserName\"", StringComparison.Ordinal));
    private WebApplicationFactory<Program> _factory = default!;
    private HttpClient _client = default!;

    public FormulaCatalogSnapshotRaceTests(PostgresFixture fixture) => _fixture = fixture;

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

    [Fact]
    public async Task GetFormulas_ASwitchAndACreation_LandingMidRequest_NeverPairTheFormulaOfBeforeWithTheGardensOfAfter()
    {
        var userId = await SeedUserAsync("novice");
        for (var i = 0; i < 3; i++) await SeedGardenAsync(userId, Guid.NewGuid());
        AuthAs(userId);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.PutAsJsonAsync(SwitchUrl, new { formula = "novice" })).StatusCode);

        HttpStatusCode? switched = null;
        HttpStatusCode? created = null;
        _interceptor.Arm(async () =>
        {
            using var racer = _factory.CreateClient();
            racer.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _fixture.GenerateToken(userId));
            switched = (await racer.PutAsJsonAsync(SwitchUrl, new { formula = "expert" })).StatusCode;
            created = (await racer.PostAsJsonAsync(GardensUrl, new { name = "Le quatrième" })).StatusCode;
        });

        var response = await _client.GetAsync(Url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.True(
            _interceptor.Fired,
            "The interceptor never saw the joined read of the account's formula and gardens — the race was not run. "
                + $"Commands observed while armed: {_interceptor.Seen}.");
        Assert.Equal(HttpStatusCode.NoContent, switched);
        Assert.Equal(HttpStatusCode.Created, created);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            Assert.Equal("expert", await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.Formula).SingleAsync());
            Assert.Equal(4, await db.Gardens.CountAsync(g => g.UserId == userId));
        }

        // One instant: the Novice, its three gardens, and no reason against it.
        var account = body.RootElement.GetProperty("account");
        Assert.Equal("novice", account.GetProperty("formula").GetString());
        Assert.True(account.GetProperty("chosen").GetBoolean());
        Assert.Equal(3, account.GetProperty("gardenCount").GetInt32());
        var novice = account.GetProperty("availability").EnumerateArray()
            .Single(entry => entry.GetProperty("formula").GetString() == "novice");
        Assert.True(novice.GetProperty("current").GetBoolean());
        Assert.Empty(novice.GetProperty("reasons").EnumerateArray());
    }

    private void AuthAs(string userId) =>
        _client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _fixture.GenerateToken(userId));

    private async Task<string> SeedUserAsync(string formula)
    {
        var userId = Guid.NewGuid().ToString();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO ""AspNetUsers"" (
                ""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"",
                ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"",
                ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"", ""Formula"")
            VALUES ({0}, {0}, {0}, NULL, NULL, FALSE, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0, {1});",
            userId, formula);
        return userId;
    }

    private async Task SeedGardenAsync(string userId, Guid id)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.Gardens.Add(new Garden
        {
            Id = id,
            Name = "Garden " + id.ToString("N")[..6],
            UserId = userId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            LayoutWidth = 10,
            LayoutHeight = 10,
            CellSize = "50cm",
        });
        await db.SaveChangesAsync();
    }
}
