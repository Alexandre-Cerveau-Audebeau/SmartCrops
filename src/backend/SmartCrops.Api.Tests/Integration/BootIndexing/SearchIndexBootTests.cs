using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.ExternalApis.SearchIndex;
using Testcontainers.PostgreSql;
using Typesense;
using Typesense.Setup;

namespace SmartCrops.Api.Tests.Integration.BootIndexing;

/// <summary>
/// SMA-389 — dedicated two-container fixture for the boot-time idempotent
/// index. The shared <c>PostgresFixture</c> is structurally unusable here: its
/// "Testing" environment skips the whole boot-init chain and DI-stubs
/// <see cref="SmartCrops.Core.Interfaces.ISearchIndexingService"/>, while these
/// proofs need the REAL chain (migrations + DataSeeder + AdminRoleSeeder + the
/// SMA-389 step) against a REAL engine. Typesense runs as a generic
/// <see cref="ContainerBuilder"/> container (no Testcontainers module exists
/// for it) on the compose-pinned image. The wait strategy asserts the /health
/// BODY carries <c>"ok":true</c>: the engine transiently replays
/// <c>{"ok":false}</c> while opening its store (documented on the prod compose
/// healthcheck), so a port-open or 200-status wait would pass too early.
/// </summary>
public sealed class SearchIndexBootFixture : IAsyncLifetime
{
    public const string TypesenseApiKey = "boot-test-typesense-key";

    // Database name per the coding guideline ("Use the smartcrops database"):
    // the container is isolated, so the canonical name costs nothing (R1).
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("smartcrops")
        .WithUsername("test")
        .WithPassword("test")
        .WithCleanUp(true)
        .Build();

    // TYPESENSE_DATA_DIR points at /tmp: the image ships no /data directory
    // (compose creates it via the volume mount) and the engine does not mkdir
    // its data dir — /tmp always exists, and container-lifetime persistence is
    // exactly what the second-boot no-op proof needs. The image rides the
    // constructor per the Testcontainers 4.x recommendation (the parameterless
    // overload is [Obsolete]), mirroring the PostgresFixture.
    private readonly IContainer _typesense = new ContainerBuilder("typesense/typesense:30.2")
        .WithEnvironment("TYPESENSE_API_KEY", TypesenseApiKey)
        .WithEnvironment("TYPESENSE_DATA_DIR", "/tmp")
        .WithPortBinding(8108, true)
        .WithCleanUp(true)
        .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(request => request
            .ForPort(8108)
            .ForPath("/health")
            .ForResponseMessageMatching(async response =>
                (await response.Content.ReadAsStringAsync()).Contains("\"ok\":true"))))
        .Build();

    public string ConnectionString => _postgres.GetConnectionString();

    public string TypesenseHost => _typesense.Hostname;

    public int TypesensePort => _typesense.GetMappedPublicPort(8108);

    public async Task InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _typesense.StartAsync());
    }

    public async Task DisposeAsync()
    {
        await Task.WhenAll(_postgres.DisposeAsync().AsTask(), _typesense.DisposeAsync().AsTask());
    }
}

/// <summary>
/// SMA-389 — the boot-time index proofs the go-live outage called for: a fresh
/// environment boots into a LIVE library (collection created + filled), a
/// second boot against the same volumes is a strict no-op, and a dead engine
/// cannot kill a boot that can otherwise serve (the SMA-377 doctrine extended;
/// the BootOptionalUpstreamsTests shape with a real database).
/// </summary>
[Trait("Category", "Integration")]
public sealed class SearchIndexBootTests : IClassFixture<SearchIndexBootFixture>
{
    private readonly SearchIndexBootFixture _fixture;

    public SearchIndexBootTests(SearchIndexBootFixture fixture)
    {
        _fixture = fixture;
    }

    /// <summary>
    /// A factory that runs the REAL boot chain. "Development" (not "Testing")
    /// so Program.cs runs migrations + DataSeeder + AdminRoleSeeder + the
    /// SMA-389 index step — and it also keeps the Frontend:BaseUrl
    /// ValidateOnStart disarmed. Program.cs binds the Typesense CLIENT's
    /// endpoint from PRE-Build inline configuration, which a
    /// WebApplicationFactory cannot override (the minimal-hosting caveat the
    /// DataProtection block documents), so the client is re-registered via
    /// ConfigureTestServices (last registration wins) pointing at the test
    /// container — the config keys are set too so the validated options and
    /// the client agree.
    /// </summary>
    private WebApplicationFactory<Program> BuildBootingFactory(
        int typesensePort,
        CapturingLoggerProvider? logCapture = null,
        Action<IServiceCollection>? extraServices = null)
    {
        var builder = new TestWebAppBuilder()
            .WithEnvironment("Development")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithTypesense(SearchIndexBootFixture.TypesenseApiKey)
            .WithSmtp()
            .WithConnectionString(_fixture.ConnectionString)
            // Anti-ambient blank (the boot-guard family's doctrine): a stray
            // Database__Host on the runner would OUTRANK the connection string
            // in ConnectionStringResolver and point this REAL boot at the
            // wrong database.
            .WithConfig("Database:Host", "")
            .WithConfig("Typesense:Host", _fixture.TypesenseHost)
            .WithConfig("Typesense:Port", typesensePort.ToString(CultureInfo.InvariantCulture))
            .WithConfig("Typesense:Protocol", "http")
            .WithServices(services => services.AddTypesenseClient(config =>
            {
                config.ApiKey = SearchIndexBootFixture.TypesenseApiKey;
                config.Nodes = new List<Node>
                {
                    new(_fixture.TypesenseHost, typesensePort.ToString(CultureInfo.InvariantCulture), "http"),
                };
            }));

        if (logCapture is not null)
        {
            builder = builder.WithServices(services => services.AddSingleton<ILoggerProvider>(logCapture));
        }

        if (extraServices is not null)
        {
            builder = builder.WithServices(extraServices);
        }

        return builder.Build();
    }

