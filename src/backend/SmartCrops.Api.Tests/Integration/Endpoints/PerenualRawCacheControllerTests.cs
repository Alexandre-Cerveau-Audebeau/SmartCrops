using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Authorization;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.ExternalApis.Perenual;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for the SMA-93 raw-cache aspiration
/// (<c>POST /api/admin/perenual/cache-catalog</c>). The concrete
/// <c>PerenualClient</c> is stubbed at the HTTP transport via
/// <see cref="Stubs.StubPerenualHttpHandler"/> (PostgresFixture). They verify the
/// three phases capture verbatim into <c>PerenualRawCache</c>, the redaction guard
/// holds, deleted-id HTML is recorded without crashing, and the upsert is
/// idempotent (skip unless <c>force</c>).
/// </summary>
public class PerenualRawCacheControllerTests : IntegrationTestBase
{
    public PerenualRawCacheControllerTests(PostgresFixture fixture) : base(fixture) { }

    private const string Url = "/api/admin/perenual/cache-catalog";

    // A minimal species-list page body: last_page bounds the list loop, data[].id
    // seeds the details/careguide phases.
    private static string ListPage(int lastPage, params int[] ids)
    {
        var data = string.Join(",", ids.Select(id => $"{{\"id\":{id},\"common_name\":\"plant-{id}\"}}"));
        return $"{{\"data\":[{data}],\"current_page\":1,\"last_page\":{lastPage},\"total\":{ids.Length}}}";
    }

