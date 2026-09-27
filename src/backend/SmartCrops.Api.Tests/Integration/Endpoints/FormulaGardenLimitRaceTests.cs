using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Interceptors;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-448, lot F3, step L1 — the formula's garden limit is applied WITHOUT
/// a race (pre-flight § C.4.1; constat 8: the creation had neither account
/// nor transaction), proved by losing the race on purpose — the
/// <see cref="DashboardSnapshotRaceTests"/> pattern.
///
/// <para>A Novice with two gardens creates two more at once. A command
/// interceptor waits for the FIRST request's count of its gardens to come
/// back, then fires the second request and gives it its chance. Under the
/// account's lock (<see cref="AccountFormulaLock"/>, taken in a transaction
/// before the count), the second request waits for the first to commit, then
/// counts three: exactly one 201 and one 403, three gardens in the database.
/// A naive check — count, then insert, no lock — lets the second request
/// count two as well: two 201s, four gardens for a formula that allows
/// three.</para>
///
/// <para>Its own factory, on the shared container: the interceptor must not
/// exist for the rest of the collection.</para>
/// </summary>
[Collection("Integration")]
[Trait("Category", "Integration")]
public class FormulaGardenLimitRaceTests : IAsyncLifetime
{
    private const string GardensUrl = "/api/gardens";

    private readonly PostgresFixture _fixture;
    private readonly GardenCountRaceInterceptor _interceptor = new();
    private WebApplicationFactory<Program> _factory = default!;
    private HttpClient _client = default!;

    public FormulaGardenLimitRaceTests(PostgresFixture fixture) => _fixture = fixture;

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
    public async Task CreateGarden_TwoCreationsAtTheLimit_LetExactlyOneThrough()
    {
        var userId = await SeedUserAsync("novice");
        for (var i = 0; i < 2; i++) await SeedGardenAsync(userId, Guid.NewGuid());
        AuthAs(userId);

        // The racer outlives the interceptor's delegate: disposed there, it
        // would cancel the second request while it waits on the lock.
        using var racer = _factory.CreateClient();
        racer.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _fixture.GenerateToken(userId));
        Task<HttpResponseMessage>? second = null;
        _interceptor.Arm(() =>
        {
            second = racer.PostAsJsonAsync(GardensUrl, new { name = "Le second" });
            // Its chance: long enough to reach the account's row — where the
            // lock makes it wait for this request — and short enough not to
            // wait for the answer it cannot give while this request holds
            // the row. Awaiting it here would be a deadlock by construction.
            return Task.WhenAny(second, Task.Delay(TimeSpan.FromMilliseconds(400)));
        });

        var first = await _client.PostAsJsonAsync(GardensUrl, new { name = "Le premier" });

        Assert.True(
            _interceptor.Fired,
            "The interceptor never saw the count of the account's gardens — the race was not run. "
                + $"Commands observed while armed: {_interceptor.Seen}.");
        Assert.NotNull(second);
        var other = await second!;

        Assert.Equal(
            new[] { HttpStatusCode.Created, HttpStatusCode.Forbidden },
            new[] { first.StatusCode, other.StatusCode }.OrderBy(status => (int)status));

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(3, await db.Gardens.CountAsync(g => g.UserId == userId));
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
        });
        await db.SaveChangesAsync();
    }
}

/// <summary>
/// Runs the armed race the instant a request's COUNT of an account's gardens
/// comes back — the statement the limit is decided on. Fires at most once,
/// and only while armed; the race's own commands pass through untouched.
/// </summary>
internal sealed class GardenCountRaceInterceptor : DbCommandInterceptor
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
        await RaceAfterAsync(command.CommandText);
        return await base.ReaderExecutedAsync(command, eventData, result, cancellationToken);
    }

    public override async ValueTask<object?> ScalarExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        object? result,
        CancellationToken cancellationToken = default)
    {
        await RaceAfterAsync(command.CommandText);
        return await base.ScalarExecutedAsync(command, eventData, result, cancellationToken);
    }

    /// <summary>
    /// AFTER the count, not before: the second request must find the first
    /// one's row locked and its count already taken — the moment a naive
    /// check would let both through.
    /// </summary>
    private async Task RaceAfterAsync(string text)
    {
        var race = _race;
        if (race is null) return;

        Interlocked.Increment(ref _seen);

        if (text.Contains("count(", StringComparison.OrdinalIgnoreCase)
            && text.Contains("\"Gardens\"", StringComparison.Ordinal)
            && Interlocked.Exchange(ref _fired, 1) == 0)
        {
            _race = null;
            await race();
        }
    }
}
