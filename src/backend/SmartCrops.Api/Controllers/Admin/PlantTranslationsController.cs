using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.ExternalApis.Gbif;

namespace SmartCrops.Api.Controllers.Admin;

/// <summary>
/// SMA-120 — promote already-stored data into <c>PlantTranslations</c> (the table the
/// Library/Home card + the detail page read), with NO live API call:
/// <list type="bullet">
///   <item><b>Common names</b> from <c>PlantCommonNames</c> (Trefle vernaculars; the
///   <c>IsPrimary</c> name per language, else the first), for <c>en</c> and <c>fr</c>;
///   the Perenual <c>species-details</c> cache <c>common_name</c> is the EN fallback.</item>
///   <item><b>EN description</b> from the same Perenual cache (<c>description</c>).</item>
/// </list>
/// Reads <c>PerenualRawCache</c> + <c>PlantCommonNames</c> + <c>PlantPerenualData</c>;
/// writes ONLY <c>PlantTranslations</c> (never <c>PlantCommonNames</c>, which Trefle
/// re-writes delete-then-insert). Idempotent; <c>dryRun</c> (default true) persists
/// nothing and returns counts only. Gated to the Admin role.
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Admin)]
[Route("api/admin/translations")]
public class PlantTranslationsController : ControllerBase
{
    private const string DetailsEndpoint = "species-details";

    // Cap the dry-run sample so the response stays small on a full 252-plant run;
    // the operator inspects a representative slice for selection quality.
    private const int SampleCap = 30;

    private readonly SmartCropsDbContext _db;
    private readonly GbifClient _gbif;
    private readonly ILogger<PlantTranslationsController> _logger;

    public PlantTranslationsController(SmartCropsDbContext db, GbifClient gbif, ILogger<PlantTranslationsController> logger)
    {
        _db = db;
        _gbif = gbif;
        _logger = logger;
    }

