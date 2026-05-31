using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.ExternalApis.Perenual;

namespace SmartCrops.Api.Controllers.Admin;

/// <summary>
/// Admin-triggered Perenual enrichment. Third application of the ADR-0003
/// dual-write rule (after GBIF and Trefle). Each successful enrichment commits,
/// in one EF transaction:
/// <list type="number">
///   <item><c>PlantPerenualData</c> — upserted (1-1 with Plant)</item>
///   <item><c>PlantImage</c> rows where <c>Source = Perenual</c> — delete-then-insert</item>
///   <item><c>PlantPest</c> rows where <c>Source = "perenual"</c> — delete-then-insert</item>
///   <item><c>PlantLongDescription</c> rows where <c>Language = "en"</c> AND
///   <c>SourceMethod = "perenual"</c> — delete-then-insert</item>
///   <item><c>PlantSource</c> Perenual row — upserted (one per source per plant)</item>
///   <item><c>Plant</c> denormalized fields — null-coalesce on scalars (Perenual
///   is complementary, not authoritative; we don't overwrite values set by
///   Manual/GBIF/Trefle). The <c>EdibleParts</c> JSON payload is owned by
///   Perenual and overwritten when present.</item>
/// </list>
///
/// <para>Bare <c>[Authorize]</c> matches PR #58 / PR #59 — Identity Roles
/// aren't in place yet. Tighten to an admin role when role-based authz lands.</para>
/// </summary>
[ApiController]
[Authorize]
[Route("api/admin/perenual")]
public class PlantPerenualController : ControllerBase
{
    private readonly SmartCropsDbContext _db;
    private readonly IPlantPerenualEnrichmentService _perenual;
    private readonly IPerenualCatalogService _catalog;
    private readonly ILogger<PlantPerenualController> _logger;

    public PlantPerenualController(
        SmartCropsDbContext db,
        IPlantPerenualEnrichmentService perenual,
        IPerenualCatalogService catalog,
        ILogger<PlantPerenualController> logger)
    {
        _db = db;
        _perenual = perenual;
        _catalog = catalog;
        _logger = logger;
    }

    /// <summary>
    /// Read-only enumeration of the Perenual species catalog (SMA-13 batch 2
    /// scale-up). Thin pass-through to <see cref="IPerenualCatalogService"/>;
    /// the curation/filtering pipeline (<c>Fetch-PerenualCatalog.ps1</c>)
    /// applies Strategy A (drop cultivar/variety/hybrid/subspecies) client-side
    /// so the filter can be iterated without backend changes.
    ///
    /// <para>Page is 1-based. A page past <c>last_page</c> returns 200 with an
    /// empty <c>Data</c> list. Upstream HTTP/timeout failures are absorbed by
    /// the service and surface as 502 here so the script's retry pattern can
    /// distinguish "no more pages" (200 + empty) from "fetch this again".</para>
    /// </summary>
    [HttpGet("species-list")]
    public async Task<ActionResult<PerenualCatalogPage>> SpeciesList(
        [FromQuery] int page = 1,
        CancellationToken ct = default)
    {
        if (page < 1)
        {
            return BadRequest("Page must be >= 1.");
        }

        var result = await _catalog.GetPageAsync(page, ct);
        if (result is null)
        {
            // Upstream transport / timeout / non-JSON / malformed payload —
            // returning 502 lets the PowerShell client distinguish "page is
            // legitimately empty" (200 + Data=[]) from "fetch failed, retry".
            return StatusCode(StatusCodes.Status502BadGateway,
                $"Perenual catalog fetch failed for page {page}.");
        }

        return Ok(result);
    }

