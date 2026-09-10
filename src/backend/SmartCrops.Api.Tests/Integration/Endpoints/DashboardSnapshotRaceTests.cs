using System.Data.Common;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartCrops.Api.DTOs;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Interceptors;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-336 PR 2/5, round 3 (E″1) — the aggregate is ONE snapshot, proved by
/// losing the race on purpose.
///
/// <para>Round 1 removed a second <c>GardenPlacements</c> read from
/// <c>GET /api/dashboard</c> and locked it with
/// <c>GetDashboard_VarietyCountsAndGardenIdsComeFromTheSameSnapshot</c>. That
/// lock is honest about what it checks — the invariants — but CodeRabbit is
/// right that it does not exercise the defect: every write completes before the
/// request starts, so a quiescent database satisfies those invariants under the
/// two-read implementation too.</para>
///
/// <para>This class supplies the missing half. A command interceptor waits for
/// the garden-and-placements query to COME BACK, then inserts a second
/// placement from a connection of its own. Any later read of
/// <c>GardenPlacements</c> in the same request would see two; the response says
/// one. The database is asked afterwards to confirm it really holds two, so the
/// test cannot pass by the mutation quietly failing to happen.</para>
///
/// <para>Its own factory, on the shared container — the
/// <see cref="AccountRateLimitTests"/> pattern. The interceptor must not exist
/// for the other 992 tests of the collection, and a factory of its own is the
/// only way to say so that cannot leak.</para>
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class DashboardSnapshotRaceTests : IAsyncLifetime
{
    private readonly PostgresFixture _fixture;
    private readonly PlacementRaceInterceptor _interceptor;
    private WebApplicationFactory<Program> _factory = default!;
    private HttpClient _client = default!;

    public DashboardSnapshotRaceTests(PostgresFixture fixture)
    {
        _fixture = fixture;
        _interceptor = new PlacementRaceInterceptor(fixture.ConnectionString);
    }

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
            // The interceptor has to be attached to the DbContext OPTIONS, not
            // merely registered in the container: `AddInfrastructure` builds the
            // options with an explicit `AddInterceptors`, and a bare
            // `AddSingleton<IInterceptor>` is never consulted (measured — the
            // interceptor saw zero commands). Same shape as
            // `TestWebAppBuilder.WithInMemoryDatabase`: drop the options
            // descriptors, re-register, and carry the production interceptor
            // across so the timestamps keep working.
            //
            // Round 4 (C2 — E‴1): BOTH descriptor types go — every
            // `DbContextOptions<SmartCropsDbContext>`, and every
            // `IDbContextOptionsConfiguration<SmartCropsDbContext>` beside it.
            // The defect the finding describes is real: where a provider keeps
            // one configuration descriptor per `AddDbContext` call and applies
            // ALL of them, dropping only the options descriptor leaves the
            // production `AddInfrastructure` configuration live next to this
            // one and the fixture is not isolated.
            //
            // MEASURED, and the measurement is worth writing down: on the
            // pinned EF Core 8.0.x assemblies this clause matches nothing —
            // `Microsoft.EntityFrameworkCore.dll` 8.0.11, 8.0.29 and 8.0.30
            // contain no type whose name ends in `OptionsConfiguration` at all;
            // that interface arrives with EF Core 9. On 8.0.30 the options
            // descriptor alone is the whole registration, which is why the
            // round 3 loop worked and why this test still proves what it
            // claims. The clause is kept because it costs one string comparison
            // per descriptor once at fixture start-up, and it is exactly the
            // guard this fixture needs the day the solution moves to EF Core 9
            // — the version where the finding's premise becomes true.
            //
            // Matched by NAME on the generic type definition rather than by
            // `typeof(...)` for the same reason: the type does not exist on the
            // version this project compiles against, so naming it would not
            // build.
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
        _client.Dispose();
        await _factory.DisposeAsync();
    }

    [Fact]
    public async Task GetDashboard_APlacementInsertedMIDREQUEST_DoesNotReachTheAnswer()
    {
        var userId = Guid.NewGuid().ToString();
        Guid gardenId;
        Guid basil;
        Guid fern;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            db.Users.Add(new ApplicationUser
            {
                Id = userId,
                UserName = $"{userId}@example.com",
                Email = $"{userId}@example.com",
                EmailConfirmed = true,
            });

            var herb = await db.PlantTypes.AsNoTracking()
                .Where(t => t.Name == "Herb")
                .Select(t => t.Id)
                .SingleAsync();

            basil = Guid.NewGuid();
            fern = Guid.NewGuid();
            db.Plants.Add(new Plant
            {
                Id = basil,
                ScientificName = "Ocimum basilicum",
                PlantTypeId = herb,
                IsEdible = true,
            });
            db.Plants.Add(new Plant
            {
                Id = fern,
                ScientificName = "Athyrium vidalii",
                PlantTypeId = herb,
                IsEdible = true,
            });

            gardenId = Guid.NewGuid();
            db.Gardens.Add(new Garden
            {
                Id = gardenId,
                UserId = userId,
                Name = "Terrasse",
                LayoutWidth = 10,
                LayoutHeight = 8,
                CellSize = "50cm",
            });
            db.GardenPlacements.Add(new GardenPlacement
            {
                Id = Guid.NewGuid(),
                GardenId = gardenId,
                PlantId = basil,
                StartRow = 0,
                StartCol = 0,
                SpanRows = 1,
                SpanCols = 1,
                PlacedAt = DateTime.UtcNow,
            });

            await db.SaveChangesAsync();
        }

        // Armed only now: the seeding above writes GardenPlacements too, and the
        // interceptor must fire during the DASHBOARD read, not during setup.
        _interceptor.Arm(gardenId, fern);

        _client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _fixture.GenerateToken(userId));
        var body = await _client.GetFromJsonAsync<DashboardResponse>("/api/dashboard");

        Assert.NotNull(body);

        // The test is worthless if the race never happened. Both halves are
        // asserted: the interceptor ran, and the row it wrote is really there.
        Assert.True(
            _interceptor.Fired,
            "The interceptor never saw a GardenPlacements read — the race was not run. "
                + $"Commands observed while armed: {_interceptor.Seen}.");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            Assert.Equal(
                2,
                await db.GardenPlacements.AsNoTracking()
                    .CountAsync(p => p.GardenId == gardenId));
        }

        // The answer describes the snapshot taken BEFORE that insert: one
        // placement, one variety, and no trace of the fern.
        var garden = Assert.Single(body.Gardens);
        Assert.Equal(1, garden.PlacementCount);
        Assert.Equal(1, garden.VarietyCount);
        Assert.Equal(1, body.Totals.PlacementCount);
        Assert.Equal("Ocimum basilicum", Assert.Single(body.Varieties).ScientificName);

        // And it is internally consistent — the property the second read could
        // break, now measured while the database moved underneath it.
        Assert.Equal(body.Totals.PlacementCount, body.Varieties.Sum(v => v.Count));
        Assert.Equal(body.Totals.PlacementCount, body.Gardens.Sum(g => g.PlacementCount));
        Assert.All(body.Varieties, v => Assert.NotEmpty(v.GardenIds));
    }
}

