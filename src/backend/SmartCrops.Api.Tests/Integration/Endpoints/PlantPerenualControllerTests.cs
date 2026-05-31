using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.Tests.Integration.Stubs;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.ExternalApis.Perenual;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for the Perenual admin enrichment endpoints. The
/// <see cref="SmartCrops.Core.Interfaces.IPlantPerenualEnrichmentService"/>
/// is stubbed at the DI layer (see <c>PostgresFixture</c>) so these tests
/// verify the ADR-0003 5-target dual-write contract (PlantPerenualData upsert
/// + PlantImage/PlantPest/PlantLongDescription delete-then-insert + PlantSource
/// upsert + Plant denormalisation, all in one transaction) without touching
/// Perenual over HTTP.
/// </summary>
public class PlantPerenualControllerTests : IntegrationTestBase
{
    public PlantPerenualControllerTests(PostgresFixture fixture) : base(fixture) { }

    // ── enrich/{plantId} ───────────────────────────────────────────────────

    [Fact]
    public async Task Enrich_NoAuth_Returns401()
    {
        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{Guid.NewGuid()}", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Enrich_NonExistentPlant_Returns404()
    {
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{Guid.NewGuid()}", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Enrich_WithExplicitPerenualId_BypassesResolverSearchPath()
    {
        // When the admin passes ?perenualId=X, ResolveByIdAsync is invoked
        // and the resolver's search/PickBestMatch chain is skipped — useful
        // for cultivars and reclassified species where the index lookup fails.
        var plantId = await SeedPlantAsync("Rosmarinus officinalis");
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 7094));
        AuthAsAnyUser();

        var response = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?perenualId=7094", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // ResolveByIdAsync was called, NOT ResolveAsync.
        Assert.Single(Fixture.PerenualStub.ReceivedIds);
        Assert.Equal(7094, Fixture.PerenualStub.ReceivedIds[0]);
        Assert.Empty(Fixture.PerenualStub.ReceivedNames);
    }