    /// <summary>
    /// Enrich a single plant. Idempotent by default: skipped when the
    /// <see cref="EnrichmentStatus.PerenualEnriched"/> flag is already set,
    /// unless <paramref name="force"/> is supplied to re-fetch.
    ///
    /// <para>When <paramref name="perenualId"/> is provided, the resolver
    /// search step is skipped — useful for cultivars and reclassified species
    /// where Perenual's index does not return the queried scientific name
    /// (e.g. Rosmarinus officinalis is indexed as Salvia rosmarinus).</para>
    /// </summary>
    [HttpPost("enrich/{plantId:guid}")]
    public async Task<IActionResult> Enrich(
        Guid plantId,
        [FromQuery] int? perenualId = null,
        [FromQuery] bool force = false,
        [FromQuery] bool overrideMismatch = false,
        CancellationToken ct = default)
    {
        var plant = await _db.Plants
            .Include(p => p.PerenualData)
            .FirstOrDefaultAsync(p => p.Id == plantId, ct);
        if (plant is null)
        {
            return NotFound();
        }

        if (!force && plant.EnrichmentStatus.HasFlag(EnrichmentStatus.PerenualEnriched))
        {
            return Ok(new EnrichSkippedResponse(true, "AlreadyEnriched"));
        }

        var result = perenualId is int explicitId
            ? await _perenual.ResolveByIdAsync(explicitId, ct)
            : await _perenual.ResolveAsync(plant.ScientificName, ct);

        if (result.PerenualId is null)
        {
            return Ok(new EnrichNoMatchResponse(false, result.MatchType,
                $"No Perenual species found for '{plant.ScientificName}'"));
        }

        // ADR-0003 dual-write — five targets, one transaction. A CHECK or
        // unique-index violation anywhere rolls all writes back, preserving
        // the previous (consistent) state.
        //
        // When Perenual canonicalised the requested id to a likely-different
        // species (IsCanonicalMismatchDangerous), every payload-derived
        // DESTRUCTIVE write would persist wrong-species data: the four
        // collection/source targets (images, pests, long-description, source
        // URL) are skipped here, and the payload-owned EdibleParts overwrite is
        // skipped inside ApplyPlantDenormalisation (same skip flag). The
        // PlantPerenualData audit row (keeps RawResponseJson for diagnosis) and
        // the null-coalesced scalar denormalisation (gap-fill only, often
        // genus-shared, never overwrites curated values) are still applied.
        // See issue #73.
        var skipWrongSpeciesWrites = result.IsCanonicalMismatchDangerous;

        // Genus gate (issue #75 Étage 1) — only meaningful on a canonical
        // mismatch, and bypassed by the admin overrideMismatch escape hatch
        // (Étage 2). When it fires, ApplyPlantDenormalisation skips all scalar +
        // xData gap-fill. The Perenual genus is computed in the resolver and
        // surfaced on the result (CR #76 r1: keeps the API layer off the
        // Infrastructure dependency path); both sides are whitespace-normalised
        // so padded values can't poison the comparison.
        var genusMismatch = false;
        if (skipWrongSpeciesWrites && !overrideMismatch)
        {
            var perenualGenus = result.PerenualGenus;
            var plantGenus = plant.Genus?.Trim();
            if (string.IsNullOrWhiteSpace(perenualGenus) || string.IsNullOrWhiteSpace(plantGenus))
            {
                // Can't validate either side → conservative skip (issue #75 Option A).
                genusMismatch = true;
                _logger.LogWarning(
                    "Cannot validate Perenual genus for plant {PlantId} (plantGenus={PlantGenus}, perenualGenus={PerenualGenus}); conservative skip of scalar + xData denormalisation. See issue #75.",
                    plantId, plantGenus ?? "(null)", perenualGenus ?? "(null)");
            }
            else if (!string.Equals(perenualGenus, plantGenus, StringComparison.OrdinalIgnoreCase))
            {
                genusMismatch = true;
                _logger.LogWarning(
                    "Perenual genus mismatch for plant {PlantId}: GBIF genus '{PlantGenus}' vs Perenual-derived genus '{PerenualGenus}'; skipping scalar + xData denormalisation to avoid wrong-species data. See issue #75.",
                    plantId, plantGenus, perenualGenus);
            }
        }

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        UpsertPerenualData(plant, result);
        if (!skipWrongSpeciesWrites)
        {
            await ReplacePerenualImagesAsync(plantId, result.Images, ct);
            await ReplacePerenualPestsAsync(plantId, result.Pests, ct);
            await ReplacePerenualLongDescriptionAsync(plantId, result.LongDescriptionEn, ct);
        }

        // Source URL is written UNCONDITIONALLY (D5 mini-fix): even on a
        // canonical mismatch the user should keep a "View on Perenual" link.
        // Build it from the REQUESTED id (the species the operator asked for),
        // falling back to the canonical id — so the link lands on the correct
        // page rather than the wrong-species canonical record (issue #73).
        var sourceUrlId = result.RequestedPerenualId ?? result.PerenualId.Value;
        await UpsertPerenualSourceAsync(plantId, sourceUrlId, ct);

        ApplyPlantDenormalisation(plant, result, skipWrongSpeciesWrites, genusMismatch);

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        // Report what was actually persisted, not what the payload offered —
        // the skip branch writes none of the three collections (issue #73).
        var imagesAdded = skipWrongSpeciesWrites ? 0 : result.Images.Count;
        var pestsAdded = skipWrongSpeciesWrites ? 0 : result.Pests.Count;
        var longDescriptionsAdded =
            skipWrongSpeciesWrites || result.LongDescriptionEn is null ? 0 : 1;

        _logger.LogInformation(
            "Perenual-enriched plant {PlantId}: id={PerenualId} cultivar={Cultivar} images={Images} pests={Pests} longDescriptions={Descs} supreme={Supreme} mismatchSkipped={MismatchSkipped}",
            plantId, result.PerenualId, result.Cultivar,
            imagesAdded, pestsAdded, longDescriptionsAdded,
            result.HasSupremeData, skipWrongSpeciesWrites);

        if (result.HardinessRejectedAsSuspect)
        {
            // Structured warning so the operator can correlate per-plant in the
            // log stream and decide whether to widen the guard. See issue #66.
            _logger.LogWarning(
                "Perenual hardiness rejected as suspect for plant {PlantId} (perenualId {PerenualId}); upstream value min==max==2 likely corrupt, hardiness left null. See issue #66.",
                plantId, result.PerenualId);
        }

        if (skipWrongSpeciesWrites)
        {
            // Structured warning mirroring the hardiness-guard pattern: the
            // operator can correlate per-plant and decide whether to remap the
            // requested id. Both ids logged so the divergence is visible.
            _logger.LogWarning(
                "Perenual canonical id mismatch for plant {PlantId}: requested {RequestedPerenualId} but response.id was {PerenualId} (server-side canonicalisation to a likely different species). Skipped images/pests/long-description writes AND EdibleParts overwrite; source URL written from requested id; gap-fill scalars + audit row kept (subject to genus gate). See issue #73.",
                plantId, result.RequestedPerenualId, result.PerenualId);
        }

        if (overrideMismatch && result.IsCanonicalMismatchDangerous)
        {
            // AUDIT TRAIL (issue #75 Étage 2): a human deliberately bypassed the
            // genus gate to apply scalars + xData from a mismatched canonical
            // record. Destructive collection writes stayed skipped regardless.
            var userId = User.FindFirst("sub")?.Value ?? User.Identity?.Name ?? "(unknown)";
            _logger.LogWarning(
                "Admin override mismatch ENABLED for plant {PlantId} by user {UserId}: applied scalars + xData from canonical id {PerenualId} (requested {RequestedPerenualId}) despite mismatch. AUDIT TRAIL. See issue #75.",
                plantId, userId, result.PerenualId, result.RequestedPerenualId);
        }

        return Ok(new EnrichMatchedResponse(
            Matched: true,
            PerenualId: result.PerenualId.Value,
            PerenualScientificName: result.CanonicalScientificName,
            ImagesAdded: imagesAdded,
            PestsAdded: pestsAdded,
            LongDescriptionsAdded: longDescriptionsAdded,
            IsExactScientificMatch: IsExactMatch(plant.ScientificName, result.CanonicalScientificName),
            HasSupremeData: result.HasSupremeData,
            CanonicalMismatchSkipped: skipWrongSpeciesWrites));
    }