    // ── auth gate ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task CacheCatalog_NoAuth_Returns401()
    {
        var response = await Client.PostAsync($"{Url}?phase=list", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CacheCatalog_AuthenticatedNonAdmin_Returns403()
    {
        AuthAsNonAdmin();
        var response = await Client.PostAsync($"{Url}?phase=list", null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task CacheCatalog_UnknownPhase_Returns400()
    {
        AuthAsAdmin();
        var response = await Client.PostAsync($"{Url}?phase=bogus", null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ── phase=list ────────────────────────────────────────────────────────────

    [Fact]
    public async Task PhaseList_CachesPageVerbatim_AndReturnsCountsOnly()
    {
        var page1 = ListPage(1, 11, 22);
        Fixture.PerenualHttpStub.SetList(1, page1);
        AuthAsAdmin();

        var response = await Client.PostAsync($"{Url}?phase=list&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal("list", body!.Phase);
        Assert.Equal(1, body.Processed);
        Assert.Equal(0, body.Cached);
        Assert.Equal(0, body.HtmlSkipped);
        Assert.Equal(0, body.Failures);

        // Counts only — the cached body is never echoed in the response.
        var raw = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("common_name", raw);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var row = await db.PerenualRawCache.SingleAsync(c => c.Endpoint == "species-list" && c.ResourceId == "1");
        Assert.Equal(200, row.HttpStatus);

        // Verbatim = nothing dropped. jsonb does not preserve key order, so assert
        // every field survived structurally rather than by brittle string equality.
        using var doc = JsonDocument.Parse(row.RawJson!);
        var root = doc.RootElement;
        Assert.Equal(1, root.GetProperty("last_page").GetInt32());
        Assert.Equal(2, root.GetProperty("total").GetInt32());
        var ids = root.GetProperty("data").EnumerateArray().Select(e => e.GetProperty("id").GetInt32()).ToList();
        Assert.Equal(new[] { 11, 22 }, ids);
        Assert.Contains("plant-11", row.RawJson); // common_name preserved verbatim
    }

    [Fact]
    public async Task PhaseList_MultiPage_AdvancesCursor_ResumesFromAfterId_AndTerminatesAtLastPage()
    {
        // Two pages processed one-per-chunk (limit=1) so the keyset cursor
        // (nextCursor → afterId) resumption contract is directly exercised, AND the
        // SMA-94 terminal-detection: the cursor goes null AT last_page and page 3 is
        // never requested (no march-past-end / infinite resume).
        Fixture.PerenualHttpStub.SetList(1, ListPage(2, 11));
        Fixture.PerenualHttpStub.SetList(2, ListPage(2, 22));
        AuthAsAdmin();

        // Chunk 1: caches page 1, returns the cursor to resume from (last_page=2 not reached).
        var r1 = await Client.PostAsync($"{Url}?phase=list&limit=1&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);
        var b1 = await r1.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal(1, b1!.Processed);
        Assert.Equal("1", b1.NextCursor);

        // Chunk 2: resume strictly past the cursor → caches page 2 = last_page → END.
        var r2 = await Client.PostAsync($"{Url}?phase=list&limit=1&delayMs=0&afterId={b1.NextCursor}", null);
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
        var b2 = await r2.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal(1, b2!.Processed);
        Assert.Null(b2.NextCursor); // reached last_page → terminate, driver stops here

        // The beyond-end page 3 was NEVER fetched (anti-infinite-loop).
        Assert.DoesNotContain("species-list:3", Fixture.PerenualHttpStub.Received);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(2, await db.PerenualRawCache.CountAsync(c => c.Endpoint == "species-list"));
    }

    // ── phase=details ─────────────────────────────────────────────────────────

    [Fact]
    public async Task PhaseDetails_CachesVerbatim_RedactsKey_AndRecordsHtmlIdWithoutCrashing()
    {
        // Seed the list cache so the details phase enumerates ids 11 (real) and 99 (deleted/HTML).
        Fixture.PerenualHttpStub.SetList(1, ListPage(1, 11, 99));
        AuthAsAdmin();
        var listResp = await Client.PostAsync($"{Url}?phase=list&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, listResp.StatusCode);

        // id 11: real body carrying the test API key inside a care_guides URL — must
        // be scrubbed before it lands at rest.
        var detail11 = "{\"id\":11,\"scientific_name\":[\"Plant eleven\"],"
            + "\"care_guides\":\"https://perenual.com/api/species-care-guide-list?key=test-perenual-key&species_id=11\"}";
        Fixture.PerenualHttpStub.SetDetails(11, detail11);
        // id 99: deleted-id ≥8574 bug → 200 OK with an HTML error page.
        Fixture.PerenualHttpStub.SetDetailsHtml(99);

        var response = await Client.PostAsync($"{Url}?phase=details&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal("details", body!.Phase);
        Assert.Equal(1, body.Processed);     // id 11 stored
        Assert.Equal(1, body.HtmlSkipped);   // id 99 recorded, no crash
        Assert.Equal(0, body.Failures);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var real = await db.PerenualRawCache.SingleAsync(c => c.Endpoint == "species-details" && c.ResourceId == "11");
        Assert.Equal(200, real.HttpStatus);
        Assert.NotNull(real.RawJson);
        Assert.Contains("Plant eleven", real.RawJson);
        Assert.DoesNotContain("test-perenual-key", real.RawJson); // redacted
        // Derive the positive marker from the production redactor so the two layers
        // can't drift if the sentinel ever changes.
        Assert.Contains(PerenualKeyRedactor.Placeholder, real.RawJson);

        var html = await db.PerenualRawCache.SingleAsync(c => c.Endpoint == "species-details" && c.ResourceId == "99");
        Assert.Null(html.RawJson);          // no usable body kept
        Assert.Equal(0, html.HttpStatus);   // NoBody sentinel — not re-fetched next pass
    }

    [Fact]
    public async Task PhaseDetails_TransientFailure_WritesNoRow_AndIsCapturedOnRetry()
    {
        // ids 11,12,13 from the cached list. id 12 fails TRANSIENTLY (200 + malformed
        // JSON → JsonException → TransientFailure). SMA-94 invariant: NO skip row is
        // written for it and the cursor resumes BELOW it, so a later run still
        // captures it — a transient outage must never burn a permanent cache hole.
        Fixture.PerenualHttpStub.SetList(1, ListPage(1, 11, 12, 13));
        AuthAsAdmin();
        await Client.PostAsync($"{Url}?phase=list&delayMs=0", null);

        Fixture.PerenualHttpStub.SetDetails(11, "{\"id\":11}");
        Fixture.PerenualHttpStub.SetDetails(12, "{ this is not valid json", HttpStatusCode.OK); // transient
        Fixture.PerenualHttpStub.SetDetails(13, "{\"id\":13}");

        var r1 = await Client.PostAsync($"{Url}?phase=details&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);
        var b1 = await r1.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal(2, b1!.Processed);    // 11 + 13
        Assert.Equal(1, b1.Failures);      // 12 transient
        Assert.Equal(0, b1.HtmlSkipped);   // NOT a terminal no-body
        Assert.Equal("11", b1.NextCursor); // resume below the smallest transient id (12−1)

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            // No row of any kind for the transient id — not a permanent skip.
            Assert.False(await db.PerenualRawCache.AnyAsync(c => c.Endpoint == "species-details" && c.ResourceId == "12"));
            Assert.Equal(2, await db.PerenualRawCache.CountAsync(c => c.Endpoint == "species-details"));
        }

        // Retry from the resume cursor: id 12 now returns valid JSON → it IS captured.
        Fixture.PerenualHttpStub.SetDetails(12, "{\"id\":12}");
        var r2 = await Client.PostAsync($"{Url}?phase=details&delayMs=0&afterId={b1.NextCursor}", null);
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
        var b2 = await r2.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal(1, b2!.Processed);    // 12 captured (13 already cached → idempotent skip)
        Assert.Equal(0, b2.Failures);

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            Assert.True(await db.PerenualRawCache.AnyAsync(c => c.Endpoint == "species-details" && c.ResourceId == "12"));
        }
    }

    [Fact]
    public async Task PhaseDetails_Gap404_RecordedAsTerminalSkip_WithRealStatus_AndCursorAdvances()
    {
        // SMA-100 regression test for the catalogue-aspiration infinite loop. id 88 is
        // a GAP in Perenual's id space — /species/details/88 returns 404 (NOT the
        // 200+HTML deleted-id placeholder). It must be recorded as a TERMINAL skip
        // (RawJson null, real HttpStatus 404) so the cursor ADVANCES past it to id 99,
        // instead of pinning at 88 forever (the bug). The 404 row's real status keeps
        // it auditable as a gap vs the 200+HTML placeholder (status 0).
        Fixture.PerenualHttpStub.SetList(1, ListPage(1, 11, 88, 99));
        AuthAsAdmin();
        await Client.PostAsync($"{Url}?phase=list&delayMs=0", null);

        Fixture.PerenualHttpStub.SetDetails(11, "{\"id\":11}");
        Fixture.PerenualHttpStub.SetDetails(88, "{}", HttpStatusCode.NotFound); // id-space gap
        Fixture.PerenualHttpStub.SetDetails(99, "{\"id\":99}");

        var response = await Client.PostAsync($"{Url}?phase=details&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal(2, body!.Processed);     // 11 + 99 captured
        Assert.Equal(1, body.HtmlSkipped);    // 88 recorded as terminal skip
        Assert.Equal(0, body.Failures);       // a 404 is NOT a failure (no infinite retry)
        Assert.Equal("99", body.NextCursor);  // advanced PAST the gap, not pinned at 88
        Assert.Null(body.FailedIds);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var gap = await db.PerenualRawCache.SingleAsync(c => c.Endpoint == "species-details" && c.ResourceId == "88");
        Assert.Null(gap.RawJson);             // no usable body
        Assert.Equal(404, gap.HttpStatus);    // SMA-100: REAL status, not the NoBody sentinel 0
        Assert.True(await db.PerenualRawCache.AnyAsync(c => c.Endpoint == "species-details" && c.ResourceId == "11"));
        Assert.True(await db.PerenualRawCache.AnyAsync(c => c.Endpoint == "species-details" && c.ResourceId == "99"));
    }

    [Fact]
    public async Task PhaseDetails_PersistentTransient_SurfacesFailedIds_AndPinsCursor()
    {
        // SMA-100 circuit-breaker SERVER contract (the driver's 5-chunk stall guard
        // sits on top of this). A persistent 5xx on id 50 stays TRANSIENT: no row is
        // written, the cursor PINS at 49 (minTransientId−1) so the id is never
        // skipped, and the failed id is surfaced in FailedIds so the driver can name
        // the blocker when it aborts a stalled phase. (No PowerShell test harness
        // exists in-repo; the 5-chunk counter is exercised against this contract.)
        Fixture.PerenualHttpStub.SetList(1, ListPage(1, 11, 50, 60));
        AuthAsAdmin();
        await Client.PostAsync($"{Url}?phase=list&delayMs=0", null);

        Fixture.PerenualHttpStub.SetDetails(11, "{\"id\":11}");
        Fixture.PerenualHttpStub.SetDetails(50, "{}", HttpStatusCode.InternalServerError); // persistent 5xx
        Fixture.PerenualHttpStub.SetDetails(60, "{\"id\":60}");

        var response = await Client.PostAsync($"{Url}?phase=details&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal(2, body!.Processed);      // 11 + 60
        Assert.Equal(1, body.Failures);        // 50 transient
        Assert.Equal(0, body.HtmlSkipped);     // NOT terminal
        Assert.Equal("49", body.NextCursor);   // pinned below the transient id (50−1)
        Assert.NotNull(body.FailedIds);
        Assert.Equal(new[] { 50 }, body.FailedIds);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        // No skip row for the transient id — it stays re-fetchable.
        Assert.False(await db.PerenualRawCache.AnyAsync(c => c.Endpoint == "species-details" && c.ResourceId == "50"));
    }

    // ── phase=careguide ───────────────────────────────────────────────────────

    [Fact]
    public async Task PhaseCareGuide_CachesVerbatim()
    {
        Fixture.PerenualHttpStub.SetList(1, ListPage(lastPage: 1, ids: 11));
        AuthAsAdmin();
        await Client.PostAsync($"{Url}?phase=list&delayMs=0", null);

        var guide = "{\"data\":[{\"species_id\":11,\"section\":[{\"type\":\"watering\"}]}]}";
        Fixture.PerenualHttpStub.SetCareGuide(11, guide);

        var response = await Client.PostAsync($"{Url}?phase=careguide&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal("careguide", body!.Phase);
        Assert.Equal(1, body.Processed);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var row = await db.PerenualRawCache.SingleAsync(c => c.Endpoint == "care-guide" && c.ResourceId == "11");
        using var doc = JsonDocument.Parse(row.RawJson!);
        var entry = doc.RootElement.GetProperty("data")[0];
        Assert.Equal(11, entry.GetProperty("species_id").GetInt32());
        Assert.Equal("watering", entry.GetProperty("section")[0].GetProperty("type").GetString());
    }

    // ── idempotence ───────────────────────────────────────────────────────────

    [Fact]
    public async Task PhaseList_SecondRun_SkipsCached_UnlessForce()
    {
        Fixture.PerenualHttpStub.SetList(1, ListPage(lastPage: 1, ids: 11));
        AuthAsAdmin();

        var first = await Client.PostAsync($"{Url}?phase=list&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var firstBody = await first.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal(1, firstBody!.Processed);

        // Second run, same state: the already-cached page is skipped (idempotent).
        var second = await Client.PostAsync($"{Url}?phase=list&delayMs=0", null);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var secondBody = await second.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal(0, secondBody!.Processed);
        Assert.Equal(1, secondBody.Cached);

        // force=true re-fetches and overwrites in place — still one row.
        var forced = await Client.PostAsync($"{Url}?phase=list&delayMs=0&force=true", null);
        Assert.Equal(HttpStatusCode.OK, forced.StatusCode);
        var forcedBody = await forced.Content.ReadFromJsonAsync<CacheResp>();
        Assert.Equal(1, forcedBody!.Processed);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(1, await db.PerenualRawCache.CountAsync(c => c.Endpoint == "species-list"));
    }

    // SMA-33 admin gate helpers (mirror PerenualPestCatalogControllerTests).
    private void AuthAsAdmin()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId, Roles.Admin));
    }

    private void AuthAsNonAdmin()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }

    private record CacheResp(string Phase, int Processed, int Cached, int HtmlSkipped, int Failures, string? NextCursor, int[]? FailedIds = null);
}