    [Fact]
    public async Task Enrich_WithoutPerenualId_UsesScientificNameResolverPath()
    {
        var plantId = await SeedPlantAsync("Aloe vera");
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 728));
        AuthAsAnyUser();

        var response = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Single(Fixture.PerenualStub.ReceivedNames);
        Assert.Equal("Aloe vera", Fixture.PerenualStub.ReceivedNames[0]);
        Assert.Empty(Fixture.PerenualStub.ReceivedIds);
    }

    /// <summary>
    /// Verify the issue #67 workaround end-to-end: when Perenual canonicalises
    /// server-side (e.g. requested 8759 ↦ response.id 8758), both
    /// <c>Plant.RequestedPerenualId</c> (denormalised) and
    /// <c>PlantPerenualData.RequestedPerenualId</c> (audit) record the
    /// originally-requested id so user-facing URLs can land on the correct page.
    /// </summary>
    [Fact]
    public async Task Enrich_PersistsRequestedPerenualIdDistinctFromCanonical()
    {
        // Exercises issue #67's workaround: when Perenual canonicalises an id
        // server-side (e.g. requested 8759 → response.id 8758), the audit
        // trail must record both — denormalised on Plant.RequestedPerenualId
        // for fast query and on PlantPerenualData.RequestedPerenualId for the
        // source-of-truth view.
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8758,
            requestedPerenualId: 8759,
            canonicalName: "Solanum lycopersicum"));
        AuthAsAnyUser();

        var response = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?perenualId=8759", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Equal(8759, plant.RequestedPerenualId);

        var perenualData = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);
        Assert.Equal(8758, perenualData.PerenualId);
        Assert.Equal(8759, perenualData.RequestedPerenualId);
    }

    /// <summary>
    /// SMA-71: the controller persists the redacted literal <c>/species/details</c>
    /// and care-guide bodies to <c>PlantPerenualData</c> (internal/audit), the
    /// literal preserves fields the mapped DTO drops (e.g. <c>soil</c>), and none
    /// of it leaks into the public detail DTO (gated-or-not, the columns are not
    /// part of <c>PlantPerenualDataDto</c> at all).
    /// </summary>
    [Fact]
    public async Task Enrich_PersistsRedactedLiteralCaptures_AndDoesNotExposeThemInDetailDto()
    {
        var plantId = await SeedPlantAsync("Aloe vera");
        // Pre-redacted literal carrying an unmapped field (`soil`) that the DTO
        // never captures — proves the loss-proof net actually preserves it.
        const string literal =
            "{\"id\":728,\"care_guides\":\"http://x?key=REDACTED\",\"soil\":[\"Well-drained\"]}";
        const string careGuide =
            "{\"data\":[{\"id\":1,\"section\":[{\"type\":\"watering\"}]}]}";
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 728) with
        {
            LiteralResponseJson = literal,
            CareGuideResponseJson = careGuide,
        });
        AuthAsAnyUser();

        var response = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?perenualId=728", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var perenualData = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);

        // Persisted (jsonb normalises formatting, so assert on parsed content).
        Assert.NotNull(perenualData.LiteralResponseJson);
        using (var litDoc = JsonDocument.Parse(perenualData.LiteralResponseJson!))
        {
            Assert.Equal(728, litDoc.RootElement.GetProperty("id").GetInt32());
            Assert.Equal("Well-drained", litDoc.RootElement.GetProperty("soil")[0].GetString());
        }
        Assert.NotNull(perenualData.CareGuideResponseJson);
        using (var cgDoc = JsonDocument.Parse(perenualData.CareGuideResponseJson!))
        {
            Assert.Equal(
                "watering",
                cgDoc.RootElement.GetProperty("data")[0].GetProperty("section")[0].GetProperty("type").GetString());
        }

        // Point 6: never surfaced in the public detail DTO. Drop the admin auth
        // so this asserts the genuinely-anonymous public surface.
        Client.DefaultRequestHeaders.Authorization = null;
        var detailJson = await Client.GetStringAsync($"/api/plants/{plantId}");
        Assert.DoesNotContain("literalResponseJson", detailJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("careGuideResponseJson", detailJson, StringComparison.OrdinalIgnoreCase);
        // The literal-only `soil` value must not appear anywhere in the DTO.
        Assert.DoesNotContain("Well-drained", detailJson, StringComparison.Ordinal);
    }

    /// <summary>
    /// SMA-71 R2 (loss-proof): a forced re-enrich whose fetch returns null
    /// literals (e.g. a transient care-guide miss) must PRESERVE the previously
    /// captured literals on the audit row — the update branch null-coalesces
    /// rather than wiping them.
    /// </summary>
    [Fact]
    public async Task Enrich_ForceReEnrichWithNullLiterals_PreservesPriorCaptures()
    {
        var plantId = await SeedPlantAsync("Aloe vera");
        const string literal = "{\"id\":728,\"soil\":[\"Well-drained\"]}";
        const string careGuide = "{\"data\":[{\"id\":1}]}";

        // First enrich captures both literals.
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 728) with
        {
            LiteralResponseJson = literal,
            CareGuideResponseJson = careGuide,
        });
        AuthAsAnyUser();
        var first = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?perenualId=728", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Forced re-enrich returns NULL literals — must not erase the prior ones.
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 728) with
        {
            LiteralResponseJson = null,
            CareGuideResponseJson = null,
        });
        var second = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?perenualId=728&force=true", null);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var perenualData = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);

        Assert.NotNull(perenualData.LiteralResponseJson);
        using (var doc = JsonDocument.Parse(perenualData.LiteralResponseJson!))
        {
            Assert.Equal("Well-drained", doc.RootElement.GetProperty("soil")[0].GetString());
        }
        Assert.NotNull(perenualData.CareGuideResponseJson);
        // Assert the CONTENT survived, not merely non-null — catches an accidental
        // replacement with a different non-null value (CR R2 hardening).
        using (var cgDoc = JsonDocument.Parse(perenualData.CareGuideResponseJson!))
        {
            Assert.Equal(1, cgDoc.RootElement.GetProperty("data")[0].GetProperty("id").GetInt32());
        }
    }

    /// <summary>
    /// Verifies the <c>??=</c> first-writer-wins contract on
    /// <c>RequestedPerenualId</c> (design decision #3 from Sprint 1.5 PR A
    /// audit): re-enriching with a different requestedPerenualId must NOT
    /// overwrite the original — the audit trail of "what we ASKED for first"
    /// is immutable. Pins this contract against accidental refactors
    /// (<c>??=</c> → <c>=</c>). The canonical <c>PerenualId</c>, by contrast,
    /// always reflects the latest response.
    /// </summary>
    [Fact]
    public async Task Enrich_RequestedPerenualId_FirstWriterWinsOnReEnrich()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum");
        AuthAsAnyUser();

        // (1) Initial enrich — requested 8759 canonicalises to 8758.
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8758,
            requestedPerenualId: 8759,
            canonicalName: "Solanum lycopersicum"));
        var first = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?perenualId=8759", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        await AssertRequestedIdAsync(plantId, expectedRequested: 8759, expectedCanonical: 8758);

        // (2) Re-enrich with the SAME requested id — idempotent, no change.
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8758,
            requestedPerenualId: 8759,
            canonicalName: "Solanum lycopersicum"));
        var second = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?perenualId=8759&force=true", null);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        await AssertRequestedIdAsync(plantId, expectedRequested: 8759, expectedCanonical: 8758);

        // (3) Re-enrich with a DIFFERENT requested id (9999 → canonical 10000).
        // RequestedPerenualId must stay 8759 (first-writer-wins); the canonical
        // PerenualId tracks the latest response (10000).
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 10000,
            requestedPerenualId: 9999,
            canonicalName: "Solanum lycopersicum"));
        var third = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?perenualId=9999&force=true", null);
        Assert.Equal(HttpStatusCode.OK, third.StatusCode);

        await AssertRequestedIdAsync(plantId, expectedRequested: 8759, expectedCanonical: 10000);
    }

    /// <summary>
    /// Fetch the plant + its Perenual data in a fresh scope and assert the
    /// requested id (immutable audit) and canonical id (latest response) on
    /// both the denormalised <c>Plant</c> column and the <c>PlantPerenualData</c>
    /// row. Used by the first-writer-wins test to re-read after each enrich.
    /// </summary>
    private async Task AssertRequestedIdAsync(Guid plantId, int expectedRequested, int expectedCanonical)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Equal(expectedRequested, plant.RequestedPerenualId);

        var data = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);
        Assert.Equal(expectedRequested, data.RequestedPerenualId);
        Assert.Equal(expectedCanonical, data.PerenualId);
    }

    [Fact]
    public async Task Enrich_Match_PerformsFullDualWrite()
    {
        var plantId = await SeedPlantAsync("Aloe vera");
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 728,
            cultivar: null,
            perenualType: "Herb",
            canonicalName: "Aloe vera",
            lifeCycle: PlantLifeCycle.Perennial,
            wateringNeed: PlantWateringNeed.Low,
            careLevel: PlantCareLevel.Easy,
            isIndoor: true,
            isDroughtTolerant: true,
            isMedicinal: true,
            hardinessMin: 9,
            hardinessMax: 11,
            images:
            [
                new PerenualImage("https://wasabi/aloe-default.jpg", "https://wasabi/aloe-thumb.jpg", "CC BY 4.0", null),
                new PerenualImage("https://wasabi/aloe-other.jpg", null, null, null),
            ],
            pests:
            [
                new PerenualPest("Mealybugs", PlantPestType.Insect),
                new PerenualPest("Root rot", PlantPestType.Disease),
            ],
            longDescriptionEn: "Succulent perennial used for medicinal gel."));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<MatchedDto>();
        Assert.NotNull(body);
        Assert.True(body!.Matched);
        Assert.Equal(728, body.PerenualId);
        Assert.Equal(2, body.ImagesAdded);
        Assert.Equal(2, body.PestsAdded);
        Assert.Equal(1, body.LongDescriptionsAdded);
        Assert.True(body.IsExactScientificMatch);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        // Plant: PerenualEnriched flag set, denormalized fields populated.
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.True(plant.EnrichmentStatus.HasFlag(EnrichmentStatus.PerenualEnriched));
        Assert.NotNull(plant.LastEnrichmentAt);
        Assert.Equal(PlantLifeCycle.Perennial, plant.LifeCycle);
        Assert.Equal(PlantWateringNeed.Low, plant.WateringNeedLevel);
        Assert.Equal(PlantCareLevel.Easy, plant.CareLevel);
        Assert.True(plant.IsIndoor);
        Assert.True(plant.IsDroughtTolerant);
        Assert.True(plant.IsMedicinal);
        Assert.Equal(9, plant.HardinessZoneMin);
        Assert.Equal(11, plant.HardinessZoneMax);

        // PlantPerenualData: upserted with cultivar/type/raw/HasSupremeData.
        var perenualData = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);
        Assert.Equal(728, perenualData.PerenualId);
        Assert.Equal("Herb", perenualData.PerenualType);
        Assert.Equal("v2", perenualData.ApiVersion);
        Assert.NotNull(perenualData.RawResponseJson);

        // PlantImage: 2 rows for Source=Perenual, first=Main, rest=Other.
        var images = await db.PlantImages
            .Where(i => i.PlantId == plantId && i.Source == PlantSourceType.Perenual)
            .OrderBy(i => i.Id)
            .ToListAsync();
        Assert.Equal(2, images.Count);
        Assert.Equal(PlantImageType.Main, images[0].ImageType);
        Assert.Equal(PlantImageType.Other, images[1].ImageType);
        Assert.Equal("CC BY 4.0", images[0].LicenseName);
        Assert.Equal("https://wasabi/aloe-thumb.jpg", images[0].ThumbnailUrl);

        // PlantPest: 2 rows with Source="perenual" + classified Type.
        var pests = await db.PlantPests.Where(p => p.PlantId == plantId).ToListAsync();
        Assert.Equal(2, pests.Count);
        Assert.All(pests, p => Assert.Equal("perenual", p.Source));
        Assert.Contains(pests, p => p.Name == "Mealybugs" && p.Type == PlantPestType.Insect);
        Assert.Contains(pests, p => p.Name == "Root rot" && p.Type == PlantPestType.Disease);

        // PlantLongDescription: 1 row, Language=en, SourceMethod=perenual.
        var descriptions = await db.PlantLongDescriptions
            .Where(d => d.PlantId == plantId)
            .ToListAsync();
        Assert.Single(descriptions);
        Assert.Equal("en", descriptions[0].Language);
        Assert.Equal("perenual", descriptions[0].SourceMethod);
        Assert.Contains("Succulent", descriptions[0].LongDescription);

        // PlantSource: Perenual row written with stringified PerenualId.
        var source = await db.PlantSources
            .SingleAsync(s => s.PlantId == plantId && s.SourceType == PlantSourceType.Perenual);
        Assert.Equal("728", source.ExternalId);
        Assert.Equal("https://perenual.com/api/v2/species/details/728", source.Url);
        Assert.NotNull(source.LastFetchedAt);
    }

    [Fact]
    public async Task Enrich_AlreadyEnriched_SkipsWithoutForce()
    {
        var plantId = await SeedPlantAsync("Aloe vera", alreadyPerenualEnriched: true);
        Fixture.PerenualStub.Enqueue(SampleMatch(728));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SkippedDto>();
        Assert.NotNull(body);
        Assert.True(body!.Skipped);
        Assert.Equal("AlreadyEnriched", body.Reason);
        // Stub was not invoked.
        Assert.Empty(Fixture.PerenualStub.ReceivedNames);
        Assert.Empty(Fixture.PerenualStub.ReceivedIds);
    }

    [Fact]
    public async Task Enrich_Force_BypassesAlreadyEnrichedShortcut()
    {
        var plantId = await SeedPlantAsync("Aloe vera", alreadyPerenualEnriched: true);
        Fixture.PerenualStub.Enqueue(SampleMatch(728));
        AuthAsAnyUser();

        var response = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?force=true", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<MatchedDto>();
        Assert.NotNull(body);
        Assert.Equal(728, body!.PerenualId);
        // Stub was invoked despite the prior PerenualEnriched flag.
        Assert.Single(Fixture.PerenualStub.ReceivedNames);
    }

    [Fact]
    public async Task Enrich_NoMatch_DoesNotWriteAnything()
    {
        var plantId = await SeedPlantAsync("Rosmarinus officinalis");
        Fixture.PerenualStub.EnqueueNoMatch();
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<NoMatchDto>();
        Assert.NotNull(body);
        Assert.False(body!.Matched);
        Assert.Equal("NONE", body.MatchType);
        Assert.Contains("Rosmarinus officinalis", body.Reason);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.False(plant.EnrichmentStatus.HasFlag(EnrichmentStatus.PerenualEnriched));

        Assert.Equal(0, await db.PlantPerenualData.CountAsync(d => d.PlantId == plantId));
        Assert.Equal(0, await db.PlantImages.CountAsync(
            i => i.PlantId == plantId && i.Source == PlantSourceType.Perenual));
        Assert.Equal(0, await db.PlantPests.CountAsync(p => p.PlantId == plantId));
        Assert.Equal(0, await db.PlantLongDescriptions.CountAsync(d => d.PlantId == plantId));
        Assert.Equal(0, await db.PlantSources.CountAsync(
            s => s.PlantId == plantId && s.SourceType == PlantSourceType.Perenual));
    }

    [Fact]
    public async Task Enrich_NullScalars_DoNotOverwriteExistingPlantValues()
    {
        // Plant precedence pattern (PR #59 r4 canonical contract): null result
        // values must not erase curated Plant scalars.
        var plantId = await SeedPlantAsync("Aloe vera", configure: p =>
        {
            p.LifeCycle = PlantLifeCycle.Annual;
            p.WateringNeedLevel = PlantWateringNeed.High;
            p.IsIndoor = false;
            p.HardinessZoneMin = 5;
        });
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 728,
            lifeCycle: null,
            wateringNeed: null,
            isIndoor: null,
            hardinessMin: null));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Equal(PlantLifeCycle.Annual, plant.LifeCycle);
        Assert.Equal(PlantWateringNeed.High, plant.WateringNeedLevel);
        Assert.False(plant.IsIndoor);
        Assert.Equal(5, plant.HardinessZoneMin);
    }

    /// <summary>
    /// Issue #71 regression: when the hardiness guard fires
    /// (<c>HardinessRejectedAsSuspect=true</c>), re-enrichment must SCRUB a
    /// corrupt hardiness value that was persisted before PR #70's guard
    /// existed — not preserve it. This is the documented exception to the
    /// null-coalesce contract: the plain
    /// <c>if (plant.X is null) plant.X = result.X;</c> rule would leave the
    /// stale (corrupt) value intact because it is non-null. Pins the scrub
    /// branch in <c>ApplyPlantDenormalisation</c> against accidental removal.
    /// </summary>
    [Fact]
    public async Task Enrich_HardinessGuardFiring_ScrubsExistingCorruptValues()
    {
        // Seed a plant carrying the corrupt min==max==2 value a pre-#70
        // enrichment would have persisted.
        var plantId = await SeedPlantAsync("Solanum lycopersicum", configure: p =>
        {
            p.HardinessZoneMin = 2;
            p.HardinessZoneMax = 2;
        });
        // Guard fires upstream: the result carries null hardiness AND the
        // rejection flag — mirroring the live PR #70 guard behaviour.
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8759,
            hardinessMin: null,
            hardinessMax: null,
            hardinessRejectedAsSuspect: true));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Null(plant.HardinessZoneMin);
        Assert.Null(plant.HardinessZoneMax);
    }

    /// <summary>
    /// Pin the sentinel-scoped scrub (issue #71, CodeRabbit round 1): when valid
    /// hardiness is set by another authoritative source (e.g. GBIF or Trefle),
    /// the Perenual guard's suspect-rejection must NOT destroy it — only
    /// sentinel-matching 2-2 values get scrubbed. This guards the ADR-0003
    /// "complementary, not authoritative" semantic for Perenual hardiness writes.
    /// </summary>
    [Fact]
    public async Task Enrich_HardinessGuardFiring_PreservesValidValuesFromOtherSources()
    {
        // Seed a plant with valid hardiness (simulating a prior GBIF/Trefle enrich).
        var plantId = await SeedPlantAsync("Solanum lycopersicum", configure: p =>
        {
            p.HardinessZoneMin = 5;
            p.HardinessZoneMax = 9;
        });
        // Guard fires: Perenual's current data is corrupt, but the persisted
        // value is valid and does NOT match the 2-2 sentinel.
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8759,
            hardinessMin: null,
            hardinessMax: null,
            hardinessRejectedAsSuspect: true));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Equal(5, plant.HardinessZoneMin);
        Assert.Equal(9, plant.HardinessZoneMax);
    }

    /// <summary>
    /// Issue #73: when the resolver flags a dangerous canonical-id mismatch
    /// (<c>response.id != requestedPerenualId</c>, likely a different species),
    /// the controller must SKIP every destructive wrong-species write — the four
    /// collection/source targets (images, pests, long-description, source URL)
    /// AND the payload-owned <c>EdibleParts</c> JSON overwrite (CodeRabbit round
    /// 2: it lives in <c>ApplyPlantDenormalisation</c> but is a destructive write,
    /// not gap-fill) — while still persisting the <c>PlantPerenualData</c> audit
    /// row and the null-coalesced scalar denormalisation. The response surfaces
    /// <c>CanonicalMismatchSkipped=true</c> and reports zero added rows
    /// (Finding B: counts reflect what was persisted).
    /// </summary>
    [Fact]
    public async Task Enrich_CanonicalMismatchDangerous_SkipsAllWrongSpeciesWrites()
    {
        // Intra-genus mismatch (the real tomato/dulcamara case): GBIF genus
        // "Solanum" matches the Perenual-derived genus, so the genus gate
        // (issue #75) PASSES and scalars/xData apply, while the destructive
        // collection writes stay skipped (issue #73).
        var plantId = await SeedPlantAsync("Solanum lycopersicum", configure: p => p.Genus = "Solanum");
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8758,                       // canonical (wrong species)
            requestedPerenualId: 8759,              // what we asked for (tomato)
            canonicalName: "Solanum dulcamara",     // same genus as the plant
            lifeCycle: PlantLifeCycle.Perennial,
            images:
            [
                new PerenualImage("https://wasabi/8758_dulcamara.jpg", null, null, null),
            ],
            pests: [new PerenualPest("Aphids", PlantPestType.Insect)],
            longDescriptionEn: "Wrong-species description.",
            // Wrong-species edible-parts payload — must NOT reach the read model.
            ediblePartsJson: "[\"fruit\"]",
            isCanonicalMismatchDangerous: true));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<MatchedDto>();
        Assert.NotNull(body);
        Assert.True(body!.CanonicalMismatchSkipped);
        // Finding B: reported counts reflect actual (zero) persistence.
        Assert.Equal(0, body.ImagesAdded);
        Assert.Equal(0, body.PestsAdded);
        Assert.Equal(0, body.LongDescriptionsAdded);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        // The destructive COLLECTION writes were skipped.
        Assert.Equal(0, await db.PlantImages.CountAsync(
            i => i.PlantId == plantId && i.Source == PlantSourceType.Perenual));
        Assert.Equal(0, await db.PlantPests.CountAsync(p => p.PlantId == plantId));
        Assert.Equal(0, await db.PlantLongDescriptions.CountAsync(d => d.PlantId == plantId));

        // D5 exception: the Perenual source IS written even on a mismatch, using
        // the REQUESTED id so the "View on Perenual" link lands on the right page.
        var source = await db.PlantSources.SingleAsync(
            s => s.PlantId == plantId && s.SourceType == PlantSourceType.Perenual);
        Assert.EndsWith("/species/details/8759", source.Url);

        // The payload-owned EdibleParts OVERWRITE is also skipped (CR round 2):
        // the wrong-species "[\"fruit\"]" payload must not reach the read model.
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Null(plant.EdibleParts);

        // Audit row + gap-fill scalars are still applied (genus validated).
        var perenualData = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);
        Assert.Equal(8758, perenualData.PerenualId);
        Assert.Equal(PlantLifeCycle.Perennial, plant.LifeCycle);
        Assert.Equal(8759, plant.RequestedPerenualId);
        Assert.True(plant.EnrichmentStatus.HasFlag(EnrichmentStatus.PerenualEnriched));
    }

    /// <summary>
    /// CR round 3 hardening: when a canonical-id mismatch fires, the skip must
    /// also PRESERVE an existing <c>EdibleParts</c> value set by another source
    /// (Manual / GBIF / Trefle / seed / prior Perenual enrich pre-mismatch).
    /// The companion test pins the "null stays null" branch; this one pins the
    /// "populated stays populated" branch. Together they pin the full preservation
    /// semantics of the skip (issue #73).
    /// </summary>
    [Fact]
    public async Task Enrich_CanonicalMismatchDangerous_PreservesExistingEdibleParts()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum", configure: p =>
        {
            p.EdibleParts = "[\"leaf\",\"root\"]"; // Prior value from another source
        });
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8758,
            requestedPerenualId: 8759,
            ediblePartsJson: "[\"fruit\"]", // Wrong-species payload — must NOT win
            isCanonicalMismatchDangerous: true));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);

        // Prior value preserved verbatim, wrong-species payload not applied.
        Assert.Equal("[\"leaf\",\"root\"]", plant.EdibleParts);
    }

    /// <summary>
    /// Issue #75 Étage 1: a CROSS-genus canonical mismatch (GBIF genus differs
    /// from the Perenual-derived genus) skips ALL scalar + xData gap-fill so a
    /// wrong-species payload can't seed the read model.
    /// </summary>
    [Fact]
    public async Task Enrich_GenusMismatch_SkipsScalarsAndXData()
    {
        var plantId = await SeedPlantAsync("Rosa canina", configure: p => p.Genus = "Rosa");
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8758,
            requestedPerenualId: 8759,
            canonicalName: "Solanum dulcamara",  // genus "Solanum" != "Rosa"
            lifeCycle: PlantLifeCycle.Perennial,
            xWateringBasedTempMinC: 18,
            isCanonicalMismatchDangerous: true));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        var perenualData = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);

        Assert.Null(plant.LifeCycle);                       // scalar skipped
        Assert.Null(perenualData.XWateringBasedTempMinC);   // xData skipped
        Assert.True(plant.EnrichmentStatus.HasFlag(EnrichmentStatus.PerenualEnriched));
    }

    /// <summary>
    /// Issue #75 Étage 1: an INTRA-genus canonical mismatch (same genus,
    /// different species — the tomato/dulcamara case) PASSES the genus gate, so
    /// xData is persisted on PlantPerenualData while destructive collection
    /// writes stay skipped.
    /// </summary>
    [Fact]
    public async Task Enrich_GenusMatch_OnCanonicalMismatch_PersistsXData()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum", configure: p => p.Genus = "Solanum");
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8758,
            requestedPerenualId: 8759,
            canonicalName: "Solanum dulcamara",  // genus "Solanum" == "Solanum"
            xWateringBasedTempMinC: 18,
            xWateringBasedTempMaxC: 24,
            xWateringPhMin: 6.0m,
            isCanonicalMismatchDangerous: true));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var perenualData = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);

        Assert.Equal(18, perenualData.XWateringBasedTempMinC);
        Assert.Equal(24, perenualData.XWateringBasedTempMaxC);
        Assert.Equal(6.0m, perenualData.XWateringPhMin);
        // Destructive collections still skipped on the mismatch.
        Assert.Equal(0, await db.PlantPests.CountAsync(p => p.PlantId == plantId));
    }

    /// <summary>
    /// Issue #75 Étage 2: the admin <c>overrideMismatch=true</c> escape hatch
    /// bypasses the genus gate, applying scalars + xData even on a cross-genus
    /// mismatch. Destructive collection writes remain skipped regardless.
    /// </summary>
    [Fact]
    public async Task Enrich_OverrideMismatch_AppliesScalarsAndXDataRegardlessOfGenus()
    {
        var plantId = await SeedPlantAsync("Rosa canina", configure: p => p.Genus = "Rosa");
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8758,
            requestedPerenualId: 8759,
            canonicalName: "Solanum lycopersicum",  // cross-genus
            lifeCycle: PlantLifeCycle.Perennial,
            xWateringBasedTempMinC: 18,
            images: [new PerenualImage("https://wasabi/x.jpg", null, null, null)],
            isCanonicalMismatchDangerous: true));
        AuthAsAnyUser();

        var response = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?overrideMismatch=true", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        var perenualData = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);

        Assert.Equal(PlantLifeCycle.Perennial, plant.LifeCycle);      // scalar applied despite cross-genus
        Assert.Equal(18, perenualData.XWateringBasedTempMinC);        // xData applied
        // Destructive collections STILL skipped — override only frees scalars/xData.
        Assert.Equal(0, await db.PlantImages.CountAsync(
            i => i.PlantId == plantId && i.Source == PlantSourceType.Perenual));
    }

    /// <summary>
    /// Issue #75 Étage 1 edge case: when Plant.Genus is null (never GBIF-enriched)
    /// the genus gate can't validate, so it conservatively skips scalars + xData.
    /// </summary>
    [Fact]
    public async Task Enrich_PlantGenusNull_ConservativeSkipOnMismatch()
    {
        var plantId = await SeedPlantAsync("Solanum lycopersicum"); // Genus left null
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 8758,
            requestedPerenualId: 8759,
            canonicalName: "Solanum dulcamara",
            lifeCycle: PlantLifeCycle.Perennial,
            xWateringBasedTempMinC: 18,
            isCanonicalMismatchDangerous: true));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        var perenualData = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);

        Assert.Null(plant.LifeCycle);
        Assert.Null(perenualData.XWateringBasedTempMinC);
    }

    /// <summary>
    /// Happy path (no mismatch): all 12 xData fields are persisted on
    /// PlantPerenualData via the gap-fill writes (genus gate not engaged).
    /// </summary>
    [Fact]
    public async Task Enrich_HappyPath_PersistsAllTwelveXDataFields()
    {
        var plantId = await SeedPlantAsync("Aloe vera");
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 728,
            xWateringBasedTempMinC: 18,
            xWateringBasedTempMaxC: 24,
            xWateringPhMin: 6.0m,
            xWateringPhMax: 8.0m,
            xSunlightHoursMin: 4,
            xSunlightHoursMax: 6,
            xTemperatureToleranceMinC: -10,
            xTemperatureToleranceMaxC: 38,
            xPlantSpacingValue: 18,
            xPlantSpacingUnit: "inches",
            xWateringQualityJson: "[\"Rainwater\"]",
            xWateringPeriodJson: "[\"Morning\"]",
            isCanonicalMismatchDangerous: false));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var pd = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);

        Assert.Equal(18, pd.XWateringBasedTempMinC);
        Assert.Equal(24, pd.XWateringBasedTempMaxC);
        Assert.Equal(6.0m, pd.XWateringPhMin);
        Assert.Equal(8.0m, pd.XWateringPhMax);
        Assert.Equal(4, pd.XSunlightHoursMin);
        Assert.Equal(6, pd.XSunlightHoursMax);
        Assert.Equal(-10, pd.XTemperatureToleranceMinC);
        Assert.Equal(38, pd.XTemperatureToleranceMaxC);
        Assert.Equal(18, pd.XPlantSpacingValue);
        Assert.Equal("inches", pd.XPlantSpacingUnit);
        Assert.Equal("[\"Rainwater\"]", pd.XWateringQualityJson);
        Assert.Equal("[\"Morning\"]", pd.XWateringPeriodJson);
    }

    /// <summary>
    /// Regression for CR PR #76 r2 (R2-2): xData OVERWRITES on re-enrich rather
    /// than first-write-wins (??=). PlantPerenualData is Perenual-exclusive, so
    /// a force=true re-enrich must refresh stale xData with the latest upstream
    /// values (data drift observed in Phase 4 smoke).
    /// </summary>
    [Fact]
    public async Task Enrich_ForceTrue_RefreshesXData_NotFirstWriteWins()
    {
        // Seed a plant already carrying STALE xData on its PerenualData row.
        var plantId = await SeedPlantAsync("Aloe vera", alreadyPerenualEnriched: true, configure: p =>
        {
            p.Genus = "Aloe";
            p.PerenualData = new PlantPerenualData
            {
                PerenualId = 728,
                HasSupremeData = true,
                XWateringPhMin = 5.0m,          // stale
                XWateringPhMax = 7.0m,          // stale
                XWateringBasedTempMinC = 15,    // stale
                XWateringBasedTempMaxC = 22,    // stale
                LastSyncAt = DateTime.UtcNow,
            };
        });
        // Re-enrich returns FRESH xData (canonical match → genus gate not engaged).
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 728,
            canonicalName: "Aloe vera",
            xWateringPhMin: 6.0m,
            xWateringPhMax: 8.0m,
            xWateringBasedTempMinC: 18,
            xWateringBasedTempMaxC: 24));
        AuthAsAnyUser();

        var response = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?perenualId=728&force=true", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var pd = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);

        // Fresh values applied (would stay stale under ??= first-write-wins).
        Assert.Equal(6.0m, pd.XWateringPhMin);
        Assert.Equal(8.0m, pd.XWateringPhMax);
        Assert.Equal(18, pd.XWateringBasedTempMinC);
        Assert.Equal(24, pd.XWateringBasedTempMaxC);
    }

    // ── queryable-columns/backfill (SMA-71) ────────────────────────────────

    [Fact]
    public async Task BackfillQueryableColumns_NoAuth_Returns401()
    {
        var response = await Client.PostAsync(
            "/api/admin/perenual/queryable-columns/backfill", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task BackfillQueryableColumns_ReparsesLiteral_PopulatesColumns_AndIsIdempotent()
    {
        // A row whose stored literal carries the four arrays but whose columns
        // are still null (the state of all 534 rows before this PR). No API stub
        // is enqueued — the endpoint must reprocess the LITERAL, not fetch.
        const string literal = """
            {"id":42,"plant_anatomy":[{"part":"leaves","color":["green"]}],"attracts":["Butterflies"],"soil":["Loamy Humus"],"other_name":["Wild Ginger","Snakeroot"]}
            """;
        var plantId = await SeedPlantAsync("Asarum canadense", alreadyPerenualEnriched: true, configure: p =>
        {
            p.PerenualData = new PlantPerenualData
            {
                PerenualId = 42,
                LiteralResponseJson = literal,
                LastSyncAt = DateTime.UtcNow,
                // PlantAnatomyJson/AttractsJson/SoilJson/OtherNamesJson left null.
            };
        });
        AuthAsAnyUser();

        var response = await Client.PostAsync(
            "/api/admin/perenual/queryable-columns/backfill", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BackfillResponse>();
        Assert.Equal(1, body!.Candidates);
        Assert.Equal(1, body.Processed);
        Assert.Equal(1, body.Populated);
        Assert.Equal(0, body.Failures);

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var pd = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);
            // jsonb canonicalises with spaces on read (e.g. {"part": "leaves"});
            // compare semantically by re-compacting both sides.
            Assert.Equal("[{\"part\":\"leaves\",\"color\":[\"green\"]}]", Compact(pd.PlantAnatomyJson));
            Assert.Equal("[\"Butterflies\"]", Compact(pd.AttractsJson));
            Assert.Equal("[\"Loamy Humus\"]", Compact(pd.SoilJson));
            Assert.Equal("[\"Wild Ginger\",\"Snakeroot\"]", Compact(pd.OtherNamesJson));
        }

        // Idempotent: a second run recomputes the identical values from the
        // unchanged literal — same counts, same columns.
        var second = await Client.PostAsync(
            "/api/admin/perenual/queryable-columns/backfill", null);
        var secondBody = await second.Content.ReadFromJsonAsync<BackfillResponse>();
        Assert.Equal(1, secondBody!.Processed);
        Assert.Equal(1, secondBody.Populated);

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var pd = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);
            Assert.Equal("[\"Butterflies\"]", Compact(pd.AttractsJson));
        }
    }

    // Re-compact a jsonb value (PostgreSQL stores/returns it space-normalised)
    // so assertions compare JSON content, not jsonb's pretty formatting.
    private static string? Compact(string? json)
        => json is null ? null : JsonSerializer.Serialize(JsonDocument.Parse(json).RootElement);

    [Fact]
    public async Task BackfillQueryableColumns_EmptyArraysInLiteral_LeavesColumnsNull()
    {
        // Empty upstream arrays (the majority of rows) → columns stay null;
        // the row still counts as processed, just not populated.
        const string literal = """
            {"id":7,"plant_anatomy":[],"attracts":[],"soil":[]}
            """;
        var plantId = await SeedPlantAsync("Empty arrays", alreadyPerenualEnriched: true, configure: p =>
        {
            p.PerenualData = new PlantPerenualData
            {
                PerenualId = 7,
                LiteralResponseJson = literal,
                LastSyncAt = DateTime.UtcNow,
            };
        });
        AuthAsAnyUser();

        var response = await Client.PostAsync(
            "/api/admin/perenual/queryable-columns/backfill", null);
        var body = await response.Content.ReadFromJsonAsync<BackfillResponse>();
        Assert.Equal(1, body!.Processed);
        Assert.Equal(0, body.Populated);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var pd = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);
        Assert.Null(pd.PlantAnatomyJson);
        Assert.Null(pd.AttractsJson);
        Assert.Null(pd.SoilJson);
        Assert.Null(pd.OtherNamesJson);
    }

    private record BackfillResponse(int Candidates, int Processed, int Populated, int Failures);

    /// <summary>
    /// Issue #77: after dropping the unique constraint on PerenualId, two
    /// distinct plants that both canonicalize to the same Perenual id (e.g. via
    /// the upstream off-by-one bug ≥8574) can both persist their
    /// <c>PlantPerenualData</c> audit rows without a 23505 unique-violation 500.
    /// </summary>
    [Fact]
    public async Task EnrichTwoPlants_SameCanonicalPerenualId_BothPersist()
    {
        // Plant A → canonical id 8758.
        var plantAId = await SeedPlantAsync("Solanum lycopersicum", configure: p => p.Genus = "Solanum");
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 8758, canonicalName: "Solanum lycopersicum"));
        AuthAsAnyUser();
        var respA = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantAId}?perenualId=8758&force=true", null);
        Assert.Equal(HttpStatusCode.OK, respA.StatusCode);

        // Plant B → a DIFFERENT plant resolving to the SAME canonical id 8758.
        var plantBId = await SeedPlantAsync("Solanum melongena", configure: p => p.Genus = "Solanum");
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 8758, canonicalName: "Solanum lycopersicum"));
        var respB = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantBId}?perenualId=8758&force=true", null);

        // Before #77 this second enrich 500'd (23505). Now both audit rows coexist.
        Assert.Equal(HttpStatusCode.OK, respB.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var ownerPlantIds = await db.PlantPerenualData
            .Where(d => d.PerenualId == 8758)
            .Select(d => d.PlantId)
            .ToListAsync();
        Assert.Equal(2, ownerPlantIds.Count);
        Assert.Contains(plantAId, ownerPlantIds);
        Assert.Contains(plantBId, ownerPlantIds);
    }

    /// <summary>
    /// Happy-path counterpart to the mismatch test: when the requested and
    /// canonical ids agree, all dual-write targets persist normally and
    /// <c>CanonicalMismatchSkipped</c> is false.
    /// </summary>
    [Fact]
    public async Task Enrich_CanonicalIdMatch_PersistsAllDualWrites()
    {
        var plantId = await SeedPlantAsync("Aloe vera");
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 728,
            requestedPerenualId: 728,    // matches → no mismatch
            images: [new PerenualImage("https://wasabi/aloe.jpg", null, null, null)],
            pests: [new PerenualPest("Mealybugs", PlantPestType.Insect)],
            longDescriptionEn: "Correct species description.",
            ediblePartsJson: "[\"leaf\"]",
            isCanonicalMismatchDangerous: false));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<MatchedDto>();
        Assert.NotNull(body);
        Assert.False(body!.CanonicalMismatchSkipped);
        Assert.Equal(1, body.ImagesAdded);
        Assert.Equal(1, body.PestsAdded);
        Assert.Equal(1, body.LongDescriptionsAdded);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.Equal(1, await db.PlantImages.CountAsync(
            i => i.PlantId == plantId && i.Source == PlantSourceType.Perenual));
        Assert.Equal(1, await db.PlantPests.CountAsync(p => p.PlantId == plantId));
        Assert.Equal(1, await db.PlantLongDescriptions.CountAsync(d => d.PlantId == plantId));
        Assert.Equal(1, await db.PlantSources.CountAsync(
            s => s.PlantId == plantId && s.SourceType == PlantSourceType.Perenual));
        // Happy path: the payload-owned EdibleParts overwrite is applied normally.
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.Equal("[\"leaf\"]", plant.EdibleParts);
    }

    [Fact]
    public async Task Enrich_PreservesTrefleSourcedImages_OnReplacePerenualImages()
    {
        // CRITICAL cross-source isolation contract: the delete-then-insert
        // filter on Source = Perenual must not touch images from other sources.
        var plantId = await SeedPlantAsync("Aloe vera");

        // Seed a pre-existing Trefle image — must survive the Perenual enrichment.
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            db.PlantImages.Add(new PlantImage
            {
                PlantId = plantId,
                Url = "https://trefle/flower.jpg",
                ImageType = PlantImageType.Flower,
                Source = PlantSourceType.Trefle,
            });
            await db.SaveChangesAsync();
        }

        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 728,
            images: [new PerenualImage("https://wasabi/aloe.jpg", null, null, null)]));
        AuthAsAnyUser();

        await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);

        using var scope2 = CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var images = await db2.PlantImages
            .Where(i => i.PlantId == plantId)
            .OrderBy(i => i.Source)
            .ToListAsync();

        Assert.Equal(2, images.Count);
        Assert.Contains(images, i => i.Source == PlantSourceType.Trefle && i.Url == "https://trefle/flower.jpg");
        Assert.Contains(images, i => i.Source == PlantSourceType.Perenual && i.Url == "https://wasabi/aloe.jpg");
    }

    [Fact]
    public async Task Enrich_PreservesOtherLanguageDescriptions_OverwritesEnglish()
    {
        // Schema enforces a unique (PlantId, Language) index — only ONE
        // description per language per plant. The Perenual ETL therefore
        // OVERWRITES the existing English description (regardless of its
        // prior SourceMethod) but other-language descriptions survive
        // untouched. This is the documented contract on
        // ReplacePerenualLongDescriptionAsync.
        var plantId = await SeedPlantAsync("Aloe vera");

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            db.PlantLongDescriptions.Add(new PlantLongDescription
            {
                PlantId = plantId,
                Language = "fr",
                LongDescription = "Description française manuelle",
                SourceMethod = "manual",
            });
            db.PlantLongDescriptions.Add(new PlantLongDescription
            {
                PlantId = plantId,
                Language = "en",
                LongDescription = "Manual English description",
                SourceMethod = "manual",
            });
            await db.SaveChangesAsync();
        }

        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 728,
            longDescriptionEn: "Perenual English description"));
        AuthAsAnyUser();

        await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);

        using var scope2 = CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var descriptions = await db2.PlantLongDescriptions
            .Where(d => d.PlantId == plantId)
            .ToListAsync();

        Assert.Equal(2, descriptions.Count);
        // Non-English survives.
        Assert.Contains(descriptions, d => d.Language == "fr"
            && d.SourceMethod == "manual"
            && d.LongDescription == "Description française manuelle");
        // English is owned by Perenual after enrichment.
        Assert.Contains(descriptions, d => d.Language == "en"
            && d.SourceMethod == "perenual"
            && d.LongDescription == "Perenual English description");
    }

    [Fact]
    public async Task Enrich_Force_UpsertsPerenualDataAndSourceWithoutDuplicating()
    {
        var plantId = await SeedPlantAsync("Aloe vera");
        Fixture.PerenualStub.Enqueue(SampleMatch(728));
        AuthAsAnyUser();

        var firstResponse = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        await Task.Delay(15); // LastFetchedAt observably newer on re-enrichment

        Fixture.PerenualStub.Enqueue(SampleMatch(99999));
        var response = await Client.PostAsync(
            $"/api/admin/perenual/enrich/{plantId}?force=true", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var sources = await db.PlantSources
            .Where(s => s.PlantId == plantId && s.SourceType == PlantSourceType.Perenual)
            .ToListAsync();
        Assert.Single(sources);
        Assert.Equal("99999", sources[0].ExternalId);

        Assert.Equal(1, await db.PlantPerenualData.CountAsync(d => d.PlantId == plantId));
    }

    [Fact]
    public async Task Enrich_LongPruningMonths_PersistsWithoutVarcharOverflow()
    {
        // Regression for the PR 2b batch-1 run failure on Spinacia oleracea
        // (Perenual id 7468): the original varchar(200) cap on
        // PlantPerenualData.PruningMonths rejected long upstream lists with a
        // 22001 overflow, rolling back the entire enrichment transaction.
        // After widening the column to text, even a heavily-padded value
        // persists end-to-end and the PerenualEnriched flag lands. The
        // resolver's order-preserving dedupe (PerenualResolverTests covers it)
        // means production callers won't usually send strings this long, but
        // the schema must still accept them defensively.
        var plantId = await SeedPlantAsync("Spinacia oleracea");
        // ~220 chars: longer than the removed varchar(200) cap, well within
        // PostgreSQL text limits.
        var longPruningMonths = string.Join(",", Enumerable.Repeat("September", 22));
        Assert.True(longPruningMonths.Length > 200);
        Fixture.PerenualStub.Enqueue(SampleMatch(
            perenualId: 7468,
            canonicalName: "Spinacia oleracea",
            pruningMonths: longPruningMonths));
        AuthAsAnyUser();

        var response = await Client.PostAsync($"/api/admin/perenual/enrich/{plantId}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        Assert.True(plant.EnrichmentStatus.HasFlag(EnrichmentStatus.PerenualEnriched));
        var perenualData = await db.PlantPerenualData.SingleAsync(d => d.PlantId == plantId);
        Assert.Equal(longPruningMonths, perenualData.PruningMonths);
    }

    // ── enrich-all ────────────────────────────────────────────────────────

    [Fact]
    public async Task EnrichAll_SkipsAlreadyEnriched_ByDefault()
    {
        await SeedPlantAsync("Aloe vera", alreadyPerenualEnriched: true);
        await SeedPlantAsync("Solanum lycopersicum");

        Fixture.PerenualStub.Enqueue(SampleMatch(8759));
        AuthAsAnyUser();

        var response = await Client.PostAsync("/api/admin/perenual/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body);
        Assert.Equal(1, body!.Total);
        Assert.Equal(1, body.Matched);
        Assert.Equal(0, body.Skipped);

        var seen = Fixture.PerenualStub.ReceivedNames;
        Assert.Single(seen);
        Assert.Equal("Solanum lycopersicum", seen[0]);
    }

    [Fact]
    public async Task EnrichAll_MixedOutcomes_CountedCorrectly()
    {
        await SeedPlantAsync("Aloe vera");
        await SeedPlantAsync("Plantus inventicus");
        await SeedPlantAsync("Solanum lycopersicum");

        Fixture.PerenualStub.Enqueue(SampleMatch(1));
        Fixture.PerenualStub.EnqueueNoMatch();
        Fixture.PerenualStub.Enqueue(SampleMatch(2));
        AuthAsAnyUser();

        var response = await Client.PostAsync("/api/admin/perenual/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body);
        Assert.Equal(3, body!.Total);
        Assert.Equal(2, body.Matched);
        Assert.Equal(1, body.NotMatched);
        Assert.Equal(0, body.Skipped);
        Assert.Equal(0, body.Failed);
    }

    [Fact]
    public async Task EnrichAll_WithLimit_RespectsCursorAndReportsNextAfterId()
    {
        // Smoke for the PR 2a-2 r2 cursor contract on this controller (full
        // coverage lives on PlantTaxonomyController -- the three endpoints
        // are symmetric).
        await SeedPlantAsync("Aloe vera");
        await SeedPlantAsync("Solanum lycopersicum");
        await SeedPlantAsync("Daucus carota");

        Fixture.PerenualStub.Enqueue(SampleMatch(1));
        Fixture.PerenualStub.Enqueue(SampleMatch(2));
        AuthAsAnyUser();

        var response = await Client.PostAsync("/api/admin/perenual/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body);
        Assert.Equal(2, body!.Total);
        Assert.Equal(2, body.Matched);
        Assert.Equal(1, body.NotEnrichedRemaining);
        Assert.NotNull(body.NextAfterId);

        // Second chunk picks up via the cursor and processes the tail.
        Fixture.PerenualStub.Enqueue(SampleMatch(3));
        var chunk2 = await Client.PostAsync(
            $"/api/admin/perenual/enrich-all?limit=2&afterId={body.NextAfterId}", null);
        Assert.Equal(HttpStatusCode.OK, chunk2.StatusCode);
        var body2 = await chunk2.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body2);
        Assert.Equal(1, body2!.Total);
        Assert.Equal(0, body2.NotEnrichedRemaining);
    }

    [Fact]
    public async Task EnrichAll_UnmatchableFrontBlock_StillReachesTail()
    {
        // Replica of the PlantTaxonomyControllerTests regression (CR r2 B-5):
        // pins the seek-cursor contract on the Perenual controller against
        // symmetry drift. A front block of unmatchable plants must NOT stall
        // the cursor; chunk 2 with the advanced afterId must reach the tail.
        await SeedPlantAsync("Perenual-front one");
        await SeedPlantAsync("Perenual-front two");
        await SeedPlantAsync("Perenual-front three");
        await SeedPlantAsync("Perenual-front four");

        // FIFO stub. EnrichAll iterates in OrderBy(Id), so the first two see
        // NoMatch and the last two see Match.
        Fixture.PerenualStub.EnqueueNoMatch();
        Fixture.PerenualStub.EnqueueNoMatch();
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 9201));
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 9202));
        AuthAsAnyUser();

        var chunk1 = await Client.PostAsync("/api/admin/perenual/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, chunk1.StatusCode);
        var body1 = await chunk1.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body1);
        Assert.Equal(2, body1!.Total);
        Assert.Equal(0, body1.Matched);
        Assert.Equal(2, body1.NotMatched);
        Assert.NotNull(body1.NextAfterId);
        // Critical: remaining did NOT decrease (4 -> 4) -- the symptom the
        // old stalled guard tripped on. The cursor proceeds anyway.
        Assert.Equal(4, body1.NotEnrichedRemaining);

        var chunk2 = await Client.PostAsync(
            $"/api/admin/perenual/enrich-all?limit=2&afterId={body1.NextAfterId}", null);
        Assert.Equal(HttpStatusCode.OK, chunk2.StatusCode);
        var body2 = await chunk2.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body2);
        Assert.Equal(2, body2!.Total);
        Assert.Equal(2, body2.Matched);
        Assert.Equal(2, body2.NotEnrichedRemaining);

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var tailFlagged = await db.Plants
            .Where(p => p.ScientificName.StartsWith("Perenual-front "))
            .OrderBy(p => p.Id)
            .Skip(2)
            .CountAsync(p => (p.EnrichmentStatus & EnrichmentStatus.PerenualEnriched) != 0);
        Assert.Equal(2, tailFlagged);
    }

    [Fact]
    public async Task EnrichAll_FailedPlant_RemainsUnflagged_RetriedOnFreshRun()
    {
        // Replica of the PlantTaxonomyControllerTests regression (CR r2 B-5):
        // pins the failure model on the Perenual controller. The cursor
        // advances PAST a failed plant within a single run; the fresh re-run
        // (no state file) picks it up at the head of the remaining set.
        await SeedPlantAsync("Perenual-failed alpha");
        await SeedPlantAsync("Perenual-failed beta");

        Guid pSmallerId;
        Guid pLargerId;
        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var ordered = await db.Plants
                .Where(p => p.ScientificName.StartsWith("Perenual-failed "))
                .OrderBy(p => p.Id)
                .Select(p => p.Id)
                .ToListAsync();
            pSmallerId = ordered[0];
            pLargerId = ordered[1];
        }

        Fixture.PerenualStub.EnqueueFailure(new InvalidOperationException("transient upstream blip"));
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 9300));
        AuthAsAnyUser();

        var chunk1 = await Client.PostAsync("/api/admin/perenual/enrich-all?limit=2", null);
        Assert.Equal(HttpStatusCode.OK, chunk1.StatusCode);
        var body1 = await chunk1.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body1);
        Assert.Equal(2, body1!.Total);
        Assert.Equal(1, body1.Matched);
        Assert.Equal(1, body1.Failed);
        Assert.Equal(pLargerId, body1.NextAfterId);
        Assert.Equal(1, body1.NotEnrichedRemaining);

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var pSmaller = await db.Plants.SingleAsync(p => p.Id == pSmallerId);
            var pLarger = await db.Plants.SingleAsync(p => p.Id == pLargerId);
            Assert.False(pSmaller.EnrichmentStatus.HasFlag(EnrichmentStatus.PerenualEnriched));
            Assert.True(pLarger.EnrichmentStatus.HasFlag(EnrichmentStatus.PerenualEnriched));
        }

        // Fresh run: no afterId, the failed plant is still in !PerenualEnriched.
        Fixture.PerenualStub.Enqueue(SampleMatch(perenualId: 9301));

        var freshRun = await Client.PostAsync("/api/admin/perenual/enrich-all", null);
        Assert.Equal(HttpStatusCode.OK, freshRun.StatusCode);
        var body2 = await freshRun.Content.ReadFromJsonAsync<EnrichAllDto>();
        Assert.NotNull(body2);
        Assert.Equal(1, body2!.Total);
        Assert.Equal(1, body2.Matched);
        Assert.Equal(0, body2.Failed);
        Assert.Equal(0, body2.NotEnrichedRemaining);

        using (var scope = CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var pSmaller = await db.Plants.SingleAsync(p => p.Id == pSmallerId);
            Assert.True(pSmaller.EnrichmentStatus.HasFlag(EnrichmentStatus.PerenualEnriched));
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private async Task<Guid> SeedPlantAsync(
        string scientificName,
        bool alreadyPerenualEnriched = false,
        Action<Plant>? configure = null)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = scientificName,
            PlantTypeId = 1,
            EnrichmentStatus = alreadyPerenualEnriched
                ? EnrichmentStatus.Manual | EnrichmentStatus.PerenualEnriched
                : EnrichmentStatus.Manual,
        };
        configure?.Invoke(plant);
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }

    private void AuthAsAnyUser()
    {
        var userId = $"u-{Guid.NewGuid():N}";
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));
    }

    private static PerenualEnrichmentResult SampleMatch(
        int perenualId,
        string? cultivar = null,
        string? perenualType = "Herb",
        string? canonicalName = null,
        PlantLifeCycle? lifeCycle = PlantLifeCycle.Perennial,
        PlantWateringNeed? wateringNeed = PlantWateringNeed.Average,
        PlantCareLevel? careLevel = PlantCareLevel.Easy,
        bool? isIndoor = null,
        bool? isDroughtTolerant = null,
        bool? isMedicinal = null,
        int? hardinessMin = 5,
        int? hardinessMax = 9,
        IReadOnlyList<PerenualImage>? images = null,
        IReadOnlyList<PerenualPest>? pests = null,
        string? longDescriptionEn = "Test description",
        string? ediblePartsJson = null,
        int? requestedPerenualId = null,
        bool hardinessRejectedAsSuspect = false,
        bool isCanonicalMismatchDangerous = false,
        int? xWateringBasedTempMinC = null,
        int? xWateringBasedTempMaxC = null,
        decimal? xWateringPhMin = null,
        decimal? xWateringPhMax = null,
        int? xSunlightHoursMin = null,
        int? xSunlightHoursMax = null,
        int? xTemperatureToleranceMinC = null,
        int? xTemperatureToleranceMaxC = null,
        int? xPlantSpacingValue = null,
        string? xPlantSpacingUnit = null,
        string? xWateringQualityJson = null,
        string? xWateringPeriodJson = null,
        string? pruningMonths = null) => new(
            PerenualId: perenualId,
            RequestedPerenualId: requestedPerenualId ?? perenualId,
            Cultivar: cultivar,
            PerenualType: perenualType,
            CanonicalScientificName: canonicalName ?? "Aloe vera",
            RawResponseJson: "{\"stub\":true}",
            HasSupremeData: false,
            LifeCycle: lifeCycle,
            GrowthRate: null,
            WateringNeed: wateringNeed,
            CareLevel: careLevel,
            HardinessZoneMin: hardinessMin,
            HardinessZoneMax: hardinessMax,
            MinHeightCm: null,
            MaxHeightCm: null,
            IsEdible: null,
            IsIndoor: isIndoor,
            IsDroughtTolerant: isDroughtTolerant,
            IsSaltTolerant: null,
            IsThorny: null,
            IsInvasive: null,
            IsTropical: null,
            IsMedicinal: isMedicinal,
            IsToxicToHumans: null,
            IsToxicToPets: null,
            EdiblePartsJson: ediblePartsJson,
            PropagationInstructions: null,
            SowingInstructions: null,
            OriginCountries: null,
            SunlightPreferences: null,
            PruningMonths: pruningMonths,
            Maintenance: null,
            FloweringSeason: null,
            HarvestSeason: null,
            PlantAnatomyJson: null,
            HasEdibleFruit: null,
            HasEdibleLeaves: null,
            IsCulinary: null,
            PropagationMethods: null,
            WateringBenchmark: null,
            WateringBenchmarkUnit: null,
            Images: images ?? Array.Empty<PerenualImage>(),
            Pests: pests ?? Array.Empty<PerenualPest>(),
            LongDescriptionEn: longDescriptionEn,
            HardinessRejectedAsSuspect: hardinessRejectedAsSuspect,
            IsCanonicalMismatchDangerous: isCanonicalMismatchDangerous,
            MatchType: "EXACT",
            XWateringBasedTempMinC: xWateringBasedTempMinC,
            XWateringBasedTempMaxC: xWateringBasedTempMaxC,
            XWateringPhMin: xWateringPhMin,
            XWateringPhMax: xWateringPhMax,
            XSunlightHoursMin: xSunlightHoursMin,
            XSunlightHoursMax: xSunlightHoursMax,
            XTemperatureToleranceMinC: xTemperatureToleranceMinC,
            XTemperatureToleranceMaxC: xTemperatureToleranceMaxC,
            XPlantSpacingValue: xPlantSpacingValue,
            XPlantSpacingUnit: xPlantSpacingUnit,
            XWateringQualityJson: xWateringQualityJson,
            XWateringPeriodJson: xWateringPeriodJson,
            // Mirror the resolver: genus is derived from the canonical name so the
            // controller genus gate sees the same value it would in production.
            PerenualGenus: PerenualResolver.DerivePerenualGenus(canonicalName ?? "Aloe vera"));

    private record MatchedDto(
        bool Matched,
        int PerenualId,
        string? PerenualScientificName,
        int ImagesAdded,
        int PestsAdded,
        int LongDescriptionsAdded,
        bool IsExactScientificMatch,
        bool HasSupremeData,
        bool CanonicalMismatchSkipped = false);

    private record NoMatchDto(bool Matched, string MatchType, string Reason);

    private record SkippedDto(bool Skipped, string Reason);

    private record EnrichAllDto(
        int Total,
        int Matched,
        int NotMatched,
        int Skipped,
        int Failed,
        int NotEnrichedRemaining,
        Guid? NextAfterId);

    // ── species-list (SMA-13 catalog endpoint) ────────────────────────────

    [Fact]
    public async Task SpeciesList_NoAuth_Returns401()
    {
        // Same [Authorize] gate as the enrich endpoints — admin-only catalog
        // enumeration must reject unauthenticated requests.
        var response = await Client.GetAsync("/api/admin/perenual/species-list?page=1");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task SpeciesList_NonPositivePage_Returns400(int page)
    {
        AuthAsAnyUser();
        var response = await Client.GetAsync($"/api/admin/perenual/species-list?page={page}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SpeciesList_HappyPath_ReturnsPageWithStrategyAFields()
    {
        // Pin the JSON contract the SMA-13 PowerShell fetcher relies on:
        // pagination meta + per-entry cultivar/variety/hybrid/subspecies
        // fields round-trip through the admin endpoint unchanged.
        AuthAsAnyUser();
        Fixture.PerenualCatalogStub.SetPage(1, new PerenualCatalogPage(
            Data: new[]
            {
                new PerenualCatalogPageEntry(
                    Id: 1,
                    ScientificName: new[] { "Abies alba" },
                    CommonName: "European Silver Fir",
                    OtherName: new[] { "Silver Fir" },
                    Family: "Pinaceae",
                    Cultivar: null,
                    Variety: null,
                    Hybrid: null,
                    Subspecies: null),
                new PerenualCatalogPageEntry(
                    Id: 2,
                    ScientificName: new[] { "Abies alba 'Pyramidalis'" },
                    CommonName: "Pyramidalis Silver Fir",
                    OtherName: null,
                    Family: "Pinaceae",
                    Cultivar: "Pyramidalis",
                    Variety: null,
                    Hybrid: null,
                    Subspecies: null),
            },
            CurrentPage: 1,
            PerPage: 30,
            LastPage: 337,
            Total: 10102,
            From: 1,
            To: 30));

        var response = await Client.GetAsync("/api/admin/perenual/species-list?page=1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<PerenualCatalogPage>();
        Assert.NotNull(body);
        Assert.Equal(1, body!.CurrentPage);
        Assert.Equal(337, body.LastPage);
        Assert.Equal(10102, body.Total);
        Assert.Equal(2, body.Data.Count);

        // Full Strategy A field round-trip — CR PR #92 R1 N3. The test name
        // promises all four discriminator fields, so assert each one on both
        // keeper and rejected, plus Family/OtherName which feed the
        // PowerShell client's category heuristic.
        var keeper = body.Data[0];
        Assert.Equal(1, keeper.Id);
        Assert.Equal(new[] { "Abies alba" }, keeper.ScientificName);
        Assert.Equal("European Silver Fir", keeper.CommonName);
        Assert.Equal(new[] { "Silver Fir" }, keeper.OtherName);
        Assert.Equal("Pinaceae", keeper.Family);
        Assert.Null(keeper.Cultivar);
        Assert.Null(keeper.Variety);
        Assert.Null(keeper.Hybrid);
        Assert.Null(keeper.Subspecies);

        var rejected = body.Data[1];
        Assert.Equal(2, rejected.Id);
        Assert.Equal("Pinaceae", rejected.Family);
        Assert.Null(rejected.OtherName);
        Assert.Equal("Pyramidalis", rejected.Cultivar);
        Assert.Null(rejected.Variety);
        Assert.Null(rejected.Hybrid);
        Assert.Null(rejected.Subspecies);

        Assert.Equal(new[] { 1 }, Fixture.PerenualCatalogStub.ReceivedPages);
    }

    [Fact]
    public async Task SpeciesList_UpstreamFailure_Returns502()
    {
        // Stub returns null (page not pre-loaded) → controller maps to 502 so
        // the PowerShell client distinguishes "page legitimately past end"
        // (200 + Data=[]) from "fetch this again".
        AuthAsAnyUser();

        var response = await Client.GetAsync("/api/admin/perenual/species-list?page=42");

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        Assert.Equal(new[] { 42 }, Fixture.PerenualCatalogStub.ReceivedPages);
    }

    [Fact]
    public async Task SpeciesList_PageDefaultsTo1_WhenNoQueryString()
    {
        AuthAsAnyUser();
        Fixture.PerenualCatalogStub.SetPage(1, new PerenualCatalogPage(
            Data: Array.Empty<PerenualCatalogPageEntry>(),
            CurrentPage: 1, PerPage: 30, LastPage: 337, Total: 10102, From: null, To: null));

        var response = await Client.GetAsync("/api/admin/perenual/species-list");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new[] { 1 }, Fixture.PerenualCatalogStub.ReceivedPages);
    }
}
