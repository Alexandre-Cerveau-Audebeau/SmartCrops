using System.Collections.Concurrent;
using System.Net;
using System.Text;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Test double for the <c>PerenualClient</c> typed <see cref="HttpClient"/>: a
/// programmable <see cref="HttpMessageHandler"/> registered as the client's
/// primary handler in <see cref="PostgresFixture"/>. The SMA-93
/// <c>PerenualRawCacheController</c> injects the concrete <c>PerenualClient</c>
/// (not a service interface), so the only seam to stub is the HTTP transport.
///
/// <para>Routes by request path to one of the three Perenual endpoints the cache
/// aspirates, keying canned responses by (kind, resourceId):
/// <list type="bullet">
///   <item><c>species-list</c> — keyed by the <c>page</c> query parameter.</item>
///   <item><c>species/details/{id}</c> — keyed by the trailing id path segment.</item>
///   <item><c>species-care-guide-list</c> — keyed by the <c>species_id</c> query.</item>
/// </list>
/// An unconfigured resource returns 404 so the client's documented null-on-miss
/// path is exercised. Configure an HTML 200 (<see cref="SetDetailsHtml"/>) to
/// reproduce the deleted-id ≥8574 bug.</para>
///
/// <para>Shared singleton across the integration collection — <c>Reset()</c> is
/// called per test by <c>IntegrationTestBase</c>.</para>
/// </summary>
public sealed class StubPerenualHttpHandler : HttpMessageHandler
{
    private readonly record struct Canned(HttpStatusCode Status, string MediaType, string Body);

    private readonly ConcurrentDictionary<string, Canned> _responses = new();

    /// <summary>Paths actually requested (kind:resourceId), in no guaranteed order.</summary>
    public ConcurrentBag<string> Received { get; } = new();

    private const string Json = "application/json";
    private const string Html = "text/html";

    public void SetList(int page, string body, HttpStatusCode status = HttpStatusCode.OK, string mediaType = Json)
        => _responses[Key("species-list", page.ToString())] = new Canned(status, mediaType, body);

    public void SetDetails(int id, string body, HttpStatusCode status = HttpStatusCode.OK, string mediaType = Json)
        => _responses[Key("species-details", id.ToString())] = new Canned(status, mediaType, body);

    /// <summary>Reproduces a deleted id ≥8574: HTTP 200 with an HTML error page body.</summary>
    public void SetDetailsHtml(int id, string html = "<!doctype html><title>not found</title>")
        => _responses[Key("species-details", id.ToString())] = new Canned(HttpStatusCode.OK, Html, html);

    public void SetCareGuide(int id, string body, HttpStatusCode status = HttpStatusCode.OK, string mediaType = Json)
        => _responses[Key("care-guide", id.ToString())] = new Canned(status, mediaType, body);

    public void Reset()
    {
        _responses.Clear();
        Received.Clear();
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var uri = request.RequestUri!;
        var path = uri.AbsolutePath;

        // Match on stable trailing segments rather than free substrings so a future
        // endpoint (e.g. species-list-v2) can't silently route to the wrong branch.
        // species/details/{id} keeps a Contains check because the id trails the segment.
        string kind;
        string resourceId;
        if (path.EndsWith("species-care-guide-list", StringComparison.OrdinalIgnoreCase))
        {
            kind = "care-guide";
            resourceId = QueryValue(uri, "species_id") ?? "";
        }
        else if (path.Contains("species/details/", StringComparison.OrdinalIgnoreCase))
        {
            kind = "species-details";
            resourceId = path.TrimEnd('/').Split('/')[^1];
        }
        else if (path.EndsWith("species-list", StringComparison.OrdinalIgnoreCase))
        {
            kind = "species-list";
            resourceId = QueryValue(uri, "page") ?? "";
        }
        else
        {
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }

        Received.Add(Key(kind, resourceId));

        if (!_responses.TryGetValue(Key(kind, resourceId), out var canned))
        {
            // Unconfigured resource → 404 (client maps to null/default — a miss).
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }

        var response = new HttpResponseMessage(canned.Status)
        {
            Content = new StringContent(canned.Body, Encoding.UTF8, canned.MediaType),
        };
        return Task.FromResult(response);
    }

    private static string Key(string kind, string resourceId) => $"{kind}:{resourceId}";

    private static string? QueryValue(Uri uri, string key)
    {
        foreach (var part in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = part.Split('=', 2);
            if (kv.Length == 2 && string.Equals(kv[0], key, StringComparison.Ordinal))
            {
                return Uri.UnescapeDataString(kv[1]);
            }
        }
        return null;
    }
}