/// <summary>
/// Inserts one placement the instant the dashboard's garden query returns, from
/// a connection of its own so the running request's transaction is untouched.
/// Fires at most once, and only while armed.
/// </summary>
internal sealed class PlacementRaceInterceptor(string connectionString) : DbCommandInterceptor
{
    private int _fired;
    private int _seen;
    private Guid _gardenId;
    private Guid _plantId;

    public bool Fired => Volatile.Read(ref _fired) == 1;

    /// <summary>
    /// How many commands passed through while armed. Zero means the interceptor
    /// was never wired at all, which is a different failure from « the query
    /// did not touch GardenPlacements » and has to read differently.
    /// </summary>
    public int Seen => Volatile.Read(ref _seen);

    public void Arm(Guid gardenId, Guid plantId)
    {
        _gardenId = gardenId;
        _plantId = plantId;
        Volatile.Write(ref _fired, 0);
        Volatile.Write(ref _seen, 0);
    }

    public override async ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result,
        CancellationToken cancellationToken = default)
    {
        // AFTER the read, not before: PostgreSQL takes a statement-level
        // snapshot at execution under READ COMMITTED, so a row written before
        // the command runs would simply be part of the first snapshot and prove
        // nothing.
        if (_gardenId == Guid.Empty)
        {
            return await base.ReaderExecutedAsync(command, eventData, result, cancellationToken);
        }

        Interlocked.Increment(ref _seen);

        if (command.CommandText.Contains("GardenPlacements", StringComparison.Ordinal)
            && Interlocked.Exchange(ref _fired, 1) == 0)
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);
            await using var insert = connection.CreateCommand();
            insert.CommandText =
                """
                INSERT INTO "GardenPlacements"
                    ("Id", "GardenId", "PlantId", "StartRow", "StartCol",
                     "SpanRows", "SpanCols", "Notes", "PlacedAt")
                VALUES (@id, @garden, @plant, 4, 4, 1, 1, NULL, @placedAt);
                """;
            insert.Parameters.Add(new NpgsqlParameter("id", Guid.NewGuid()));
            insert.Parameters.Add(new NpgsqlParameter("garden", _gardenId));
            insert.Parameters.Add(new NpgsqlParameter("plant", _plantId));
            insert.Parameters.Add(new NpgsqlParameter("placedAt", DateTime.UtcNow));
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        return await base.ReaderExecutedAsync(command, eventData, result, cancellationToken);
    }
}