    private async Task<CollectionResponse> RetrieveCollectionAsync()
    {
        var config = new Config(
            new List<Node>
            {
                new(_fixture.TypesenseHost, _fixture.TypesensePort.ToString(CultureInfo.InvariantCulture), "http"),
            },
            SearchIndexBootFixture.TypesenseApiKey);
        using var http = new HttpClient();
        var client = new TypesenseClient(Options.Create(config), http);
        return await client.RetrieveCollection(PlantsSearchCollection.Name);
    }

    [Fact]
    public async Task FreshVolumes_FirstBootFills_SecondBootNoOps()
    {
        // Phase 1 — first boot against fresh-or-unindexed volumes: migrations
        // + the 30-plant DataSeeder starter set + collection created and
        // filled, all before /health first answers.
        var firstBootLog = new CapturingLoggerProvider();
        await using (var factory = BuildBootingFactory(_fixture.TypesensePort, firstBootLog))
        {
            using var client = factory.CreateClient();
            Assert.Equal("ok", await client.GetStringAsync("/health"));
        }

        Assert.Contains(firstBootLog.Lines, line => line.Contains("Search index boot: FILLED"));
        var afterFirst = await RetrieveCollectionAsync();
        Assert.Equal(30, afterFirst.NumberOfDocuments);

        // Phase 2 — second boot against the SAME volumes: the ruled strict
        // no-op (one GET; the count cannot move). The wire-level one-GET proof
        // is pinned in TypesenseSearchIndexingServiceTests over the transport
        // stub — a real container cannot expose its request log.
        var secondBootLog = new CapturingLoggerProvider();
        await using (var factory = BuildBootingFactory(_fixture.TypesensePort, secondBootLog))
        {
            using var client = factory.CreateClient();
            Assert.Equal("ok", await client.GetStringAsync("/health"));
        }

        Assert.Contains(secondBootLog.Lines, line => line.Contains("Search index boot: NO-OP"));
        Assert.DoesNotContain(secondBootLog.Lines, line => line.Contains("Search index boot: FILLED"));
        var afterSecond = await RetrieveCollectionAsync();
        Assert.Equal(30, afterSecond.NumberOfDocuments);
    }

    [Fact]
    public async Task PartialFill_LogsErrorLevelPartialLine()
    {
        // R1: per-document rejections come back in-band (Failures) without an
        // exception — the boot must log ERROR-level PARTIAL, never a green
        // FILLED (a real engine cannot be made to reject documents on demand,
        // so the indexer is stubbed; the Program.cs branch under test is real).
        var log = new CapturingLoggerProvider();
        await using var factory = BuildBootingFactory(
            _fixture.TypesensePort,
            log,
            services =>
            {
                services.RemoveAll<ISearchIndexingService>();
                services.AddSingleton<ISearchIndexingService>(new StubSearchIndexingService
                {
                    NextEnsure = new SearchIndexEnsureResult(
                        true, 0, new SearchReindexResult(false, 5, 10, ["doc-1 (Solanum): rejected"])),
                });
            });
        using var client = factory.CreateClient();

        Assert.Equal("ok", await client.GetStringAsync("/health"));
        var partial = Assert.Single(log.Lines, line => line.Contains("Search index boot: PARTIAL"));
        Assert.StartsWith("Error|", partial);
        Assert.DoesNotContain(log.Lines, line => line.Contains("Search index boot: FILLED"));
    }

    [Fact]
    public async Task DeadEngine_BootSucceeds_LogsFailed_AndFinderAnswers503()
    {
        // Nothing listens on port 1 (tcpmux) — the connection is refused. The
        // boot must survive it (SMA-377 doctrine extended), emit the FAILED
        // line (the only operational signal — the health gate cannot see the
        // index), and degrade to today's behavior: healthy /health, finder 503.
        var log = new CapturingLoggerProvider();
        await using var factory = BuildBootingFactory(typesensePort: 1, log);
        using var client = factory.CreateClient();

        Assert.Equal("ok", await client.GetStringAsync("/health"));
        Assert.Contains(log.Lines, line => line.Contains("Search index boot: FAILED"));

        var finder = await client.GetAsync("/api/plants/finder?q=tomate&lang=fr");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, finder.StatusCode);
    }

    /// <summary>
    /// Minimal thread-safe log tap: the boot lines are the SMA-389 feature's
    /// only operational signal, so the tests assert them, not just the state
    /// they describe.
    /// </summary>
    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        public ConcurrentQueue<string> Lines { get; } = new();

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(this, categoryName);

        public void Dispose()
        {
        }

        private sealed class CapturingLogger(CapturingLoggerProvider owner, string category) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(
                LogLevel logLevel,
                EventId eventId,
                TState state,
                Exception? exception,
                Func<TState, Exception?, string> formatter)
                => owner.Lines.Enqueue($"{logLevel}|{category}|{formatter(state, exception)}");
        }
    }
}