    /// <summary>
    /// Enrich every plant. Sequential by design — 30 seed plants × two HTTP
    /// hops at ~500 ms each stays well under Perenual's Supreme-tier 100k/day
    /// budget. When <paramref name="force"/> is false, plants that already
    /// carry the <see cref="EnrichmentStatus.PerenualEnriched"/> flag are
    /// skipped via a SQL filter to avoid loading them at all.
    ///
    /// The optional <paramref name="limit"/> caps the chunk size and
    /// <paramref name="afterId"/> is a keyset cursor: when set, the query
    /// adds <c>WHERE Id &gt; afterId</c>, so every plant is scanned exactly
    /// once per pass regardless of match outcome (CR r1 #2 — the previous
    /// <c>OrderBy(Id).Take</c> over the <c>!PerenualEnriched</c> set could
    /// stall if a front block of unmatchable plants stayed at the head of
    /// every chunk). The response includes <c>NextAfterId</c> (max processed
    /// Id, null when the chunk is empty) for the driver to advance the
    /// cursor, and <c>NotEnrichedRemaining</c> as a kept-for-observability
    /// count of plants still lacking the flag. Note the driver script must
    /// enrich GBIF first: the genus gate above reads <c>plant.Genus</c>,
    /// which only the taxonomy controller writes.
    /// </summary>
    [HttpPost("enrich-all")]
    public async Task<IActionResult> EnrichAll(
        [FromQuery] bool force = false,
        [FromQuery] int? limit = null,
        [FromQuery] Guid? afterId = null,
        CancellationToken ct = default)
    {
        var query = _db.Plants.AsQueryable();
        if (!force)
        {
            query = query.Where(p => (p.EnrichmentStatus & EnrichmentStatus.PerenualEnriched) == 0);
        }

        if (afterId is { } cursor)
        {
            // Keyset/seek: Id comparison + OrderBy stay server-side (Npgsql
            // translates uuid > and uuid ORDER BY natively), so both sides
            // use the same PostgreSQL uuid ordering and the cursor is
            // consistent across chunks.
            query = query.Where(p => p.Id > cursor);
        }

        // OrderBy(Id) IS the cursor key — it MUST match the Id comparison
        // above. Replacing it with a composite (e.g. CreatedAt.ThenBy(Id))
        // would break the seek invariant since the WHERE Id > cursor would
        // skip plants that should still appear in a later chunk.
        query = query.OrderBy(p => p.Id);
        if (limit is > 0)
        {
            query = query.Take(limit.Value);
        }

        var plantIds = await query.Select(p => p.Id).ToListAsync(ct);

        var matched = 0;
        var notMatched = 0;
        var skipped = 0;
        var failed = 0;

        foreach (var id in plantIds)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var resp = await Enrich(id, perenualId: null, force, overrideMismatch: false, ct);
                switch (resp)
                {
                    case OkObjectResult { Value: EnrichMatchedResponse }:
                        matched++;
                        break;
                    case OkObjectResult { Value: EnrichNoMatchResponse }:
                        notMatched++;
                        break;
                    case OkObjectResult { Value: EnrichSkippedResponse }:
                        skipped++;
                        break;
                    default:
                        failed++;
                        break;
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                failed++;
                _logger.LogError(ex, "Failed to Perenual-enrich plant {Id}", id);
            }
            finally
            {
                // The scoped DbContext survives a per-iteration failure: any
                // entity staged before the throw stays tracked and would
                // flush alongside the next iteration's writes. Clearing the
                // change tracker isolates each plant — same fix that landed
                // on PlantTrefleController and PlantTaxonomyController.
                _db.ChangeTracker.Clear();
            }
        }