    /// <summary>
    /// Backfill <c>PlantTranslations</c> from the cache + common-name tables.
    /// Write policy per <c>(PlantId, Language)</c>:
    /// <list type="bullet">
    ///   <item><b>CommonName = insert-only</b> — create the row when absent; never
    ///   overwrite an existing name (keeps seed/curated values).</item>
    ///   <item><b>EN Description = overwrite</b> — set/replace the description on the EN
    ///   row from the cache (seed included).</item>
    ///   <item><b>FR rows carry the name only</b> — no FR description (reserved for SMA-61).</item>
    /// </list>
    /// </summary>
    /// <param name="dryRun">When true (default), compute and return counts WITHOUT persisting.</param>
    [HttpPost("backfill")]
    public async Task<ActionResult<TranslationsBackfillResponse>> Backfill(
        [FromQuery] bool dryRun = true,
        CancellationToken ct = default)
    {
        var plants = await _db.Plants
            .Select(p => new { p.Id, p.ScientificName })
            .ToListAsync(ct);

        // Primary (else first) common name per (PlantId, language) for en/fr.
        var commonNameRows = await _db.PlantCommonNames
            .Where(c => c.LanguageCode == "en" || c.LanguageCode == "fr")
            .Select(c => new { c.PlantId, c.LanguageCode, c.Name, c.IsPrimary })
            .ToListAsync(ct);
        var nameByPlantLang = commonNameRows
            .GroupBy(c => (c.PlantId, c.LanguageCode))
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.IsPrimary).First().Name);

        // Perenual cache (EN common_name fallback + EN description), joined via the
        // requested-or-canonical id. Parse only the two fields we need.
        var idToPlant = await _db.PlantPerenualData
            .Select(d => new { d.PlantId, d.PerenualId, d.RequestedPerenualId })
            .ToListAsync(ct);
        // One-to-many: the unique constraint on PlantPerenualData.PerenualId was
        // dropped (migration DropPerenualIdUniqueConstraint), so several plants may
        // share the same (RequestedPerenualId ?? PerenualId). A plain ToDictionary
        // would throw on the duplicate key — group instead and fan a shared id's
        // cached data out to every plant that maps to it.
        var resourceToPlants = idToPlant
            .GroupBy(d => (d.RequestedPerenualId ?? d.PerenualId).ToString())
            .ToDictionary(g => g.Key, g => g.Select(x => x.PlantId).ToList());

        var resourceIds = resourceToPlants.Keys.ToList();
        var cacheRows = await _db.PerenualRawCache
            .Where(c => c.Endpoint == DetailsEndpoint && c.RawJson != null && resourceIds.Contains(c.ResourceId))
            .Select(c => new { c.ResourceId, c.RawJson })
            .ToListAsync(ct);

        var cacheCommonName = new Dictionary<Guid, string>();
        var cacheDescription = new Dictionary<Guid, string>();
        foreach (var row in cacheRows)
        {
            if (!resourceToPlants.TryGetValue(row.ResourceId, out var plantIds)) { continue; }
            try
            {
                using var doc = JsonDocument.Parse(row.RawJson!);
                var root = doc.RootElement;
                var cn = GetNonEmptyString(root, "common_name");
                var desc = GetNonEmptyString(root, "description");
                foreach (var plantId in plantIds)
                {
                    if (cn is not null) { cacheCommonName[plantId] = cn; }
                    if (desc is not null) { cacheDescription[plantId] = desc; }
                }
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Translations backfill: cached details for resource {ResourceId} was not valid JSON; skipping.", row.ResourceId);
            }
        }

        var existing = await _db.PlantTranslations.ToListAsync(ct);
        var existingByKey = existing.ToDictionary(t => (t.PlantId, t.Language));

        int enNamesToInsert = 0, frNamesToInsert = 0, enDescriptionsToWrite = 0;
        int plantsWithoutFrName = 0, plantsWithoutAnyName = 0;

        foreach (var plant in plants)
        {
            // Normalize both name sources to null-or-trimmed BEFORE the insert-only
            // branch: a whitespace-only PlantCommonNames.Name must not beat the
            // (already whitespace-guarded) cache fallback nor persist a blank,
            // sticky CommonName. Keeps the two name sources symmetric.
            var enName = NormalizeName(nameByPlantLang.GetValueOrDefault((plant.Id, "en")))
                ?? NormalizeName(cacheCommonName.GetValueOrDefault(plant.Id));
            var frName = NormalizeName(nameByPlantLang.GetValueOrDefault((plant.Id, "fr")));
            var enDesc = cacheDescription.GetValueOrDefault(plant.Id);

            if (frName is null) { plantsWithoutFrName++; }
            if (enName is null && frName is null) { plantsWithoutAnyName++; }

            // ── EN row (carries name + EN description) ──────────────────────────
            // Description overwrite is independent of the name source (policy: EN
            // Description = overwrite from cache). An EXISTING row's description is
            // refreshed even when no EN name resolves this run; a NEW row still
            // needs a name (CommonName is NOT NULL) so insert is gated on enName.
            if (existingByKey.TryGetValue((plant.Id, "en"), out var enRow))
            {
                // CommonName insert-only (keep existing); Description overwrite.
                if (enDesc is not null && enRow.Description != enDesc)
                {
                    enDescriptionsToWrite++;
                    if (!dryRun) { enRow.Description = enDesc; }
                }
            }
            else if (enName is not null)
            {
                enNamesToInsert++;
                if (enDesc is not null) { enDescriptionsToWrite++; }
                if (!dryRun)
                {
                    _db.PlantTranslations.Add(new PlantTranslation
                    {
                        PlantId = plant.Id,
                        Language = "en",
                        CommonName = enName,
                        Description = enDesc,
                    });
                }
            }

            // ── FR row (name only; no FR description until SMA-61) ──────────────
            if (frName is not null && !existingByKey.ContainsKey((plant.Id, "fr")))
            {
                frNamesToInsert++;
                if (!dryRun)
                {
                    _db.PlantTranslations.Add(new PlantTranslation
                    {
                        PlantId = plant.Id,
                        Language = "fr",
                        CommonName = frName,
                    });
                }
            }
        }

        if (!dryRun) { await _db.SaveChangesAsync(ct); }

        _logger.LogInformation(
            "Translations backfill ({Mode}): plants={Plants} enNamesToInsert={EnIns} frNamesToInsert={FrIns} enDescriptionsToWrite={EnDesc} plantsWithoutFrName={NoFr} plantsWithoutAnyName={NoName}",
            dryRun ? "dry-run" : "apply", plants.Count, enNamesToInsert, frNamesToInsert, enDescriptionsToWrite, plantsWithoutFrName, plantsWithoutAnyName);

        return Ok(new TranslationsBackfillResponse(
            DryRun: dryRun,
            Plants: plants.Count,
            EnNamesToInsert: enNamesToInsert,
            FrNamesToInsert: frNamesToInsert,
            EnDescriptionsToWrite: enDescriptionsToWrite,
            PlantsWithoutFrName: plantsWithoutFrName,
            PlantsWithoutAnyName: plantsWithoutAnyName));
    }

    /// <summary>
    /// SMA-124 (bilingual brick 2/3) — fill missing FR common names by RE-FETCHING
    /// GBIF vernacular names (the dev <c>PlantSources.RawResponseJson</c> is empty, so
    /// there is nothing to re-parse). Targets every plant that has a
    /// <c>GbifTaxonKey</c> but NO <c>fr</c> <c>PlantTranslations</c> row; for each it
    /// calls <c>vernacularNames</c>, picks the best FR name via
    /// <see cref="GbifVernacularSelector"/>, and (when not <paramref name="dryRun"/>)
    /// INSERTs a name-only FR row (<c>Description = null</c>, reserved for SMA-61).
    ///
    /// <para>Write policy: INSERT-only — never UPDATE an existing FR row (keeps
    /// seed/Trefle/curated names) and never touch EN. A null selection inserts
    /// nothing (the plant stays EN/Latin and is counted in <c>NoFrVernacular</c>);
    /// <c>CommonName</c> is NOT NULL so a blank could not be persisted anyway.</para>
    ///
    /// <para>Idempotent: the target query excludes plants that already have an FR
    /// row, so a second apply run is a no-op. Resumable: keyset cursor on
    /// <c>Plants.Id</c> (<paramref name="afterId"/> + <paramref name="limit"/>) and a
    /// per-plant <c>SaveChanges</c>, so an interrupted run resumes via re-run. A
    /// failed taxon increments <c>Failed</c> and the run continues (mop-up on re-run).
    /// <paramref name="delayMs"/> paces the live GBIF calls courteously.</para>
    /// </summary>
    /// <param name="dryRun">When true (default), select names and return counts +
    /// a capped sample WITHOUT persisting anything.</param>
    [HttpPost("gbif-vernacular-backfill")]
    public async Task<ActionResult<GbifVernacularBackfillResponse>> BackfillGbifVernacular(
        [FromQuery] bool dryRun = true,
        [FromQuery] Guid? afterId = null,
        [FromQuery] int? limit = null,
        [FromQuery] int delayMs = 250,
        CancellationToken ct = default)
    {
        // Targets: a GBIF taxon key present AND no fr translation row yet. The
        // OrderBy(Id) IS the keyset cursor key — it must match the Id > cursor
        // filter so every plant is scanned exactly once across chunks.
        var query = _db.Plants
            .Where(p => p.GbifTaxonKey != null
                && !_db.PlantTranslations.Any(t => t.PlantId == p.Id && t.Language == "fr"));
        if (afterId is { } cursor)
        {
            query = query.Where(p => p.Id > cursor);
        }
        query = query.OrderBy(p => p.Id);
        if (limit is > 0)
        {
            query = query.Take(limit.Value);
        }

        var targets = await query
            .Select(p => new { p.Id, p.ScientificName, TaxonKey = p.GbifTaxonKey!.Value })
            .ToListAsync(ct);

        int processed = 0, frInserted = 0, noFrVernacular = 0, failed = 0;
        var sample = new List<GbifVernacularSample>();

        foreach (var target in targets)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var vernaculars = await _gbif.GetVernacularNamesAsync(target.TaxonKey, ct);
                processed++;

                // NormalizeName is a final trim/blank guard over the selector output.
                var frName = NormalizeName(GbifVernacularSelector.SelectFrenchVernacular(vernaculars));
                if (frName is null)
                {
                    noFrVernacular++;
                    continue;
                }

                frInserted++;
                if (sample.Count < SampleCap)
                {
                    sample.Add(new GbifVernacularSample(target.ScientificName, frName));
                }

                if (!dryRun)
                {
                    _db.PlantTranslations.Add(new PlantTranslation
                    {
                        PlantId = target.Id,
                        Language = "fr",
                        CommonName = frName,
                        Description = null, // FR description reserved for SMA-61
                    });
                    // Per-plant commit keeps the run resumable: an interruption leaves
                    // every processed plant durably written, and the re-run's target
                    // query skips them (they now have an fr row).
                    await _db.SaveChangesAsync(ct);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                failed++;
                _logger.LogError(ex, "GBIF vernacular backfill failed for plant {PlantId} (taxon {TaxonKey})", target.Id, target.TaxonKey);
            }

            if (delayMs > 0)
            {
                await Task.Delay(delayMs, ct);
            }
        }

        // NextAfterId = last processed Id (max of the ordered chunk), null when the
        // chunk is empty — the driver advances the cursor with it.
        Guid? nextAfterId = targets.Count > 0 ? targets[^1].Id : null;

        _logger.LogInformation(
            "GBIF vernacular backfill ({Mode}): targets={Targets} processed={Processed} frInserted={FrInserted} noFrVernacular={NoFr} failed={Failed}",
            dryRun ? "dry-run" : "apply", targets.Count, processed, frInserted, noFrVernacular, failed);

        return Ok(new GbifVernacularBackfillResponse(
            DryRun: dryRun,
            Targets: targets.Count,
            Processed: processed,
            FrInserted: frInserted,
            NoFrVernacular: noFrVernacular,
            Failed: failed,
            NextAfterId: nextAfterId,
            Sample: sample));
    }

    /// <summary>Trim a source common name; treat blank/whitespace-only as absent (null)
    /// so it never beats a fallback nor persists an empty, insert-only CommonName.</summary>
    private static string? NormalizeName(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? GetNonEmptyString(JsonElement root, string property)
        => root.TryGetProperty(property, out var el)
            && el.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(el.GetString())
            ? el.GetString()
            : null;

    /// <summary>SMA-120 backfill summary — counts only (no names/descriptions returned).</summary>
    public record TranslationsBackfillResponse(
        bool DryRun,
        int Plants,
        int EnNamesToInsert,
        int FrNamesToInsert,
        int EnDescriptionsToWrite,
        int PlantsWithoutFrName,
        int PlantsWithoutAnyName);

    /// <summary>
    /// SMA-124 GBIF vernacular backfill summary. <c>Targets</c> = plants needing an FR
    /// name (GbifTaxonKey set, no fr row) in this chunk; <c>Processed</c> = taxa
    /// re-fetched without error; <c>FrInserted</c> = of those, a usable FR name was
    /// chosen (inserted unless dry-run); <c>NoFrVernacular</c> = no usable fra entry;
    /// <c>Failed</c> = a fetch/insert error (re-runnable). <c>NextAfterId</c> advances
    /// the keyset cursor. <c>Sample</c> = up to 30 <c>(ScientificName → FR name)</c>
    /// pairs for spot-checking selection quality.
    /// </summary>
    public record GbifVernacularBackfillResponse(
        bool DryRun,
        int Targets,
        int Processed,
        int FrInserted,
        int NoFrVernacular,
        int Failed,
        Guid? NextAfterId,
        IReadOnlyList<GbifVernacularSample> Sample);

    /// <summary>One chosen pair for the dry-run quality sample.</summary>
    public record GbifVernacularSample(string ScientificName, string FrenchName);
}
