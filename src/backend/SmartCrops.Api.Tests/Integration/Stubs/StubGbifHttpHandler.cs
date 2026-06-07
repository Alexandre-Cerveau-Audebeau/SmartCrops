using System.Collections.Concurrent;
using System.Net;
using System.Text;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Test double for the <c>GbifClient</c> typed <see cref="HttpClient"/> (SMA-124):
/// a programmable <see cref="HttpMessageHandler"/> registered as the client's
/// primary handler in <see cref="PostgresFixture"/>. The
/// <c>PlantTranslationsController</c> injects the concrete <c>GbifClient</c> for the
/// <c>gbif-vernacular-backfill</c> endpoint, so the only seam to stub is the
/// HTTP transport.
///
/// <para>Routes <c>/v1/species/{taxonKey}/vernacularNames</c> by the taxon-key path
/// segment. An unconfigured taxon returns a valid empty page (HTTP 200,
/// <c>endOfRecords:true</c>) so the client yields an empty list and the controller
/// counts it as <c>NoFrVernacular</c>; configure a non-2xx status
/// (<see cref="SetVernacular"/>) to drive the <c>Failed</c> path. Shared singleton
/// across the integration collection — <c>Reset()</c> per test.</para>
/// </summary>
public sealed class StubGbifHttpHandler : HttpMessageHandler
{
    private readonly record struct Canned(HttpStatusCode Status, string Body);

    private readonly ConcurrentDictionary<int, Canned> _responses = new();

    /// <summary>Taxon keys actually requested, in no guaranteed order.</summary>
    public ConcurrentBag<int> Received { get; } = new();

    private const string EmptyPage = "{\"offset\":0,\"limit\":100,\"endOfRecords\":true,\"results\":[]}";

    /// <summary>Configure the vernacularNames body (and optional status) for a taxon.</summary>
    public void SetVernacular(int taxonKey, string body, HttpStatusCode status = HttpStatusCode.OK)
        => _responses[taxonKey] = new Canned(status, body);

    public void Reset()
    {
        _responses.Clear();
        Received.Clear();
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var segments = request.RequestUri!.AbsolutePath.TrimEnd('/').Split('/');
        // .../v1/species/{taxonKey}/vernacularNames → key is the second-to-last segment.
        if (segments.Length < 2
            || !segments[^1].Equals("vernacularNames", StringComparison.OrdinalIgnoreCase)
            || !int.TryParse(segments[^2], out var taxonKey))
        {
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }

        Received.Add(taxonKey);

        if (!_responses.TryGetValue(taxonKey, out var canned))
        {
            // Unconfigured taxon → valid empty page (no vernaculars, not a failure).
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(EmptyPage, Encoding.UTF8, "application/json"),
            });
        }

        return Task.FromResult(new HttpResponseMessage(canned.Status)
        {
            Content = new StringContent(canned.Body, Encoding.UTF8, "application/json"),
        });
    }
}
