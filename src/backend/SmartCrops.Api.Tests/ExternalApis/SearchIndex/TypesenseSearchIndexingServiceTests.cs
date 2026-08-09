using System.Net;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.ExternalApis.SearchIndex;
using Typesense;
using Typesense.Setup;

namespace SmartCrops.Api.Tests.ExternalApis.SearchIndex;

/// <summary>
/// Service-level tests for the SMA-255 reindex failure contract. The 59-method
/// <see cref="ITypesenseClient"/> is not hand-faked — instead the REAL
/// <see cref="TypesenseClient"/> runs over a programmable
/// <see cref="HttpMessageHandler"/> (the repo's StubPerenualHttpHandler
/// transport-stub idiom), so the client's own status-code → exception mapping
/// is part of what's under test. The DbContext is EF InMemory (empty plant
/// set — these tests target the collection-bootstrap path, not the import).
/// </summary>
public class TypesenseSearchIndexingServiceTests
{
    private static SmartCropsDbContext InMemoryDb() => new(
        new DbContextOptionsBuilder<SmartCropsDbContext>()
            .UseInMemoryDatabase($"typesense-svc-{Guid.NewGuid():N}")
            .Options);

    private static TypesenseSearchIndexingService ServiceOver(StubTypesenseHttpHandler handler, SmartCropsDbContext db)
    {
        var config = new Config(
            new List<Node> { new("localhost", "8108", "http") },
            "test-typesense-key");
        var client = new TypesenseClient(Options.Create(config), new HttpClient(handler));
        return new TypesenseSearchIndexingService(
            db, client, NullLogger<TypesenseSearchIndexingService>.Instance);
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string body) => new(status)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json"),
    };

    [Fact]
    public async Task ReindexAll_CreateCollectionConflict_TreatedAsBenignExisting()
    {
        // TOCTOU race: we see 404 on retrieve, a concurrent reindex creates the
        // collection first, our create gets 409 — the service must swallow the
        // conflict and report the collection as existing, not throw.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = request => request.Method == HttpMethod.Get
                ? Json(HttpStatusCode.NotFound, """{"message":"Not Found"}""")
                : Json(HttpStatusCode.Conflict, """{"message":"A collection with name `plants` already exists."}"""),
        };
        await using var db = InMemoryDb();
        var service = ServiceOver(handler, db);

        var result = await service.ReindexAllAsync();

        Assert.True(result.CollectionExisted);
        Assert.Equal(0, result.DocumentsIndexed);
        Assert.Empty(result.Failures);
        Assert.Equal(
            [(HttpMethod.Get, "/collections/plants"), (HttpMethod.Post, "/collections")],
            handler.Received);
    }

    [Fact]
    public async Task ReindexAll_EngineUnreachable_PropagatesForControllerMapping()
    {
        // Design (a): the service does NOT convert transport failures into a
        // result — they propagate so SearchIndexController maps them to 503.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => throw new HttpRequestException("connection refused"),
        };
        await using var db = InMemoryDb();
        var service = ServiceOver(handler, db);

        await Assert.ThrowsAsync<HttpRequestException>(() => service.ReindexAllAsync());
    }

    [Fact]
    public async Task ReindexAll_AlreadyCanceled_ThrowsBeforeAnyEngineCall()
    {
        // typesense-dotnet 8.5.0 takes a CancellationToken only on the
        // retrieve calls (import/create expose none), so the service's
        // explicit checkpoints are the cancellation contract: a pre-canceled
        // token must abort before any HTTP traffic.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(HttpStatusCode.OK, "{}"),
        };
        await using var db = InMemoryDb();
        var service = ServiceOver(handler, db);
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => service.ReindexAllAsync(cts.Token));
        Assert.Empty(handler.Received);
    }

    [Fact]
    public async Task ReindexIfEmpty_PopulatedCollection_NoOpsAfterExactlyOneGet()
    {
        // SMA-389 ruling, pinned at WIRE level: a populated index is NEVER
        // reindexed at boot — the whole call is exactly one collection GET,
        // zero writes.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = request => request.Method == HttpMethod.Get
                ? Json(HttpStatusCode.OK, """{"name":"plants","num_documents":30,"fields":[]}""")
                : throw new InvalidOperationException("The boot no-op must not write to the engine."),
        };
        await using var db = InMemoryDb();
        var service = ServiceOver(handler, db);

        var result = await service.ReindexIfEmptyAsync();

        Assert.False(result.Indexed);
        Assert.Equal(30, result.ExistingDocuments);
        Assert.Null(result.Reindex);
        Assert.Equal([(HttpMethod.Get, "/collections/plants")], handler.Received);
    }

    [Fact]
    public async Task ReindexIfEmpty_AbsentCollection_FallsIntoBootstrapFill()
    {
        // GET 404 → the fill path runs: ReindexAllAsync bootstraps the schema
        // (its own GET + POST /collections). The InMemory plant set is empty,
        // so no import request follows — the outcome still reports
        // Indexed=true carrying the run's summary.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = request => request.Method == HttpMethod.Get
                ? Json(HttpStatusCode.NotFound, """{"message":"Not Found"}""")
                : Json(HttpStatusCode.Created, """{"name":"plants","num_documents":0,"fields":[]}"""),
        };
        await using var db = InMemoryDb();
        var service = ServiceOver(handler, db);

        var result = await service.ReindexIfEmptyAsync();

        Assert.True(result.Indexed);
        Assert.NotNull(result.Reindex);
        Assert.False(result.Reindex!.CollectionExisted);
        Assert.Equal(0, result.Reindex.DocumentsIndexed);
        Assert.Equal(
            [
                (HttpMethod.Get, "/collections/plants"),
                (HttpMethod.Get, "/collections/plants"),
                (HttpMethod.Post, "/collections"),
            ],
            handler.Received);
    }

    [Fact]
    public async Task ReindexIfEmpty_EmptyCollection_FallsIntoFill()
    {
        // Present-but-empty is the second half of the ruled absent-or-empty
        // trigger: num_documents=0 must NOT be treated as the no-op.
        var handler = new StubTypesenseHttpHandler
        {
            OnSend = _ => Json(HttpStatusCode.OK, """{"name":"plants","num_documents":0,"fields":[]}"""),
        };
        await using var db = InMemoryDb();
        var service = ServiceOver(handler, db);

        var result = await service.ReindexIfEmptyAsync();

        Assert.True(result.Indexed);
        Assert.NotNull(result.Reindex);
        Assert.True(result.Reindex!.CollectionExisted);
        Assert.Equal(
            [
                (HttpMethod.Get, "/collections/plants"),
                (HttpMethod.Get, "/collections/plants"),
            ],
            handler.Received);
    }

    /// <summary>
    /// Programmable transport backing the real TypesenseClient — records each
    /// request and delegates the response to <see cref="OnSend"/>.
    /// </summary>
    private sealed class StubTypesenseHttpHandler : HttpMessageHandler
    {
        public List<(HttpMethod Method, string Path)> Received { get; } = [];

        public Func<HttpRequestMessage, HttpResponseMessage>? OnSend { get; init; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Received.Add((request.Method, request.RequestUri!.AbsolutePath));
            if (OnSend is null)
                throw new InvalidOperationException("No responder configured on StubTypesenseHttpHandler.");
            return Task.FromResult(OnSend(request));
        }
    }
}