        // NextAfterId = max processed Id (last of the ordered list); null
        // when the chunk is empty, signalling the cursor has reached the
        // tail of the !flagged set. Termination of the driver loop is
        // "short chunk OR nextAfterId is null", not a stalled-remaining
        // guard (the cursor guarantees forward progress).
        Guid? nextAfterId = plantIds.Count > 0 ? plantIds[^1] : (Guid?)null;

        // NotEnrichedRemaining is kept for observability: at the end of a
        // full driver run this counts plants no upstream source matched
        // (data variance, not a bug). Computed AFTER the per-plant commits
        // so it reflects the post-chunk state.
        var notEnrichedRemaining = await _db.Plants
            .CountAsync(p => (p.EnrichmentStatus & EnrichmentStatus.PerenualEnriched) == 0, ct);

        return Ok(new EnrichAllResponse(
            Total: plantIds.Count,
            Matched: matched,
            NotMatched: notMatched,
            Skipped: skipped,
            Failed: failed,
            NotEnrichedRemaining: notEnrichedRemaining,
            NextAfterId: nextAfterId));
    }

    // ── Dual-write helpers ────────────────────────────────────────────────

    /// <summary>
    /// Create or update the 1-1 <see cref="PlantPerenualData"/> audit row from
    /// the resolved result (identity, raw JSON, scalar labels, and the Supreme
    /// xData columns). Always runs — even on a canonical mismatch — since the
    /// row is the diagnostic record of what Perenual returned.
    /// </summary>
    private void UpsertPerenualData(Plant plant, PerenualEnrichmentResult result)
    {
        // SMA-71 persistence-boundary guard: fail fast if a credential slipped
        // past the client-side redaction rather than letting it become durable in
        // the DB. Throws (does NOT silently re-scrub) so a redaction regression
        // surfaces loudly. Covers both the create and update branches below.
        PerenualKeyRedactor.AssertRedacted(result.LiteralResponseJson, "PlantPerenualData.LiteralResponseJson");
        PerenualKeyRedactor.AssertRedacted(result.CareGuideResponseJson, "PlantPerenualData.CareGuideResponseJson");

        if (plant.PerenualData is null)
        {
            plant.PerenualData = new PlantPerenualData
            {
                PlantId = plant.Id,
                PerenualId = result.PerenualId!.Value,
                RequestedPerenualId = result.RequestedPerenualId,
                Cultivar = result.Cultivar,
                PerenualType = result.PerenualType,
                OriginCountries = result.OriginCountries,
                PropagationMethods = result.PropagationMethods,
                WateringBenchmark = result.WateringBenchmark,
                WateringBenchmarkUnit = result.WateringBenchmarkUnit,
                SunlightPreferences = result.SunlightPreferences,
                PruningMonths = result.PruningMonths,
                Maintenance = result.Maintenance,
                FloweringSeason = result.FloweringSeason,
                HarvestSeason = result.HarvestSeason,
                HasEdibleFruit = result.HasEdibleFruit,
                HasEdibleLeaves = result.HasEdibleLeaves,
                IsCulinary = result.IsCulinary,
                PlantAnatomyJson = result.PlantAnatomyJson,
                RawResponseJson = result.RawResponseJson,
                // SMA-71 loss-proof literal captures (API key already redacted in
                // the client). Kept even on a canonical mismatch — diagnostic only.
                LiteralResponseJson = result.LiteralResponseJson,
                CareGuideResponseJson = result.CareGuideResponseJson,
                ApiVersion = "v2",
                HasSupremeData = result.HasSupremeData,
                LastSyncAt = DateTime.UtcNow,
            };
            _db.PlantPerenualData.Add(plant.PerenualData);
        }
        else
        {
            plant.PerenualData.PerenualId = result.PerenualId!.Value;
            // Audit trail — only set the requestedId on the first enrichment so
            // the original "what did we ASK for" record survives later re-runs
            // that might be triggered with a different id.
            plant.PerenualData.RequestedPerenualId ??= result.RequestedPerenualId;
            plant.PerenualData.Cultivar = result.Cultivar;
            plant.PerenualData.PerenualType = result.PerenualType;
            plant.PerenualData.OriginCountries = result.OriginCountries;
            plant.PerenualData.PropagationMethods = result.PropagationMethods;
            plant.PerenualData.WateringBenchmark = result.WateringBenchmark;
            plant.PerenualData.WateringBenchmarkUnit = result.WateringBenchmarkUnit;
            plant.PerenualData.SunlightPreferences = result.SunlightPreferences;
            plant.PerenualData.PruningMonths = result.PruningMonths;
            plant.PerenualData.Maintenance = result.Maintenance;
            plant.PerenualData.FloweringSeason = result.FloweringSeason;
            plant.PerenualData.HarvestSeason = result.HarvestSeason;
            plant.PerenualData.HasEdibleFruit = result.HasEdibleFruit;
            plant.PerenualData.HasEdibleLeaves = result.HasEdibleLeaves;
            plant.PerenualData.IsCulinary = result.IsCulinary;
            plant.PerenualData.PlantAnatomyJson = result.PlantAnatomyJson;
            plant.PerenualData.RawResponseJson = result.RawResponseJson;
            // Loss-proof: keep a previously-captured literal if this (re-)enrich
            // returned null (e.g. a transient care-guide miss) — do NOT wipe the
            // audit row. The create branch assigns directly (first capture).
            plant.PerenualData.LiteralResponseJson = result.LiteralResponseJson ?? plant.PerenualData.LiteralResponseJson;
            plant.PerenualData.CareGuideResponseJson = result.CareGuideResponseJson ?? plant.PerenualData.CareGuideResponseJson;
            plant.PerenualData.ApiVersion = "v2";
            plant.PerenualData.HasSupremeData = result.HasSupremeData;
            plant.PerenualData.LastSyncAt = DateTime.UtcNow;
        }
    }

    private async Task ReplacePerenualImagesAsync(
        Guid plantId,
        IReadOnlyList<PerenualImage> images,
        CancellationToken ct)
    {
        // Perenual is one of two sources feeding PlantImage (alongside Trefle).
        // Re-enrichment replaces the full Perenual-sourced set; non-Perenual
        // rows (e.g. Trefle images, future manual uploads) are untouched.
        var existing = await _db.PlantImages
            .Where(i => i.PlantId == plantId && i.Source == PlantSourceType.Perenual)
            .ToListAsync(ct);
        _db.PlantImages.RemoveRange(existing);

        var first = true;
        foreach (var img in images)
        {
            _db.PlantImages.Add(new PlantImage
            {
                PlantId = plantId,
                // First image (Perenual's default_image) is categorised Main;
                // additional images go to Other (Perenual doesn't expose a
                // per-part categorisation).
                ImageType = first ? PlantImageType.Main : PlantImageType.Other,
                Url = img.Url,
                ThumbnailUrl = img.ThumbnailUrl,
                LicenseName = img.LicenseName,
                Source = PlantSourceType.Perenual,
                // Perenual's image entries don't carry stable per-image ids,
                // so SourceExternalId stays null — the partial unique index
                // (PlantId, Source, SourceExternalId) is filtered to NOT NULL,
                // letting multiple null-id Perenual rows coexist within the
                // transaction-scoped delete-then-insert.
            });
            first = false;
        }
    }

    private async Task ReplacePerenualPestsAsync(
        Guid plantId,
        IReadOnlyList<PerenualPest> pests,
        CancellationToken ct)
    {
        // Perenual is the only D1 source feeding PlantPest. Filter by Source
        // for forward-compat with future pest-data sources.
        const string perenualSource = "perenual";
        var existing = await _db.PlantPests
            .Where(p => p.PlantId == plantId && p.Source == perenualSource)
            .ToListAsync(ct);
        _db.PlantPests.RemoveRange(existing);

        foreach (var pest in pests)
        {
            _db.PlantPests.Add(new PlantPest
            {
                PlantId = plantId,
                Name = pest.Name,
                Type = pest.Type,
                Source = perenualSource,
                // No per-pest external id from /species/details (Perenual
                // returns just names); composite (PlantId, Source, Name) is
                // the de-facto natural key for dedup within a single source.
                SourceExternalId = null,
            });
        }
    }

    private async Task ReplacePerenualLongDescriptionAsync(
        Guid plantId,
        string? longDescriptionEn,
        CancellationToken ct)
    {
        // Filter by Language = "en" only — the schema enforces a unique
        // (PlantId, Language) index (one description per language per plant),
        // so re-enrichment overwrites whatever English description was there
        // regardless of its prior SourceMethod. Other languages survive.
        // Future AI-translated content for non-English languages would land
        // here too without colliding with Perenual's English row.
        const string lang = "en";
        const string sourceMethod = "perenual";
        var existing = await _db.PlantLongDescriptions
            .Where(d => d.PlantId == plantId && d.Language == lang)
            .ToListAsync(ct);
        _db.PlantLongDescriptions.RemoveRange(existing);

        if (string.IsNullOrWhiteSpace(longDescriptionEn))
        {
            return;
        }

        _db.PlantLongDescriptions.Add(new PlantLongDescription
        {
            PlantId = plantId,
            Language = lang,
            LongDescription = longDescriptionEn,
            SourceMethod = sourceMethod,
        });
    }

    /// <summary>
    /// Upsert the Perenual <see cref="PlantSource"/> row (one per source per
    /// plant), recording the species-details URL and external id. Called with
    /// the requested id (not the canonical one) so the user-facing link lands
    /// on the correct species page even on a canonical mismatch (issue #73 D5).
    /// </summary>
    private async Task UpsertPerenualSourceAsync(Guid plantId, int perenualId, CancellationToken ct)
    {
        var url = $"https://perenual.com/api/v2/species/details/{perenualId}";
        var existing = await _db.PlantSources
            .FirstOrDefaultAsync(
                s => s.PlantId == plantId && s.SourceType == PlantSourceType.Perenual,
                ct);

        if (existing is null)
        {
            _db.PlantSources.Add(new PlantSource
            {
                PlantId = plantId,
                SourceType = PlantSourceType.Perenual,
                ExternalId = perenualId.ToString(CultureInfo.InvariantCulture),
                Url = url,
                LastFetchedAt = DateTime.UtcNow,
            });
        }
        else
        {
            existing.ExternalId = perenualId.ToString(CultureInfo.InvariantCulture);
            existing.Url = url;
            existing.LastFetchedAt = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Apply denormalized Perenual fields to the curated <c>Plant</c> read
    /// model. Scalars use the canonical null-coalesce contract aligned with
    /// PR #59 round 4: <c>if (plant.X is null) plant.X = result.X;</c> for
    /// every scalar. A curated value (Manual / GBIF / Trefle / seed) is never
    /// overwritten by Perenual — Perenual only fills gaps.
    ///
    /// <para>The <c>EdibleParts</c> JSON payload is the exception: Perenual owns
    /// it (no other source in D1 produces it) and it is an unconditional
    /// OVERWRITE, not a gap-fill. That makes it a destructive payload-owned
    /// write — logically part of the canonical-mismatch skip scope even though
    /// it lives here rather than alongside the four collection writes. When
    /// <paramref name="skipWrongSpeciesWrites"/> is set it is therefore skipped
    /// too, so a mismatched (wrong-species) payload cannot poison the read model
    /// (issue #73). The remaining scalars stay null-coalesced gap-fill and are
    /// safe to apply on a mismatch (broader safety discussion: issue #75).</para>
    ///
    /// <para>Narrow exception to the null-coalesce contract: when the hardiness
    /// guard fired upstream (<see cref="PerenualEnrichmentResult.HardinessRejectedAsSuspect"/>)
    /// <em>and</em> the persisted value matches the exact corruption sentinel
    /// (min == max == 2), we scrub it — repairing rows enriched before PR #70's
    /// guard landed, which the plain coalesce would otherwise preserve. The
    /// sentinel check keeps the scrub from destroying valid hardiness set by
    /// another authoritative source (GBIF / Trefle / Manual), honouring the
    /// "Perenual is complementary, not authoritative" contract. See issue #71.</para>
    /// </summary>
    /// <param name="skipWrongSpeciesWrites">
    /// When true (canonical-id mismatch, issue #73), skip the destructive
    /// <c>EdibleParts</c> overwrite. Null-coalesced scalar gap-fill still runs
    /// unless <paramref name="genusMismatch"/> also fires.
    /// </param>
    /// <param name="genusMismatch">
    /// When true (issue #75 Étage 1: a canonical mismatch where the Perenual
    /// genus differs from the GBIF genus, or genus can't be validated), skip ALL
    /// scalar + xData gap-fill so a wrong-species payload can't seed the read
    /// model. The audit row (PlantPerenualData identity/raw) and the requested-id
    /// audit still apply. Forced false by the admin <c>overrideMismatch</c> escape
    /// hatch (Étage 2).
    /// </param>
    private static void ApplyPlantDenormalisation(
        Plant plant, PerenualEnrichmentResult result, bool skipWrongSpeciesWrites, bool genusMismatch)
    {
        // Audit trail (denormalised) — same idempotency rule as PerenualData:
        // preserve the first requestedId we ever recorded for this plant.
        plant.RequestedPerenualId ??= result.RequestedPerenualId;

        // Scope the scrub to the EXACT corruption pattern the guard observed
        // upstream. Without this sentinel check, valid hardiness set by another
        // authoritative source (GBIF, Trefle, Manual) would be destroyed every
        // time Perenual ships the corrupt 2-2 pattern — violating the ADR-0003
        // "complementary, not authoritative" contract for Perenual.
        if (result.HardinessRejectedAsSuspect
            && plant.HardinessZoneMin == 2
            && plant.HardinessZoneMax == 2)
        {
            // Guard fired upstream AND persisted value matches the corrupt
            // sentinel → positive evidence the persisted value is the same
            // corruption, not legitimate data from another source. Scrub
            // safely. See issue #71.
            plant.HardinessZoneMin = null;
            plant.HardinessZoneMax = null;
        }

        // Scalar gap-fill — skipped wholesale on a genus mismatch (issue #75)
        // so a wrong-species payload can't seed empty curated fields. The
        // xData block below shares the same gate.
        if (!genusMismatch)
        {
            if (plant.LifeCycle is null) plant.LifeCycle = result.LifeCycle;
            if (plant.GrowthRate is null) plant.GrowthRate = result.GrowthRate;
            if (plant.WateringNeedLevel is null) plant.WateringNeedLevel = result.WateringNeed;
            if (plant.CareLevel is null) plant.CareLevel = result.CareLevel;

            if (plant.HardinessZoneMin is null) plant.HardinessZoneMin = result.HardinessZoneMin;
            if (plant.HardinessZoneMax is null) plant.HardinessZoneMax = result.HardinessZoneMax;

            if (plant.MinHeightCm is null) plant.MinHeightCm = result.MinHeightCm;
            if (plant.MaxHeightCm is null) plant.MaxHeightCm = result.MaxHeightCm;

            if (plant.IsEdible is null) plant.IsEdible = result.IsEdible;
            if (plant.IsIndoor is null) plant.IsIndoor = result.IsIndoor;
            if (plant.IsDroughtTolerant is null) plant.IsDroughtTolerant = result.IsDroughtTolerant;
            if (plant.IsSaltTolerant is null) plant.IsSaltTolerant = result.IsSaltTolerant;
            if (plant.IsThorny is null) plant.IsThorny = result.IsThorny;
            if (plant.IsInvasive is null) plant.IsInvasive = result.IsInvasive;
            if (plant.IsTropical is null) plant.IsTropical = result.IsTropical;
            if (plant.IsMedicinal is null) plant.IsMedicinal = result.IsMedicinal;
            if (plant.IsToxicToHumans is null) plant.IsToxicToHumans = result.IsToxicToHumans;
            if (plant.IsToxicToPets is null) plant.IsToxicToPets = result.IsToxicToPets;

            if (plant.PropagationInstructions is null) plant.PropagationInstructions = result.PropagationInstructions;
            if (plant.SowingInstructions is null) plant.SowingInstructions = result.SowingInstructions;
        }

        // Perenual Supreme xData → PlantPerenualData (issue #75 gate, design D1),
        // on the same genus-mismatch gate as scalars (NOT the
        // skipWrongSpeciesWrites/EdibleParts gate). PlantPerenualData is created
        // by UpsertPerenualData earlier in the transaction, so it is non-null
        // here on every match path; the guard is defensive.
        //
        // Unlike the Plant scalars above (which use ??= first-writer-wins because
        // Manual/GBIF/Trefle/Perenual all compete for them per ADR-0003), xData
        // lives on the Perenual-EXCLUSIVE PlantPerenualData (design D1) — no
        // cross-source collision is possible — so we OVERWRITE on every
        // (re-)enrich, consistent with the rest of UpsertPerenualData. This lets
        // force=true refresh stale xData when Perenual updates upstream (data
        // drift observed in Phase 4 smoke). See CR PR #76 r2.
        if (!genusMismatch && plant.PerenualData is not null)
        {
            plant.PerenualData.XWateringBasedTempMinC = result.XWateringBasedTempMinC;
            plant.PerenualData.XWateringBasedTempMaxC = result.XWateringBasedTempMaxC;
            plant.PerenualData.XWateringPhMin = result.XWateringPhMin;
            plant.PerenualData.XWateringPhMax = result.XWateringPhMax;
            plant.PerenualData.XSunlightHoursMin = result.XSunlightHoursMin;
            plant.PerenualData.XSunlightHoursMax = result.XSunlightHoursMax;
            plant.PerenualData.XTemperatureToleranceMinC = result.XTemperatureToleranceMinC;
            plant.PerenualData.XTemperatureToleranceMaxC = result.XTemperatureToleranceMaxC;
            plant.PerenualData.XPlantSpacingValue = result.XPlantSpacingValue;
            plant.PerenualData.XPlantSpacingUnit = result.XPlantSpacingUnit;
            plant.PerenualData.XWateringQualityJson = result.XWateringQualityJson;
            plant.PerenualData.XWateringPeriodJson = result.XWateringPeriodJson;
        }

        // Perenual owns EdibleParts in D1 (no other source produces this JSON)
        // — overwrite when present so re-enrichment after a Perenual data fix
        // reaches the read model. NULL result preserves whatever was there.
        // This is a destructive payload-owned OVERWRITE (not gap-fill), so a
        // canonical mismatch skips it alongside the four collection writes to
        // avoid persisting wrong-species edible-parts data (issue #73). The
        // null-coalesced scalars above stay (gap-fill safe; see issue #75).
        if (!skipWrongSpeciesWrites && result.EdiblePartsJson is not null)
        {
            plant.EdibleParts = result.EdiblePartsJson;
        }

        plant.EnrichmentStatus |= EnrichmentStatus.PerenualEnriched;
        plant.LastEnrichmentAt = DateTime.UtcNow;
    }

    private static bool IsExactMatch(string queriedName, string? canonicalName)
        => canonicalName is not null
        && string.Equals(queriedName, canonicalName, StringComparison.OrdinalIgnoreCase);

    // ── Response records ──────────────────────────────────────────────────

    /// <summary>
    /// Successful-match enrichment response. The <c>*Added</c> counts reflect
    /// what was actually persisted (zero when a canonical mismatch skipped the
    /// destructive writes), not what the Perenual payload offered.
    /// </summary>
    /// <param name="CanonicalMismatchSkipped">
    /// True when a Perenual canonical-id mismatch caused destructive
    /// wrong-species writes (including the EdibleParts overwrite) to be skipped
    /// (issue #73). Lets the admin UI surface a distinct toast. Defaults false
    /// on the happy path.
    /// </param>
    public record EnrichMatchedResponse(
        bool Matched,
        int PerenualId,
        string? PerenualScientificName,
        int ImagesAdded,
        int PestsAdded,
        int LongDescriptionsAdded,
        bool IsExactScientificMatch,
        bool HasSupremeData,
        bool CanonicalMismatchSkipped = false);

    public record EnrichNoMatchResponse(bool Matched, string MatchType, string Reason);

    public record EnrichSkippedResponse(bool Skipped, string Reason);

    public record EnrichAllResponse(
        int Total,
        int Matched,
        int NotMatched,
        int Skipped,
        int Failed,
        int NotEnrichedRemaining,
        Guid? NextAfterId);
}
