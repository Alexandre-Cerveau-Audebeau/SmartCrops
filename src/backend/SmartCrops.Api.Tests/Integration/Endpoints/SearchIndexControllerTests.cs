using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Interfaces;
using Typesense;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Tests for the SMA-255 admin reindex endpoint. The
/// <see cref="ISearchIndexingService"/> is stubbed at the DI layer
/// (PostgresFixture) — no Typesense server exists in the integration
/// environment; the mapper contract is unit-tested in
/// <c>PlantSearchDocumentMapperTests</c> and the full Postgres→Typesense
/// round-trip is validated against the running docker stack.
/// </summary>
public class SearchIndexControllerTests : IntegrationTestBase
{
    public SearchIndexControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string ReindexUrl = "/api/admin/search/reindex";

    [Fact]
    public async Task Reindex_NoAuth_Returns401()
    {
        var response = await Client.PostAsync(ReindexUrl, null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, Fixture.SearchIndexingStub.Calls);
    }

    [Fact]
    public async Task Reindex_AuthenticatedNonAdmin_Returns403()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));

        var response = await Client.PostAsync(ReindexUrl, null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, Fixture.SearchIndexingStub.Calls);
    }

    [Fact]
    public async Task Reindex_Admin_ReturnsCountsOnlySummary()
    {
        Fixture.SearchIndexingStub.Next = new SearchReindexResult(
            CollectionExisted: false,
            DocumentsIndexed: 536,
            DurationMs: 42,
            Failures: ["someId (Some plant): bad document"]);
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId, Roles.Admin));

        var response = await Client.PostAsync(ReindexUrl, null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, Fixture.SearchIndexingStub.Calls);
        var body = await response.Content.ReadFromJsonAsync<ReindexResp>();
        Assert.NotNull(body);
        Assert.False(body!.CollectionExists);
        Assert.Equal(536, body.DocumentsIndexed);
        Assert.Equal(42, body.DurationMs);
        Assert.Equal(["someId (Some plant): bad document"], body.Failures);
    }

    [Fact]
    public async Task Reindex_EngineUnavailable_Returns503NotOpaque500()
    {
        // Design (a) of the SMA-255 failure contract: TypesenseApiException /
        // HttpRequestException from the indexing service map to 503 in the
        // controller — an unreachable search engine is a foreseeable operator
        // situation, not an internal server error.
        Fixture.SearchIndexingStub.NextException =
            new TypesenseApiServiceUnavailableException("engine down");
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId, Roles.Admin));

        var response = await Client.PostAsync(ReindexUrl, null);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(1, Fixture.SearchIndexingStub.Calls);
    }

    private sealed record ReindexResp(
        bool CollectionExists,
        int DocumentsIndexed,
        long DurationMs,
        string[] Failures);
}
