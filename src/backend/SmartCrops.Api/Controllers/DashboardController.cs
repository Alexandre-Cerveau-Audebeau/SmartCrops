using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.IdentityModel.JsonWebTokens;
using Npgsql;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Dashboard;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Controllers;

/// <summary>
/// SMA-336 — the gardens dashboard layout: which blocks a user sees, in which
/// order, at which size, and at which experience level. Two endpoints, both
/// scoped to the caller: there is no way to read or write another user's layout.
///
/// <para>Reading never fails on stored data. A user with no row, a row with no
/// document, a document under an unknown schema version, an unknown level, an
/// unknown block key — each degrades to the level preset rather than to an error.
/// A layout is a convenience; it must not be able to keep someone out of their
/// own dashboard.</para>
/// </summary>
[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController(SmartCropsDbContext context, IMemoryCache cache) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonWeb = new(JsonSerializerDefaults.Web);

    /// <summary>Cache key for <see cref="CatalogPlantCountAsync"/>.</summary>
    private const string CatalogPlantCountKey = "dashboard:catalogPlantCount";

    /// <summary>
    /// How long the catalog size is reused before it is counted again (round 1,
    /// E2). Five minutes: the catalog is reference data an admin import changes,
    /// the figure only feeds a « … of 536 in the catalog » caption, and a caption
    /// five minutes behind an import is not a defect anyone can see.
    /// </summary>
    private static readonly TimeSpan CatalogPlantCountTtl = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Single-flight gate on the catalog-count refill (round 3, E″2). Static
    /// because the controller is created per request and the stampede it
    /// prevents is between requests. See <see cref="CatalogPlantCountAsync"/>.
    ///
    /// <para>PER PROCESS, and the deployment topology decides what that is worth
    /// (round 4, C3 — E‴2 / G‴1). This gate and <c>IMemoryCache</c> have the same
    /// scope, so they are consistent with each other; what they are not is
    /// global. N API instances starting cold run N scans, not one. That is the
    /// intended trade while the catalog is a few hundred rows behind a
    /// five-minute window and the figure only feeds a « … of 536 in the catalog »
    /// caption — a shared cache with a distributed single-flight key would move
    /// the ceiling to one scan, and is not worth its operational weight for this
    /// caption alone.</para>
    ///
    /// <para>The other limit worth writing down: the winner holds the gate for
    /// the whole <c>CountAsync</c>, so every concurrent dashboard load waits
    /// behind it. Bounded today by a single indexed count; if that scan ever
    /// becomes expensive, the answer is a timeout on <c>WaitAsync</c> falling
    /// back to the uncached path, measured rather than guessed.</para>
    /// </summary>
    private static readonly SemaphoreSlim CatalogPlantCountLock = new(1, 1);

    /// <summary>
    /// Ceiling on the number of entries one block's options document may carry.
    /// Every setting the frozen design gives a widget fits well inside it.
    /// </summary>
    private const int MaxOptionKeysPerBlock = 16;

    /// <summary>
    /// Ceiling on one block's serialized options document, in UTF-8 bytes.
    /// Without it an authenticated caller can PUT eight blocks of arbitrary
    /// JSON, and the server stores all of it in their <c>jsonb</c> row, then
    /// reads it back on every dashboard load.
    /// </summary>
    private const int MaxOptionsBytesPerBlock = 2 * 1024;

    /// <summary>
    /// Ceiling on the whole PUT body, in bytes (round 2, E'4 / N1). The per-block
    /// ceilings above are applied by <c>Validate</c>, which runs AFTER model
    /// binding has already materialized every block and every options
    /// dictionary; this one is applied before, so an oversized document costs a
    /// rejected request instead of a parsed one.
    ///
    /// <para>Derived from those ceilings rather than picked: eight blocks
    /// (<see cref="DashboardLayout.Blocks"/>) x <see cref="MaxOptionsBytesPerBlock"/>
    /// is 16 KiB of options, and the doubling leaves room for the JSON envelope
    /// — keys, sizes, level, escaping — around them.</para>
    /// </summary>
    private const int MaxRequestBodyBytes = 2 * 8 * MaxOptionsBytesPerBlock;

    /// <summary>
    /// Plant types whose members are edible whatever their own flag says — the
    /// first half of the R4 rule. Measured on the catalog: 31 plants of these
    /// three types carry <c>IsEdible = false</c>, and 38 <c>Ornamental</c> plants
    /// carry <c>IsEdible = true</c>, so neither signal alone is usable and the
    /// rule is their union.
    /// </summary>
    private static readonly string[] EdiblePlantTypes = ["Vegetable", "Fruit", "Herb"];

    /// <summary>
    /// GET /api/dashboard — the Gardens, Counters and Statistics widgets in ONE
    /// call, scoped to the caller.
    ///
    /// <para>A TRANSPORT aggregate, not a computing one (orchestrator decision
    /// D9): every garden ships its <c>CellsJson</c> and its placements verbatim,
    /// and the browser derives active cells, surface, occupancy, dominant exposure
    /// and the plan thumbnail with the pure functions the planner already owns and
    /// tests. Porting that engine to C# would put it in two languages with nothing
    /// to catch a divergence — <c>dotnet test</c> and <c>npm test</c> never meet.
    /// What travels here instead is what SQL answers on its own: counts per
    /// garden, counts per variety, and the edible verdict.</para>
    ///
    /// <para>It is also SMALLER than what the product already sends: 10 277 bytes
    /// against the 27 597 of <c>GET /api/gardens</c> for the same two gardens,
    /// because it carries plans rather than full plant catalog rows.</para>
    /// </summary>
    /// <param name="lang">Display language for common names; English fallback, as on the gardens list.</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpGet]
    public async Task<ActionResult<DashboardResponse>> GetDashboard(
        [FromQuery] string lang = "en",
        CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var language = LanguageCodes.Normalize(lang);

        // The gardens, with their plans. The projection is deliberate: the plant
        // graph is reduced to the ONE field the thumbnail needs
        // (ScientificName, for the placement colour hash). Materialising Plant
        // would drag in the 42-field row — free-text Description included — that
        // makes the gardens list four times heavier than this whole response.
        var gardenRows = await context.Gardens
            .AsNoTracking()
            .Where(g => g.UserId == userId)
            .OrderByDescending(g => g.CreatedAt)
            .ThenBy(g => g.Id)
            .Select(g => new
            {
                g.Id,
                g.Name,
                g.Description,
                g.LayoutWidth,
                g.LayoutHeight,
                g.CellSize,
                g.CellsJson,
                g.Orientation,
                g.GardenType,
                g.LightScheduleJson,
                g.Hemisphere,
                g.LatitudeBand,
                g.UpdatedAt,
                // STABLE order, and the reason matters: SaveLayout deletes every
                // placement and re-inserts it (GardensController.SaveLayout), so
                // BOTH `Id` and `PlacedAt` are new after each save. Ordering on
                // either would reshuffle the list — and with it the first names a
                // card previews and the order of the variety pastilles — every
                // time the user saves a layout without moving anything. Grid
                // geometry is the only key the server does not rewrite: it is the
                // user's own arrangement, in reading order. PlantId closes the
                // tie for the case the layout PUT does not reject, two placements
                // anchored on one cell.
                Placements = g.Placements
                    .OrderBy(p => p.StartRow)
                    .ThenBy(p => p.StartCol)
                    .ThenBy(p => p.PlantId)
                    .Select(p => new
                    {
                        p.Id,
                        p.PlantId,
                        p.Plant.ScientificName,
                        p.StartRow,
                        p.StartCol,
                        p.SpanRows,
                        p.SpanCols,
                        p.Notes,
                    })
                    .ToList(),
                VarietyCount = g.Placements.Select(p => p.PlantId).Distinct().Count(),
                OccupiedCells = g.Placements.Sum(p => p.SpanRows * p.SpanCols),
                EdibleCount = g.Placements.Count(p =>
                    p.Plant.IsEdible == true
                    || EdiblePlantTypes.Contains(p.Plant.PlantType!.Name)),
            })
            .ToListAsync(ct);

        var gardens = gardenRows
            .Select(g => new DashboardGardenDto(
                g.Id,
                g.Name,
                g.Description,
                g.LayoutWidth,
                g.LayoutHeight,
                g.CellSize,
                g.CellsJson,
                new GardenConfigDto(
                    g.Orientation,
                    g.GardenType,
                    LightScheduleDocument.Parse(g.LightScheduleJson),
                    g.Hemisphere,
                    g.LatitudeBand),
                g.UpdatedAt,
                [.. g.Placements.Select(p => new PlacementResponse(
                    p.Id,
                    p.PlantId,
                    p.ScientificName,
                    p.StartRow,
                    p.StartCol,
                    p.SpanRows,
                    p.SpanCols,
                    p.Notes))],
                g.Placements.Count,
                g.VarietyCount,
                g.OccupiedCells,
                // An EMPTY garden is neither: null, not false. Calling it
                // ornamental would apply « an ornamental garden never shows a
                // harvest » to a garden nobody has planted yet.
                g.Placements.Count == 0 ? null : g.EdibleCount > 0))
            .ToList();

        // Counts by variety — derived IN MEMORY from the placements query 1 has
        // already loaded, never re-read (round 1, E3).
        //
        // The previous shape asked `GardenPlacements` a second time for the same
        // rows. Two independent reads of a table the user can rewrite between
        // them can disagree: `SaveLayout` deletes every placement of a garden and
        // re-inserts it, so the window is a whole layout save wide, and a
        // response could ship a variety whose `Count` was non-zero while its
        // `GardenIds` — derived from the FIRST read — was empty. The frontend
        // reads `gardenIds` as the per-garden filter, so that chip matched no
        // garden; `Totals.PlacementCount` and the variety counts could disagree
        // on the same page for the same reason.
        //
        // Every figure here is derivable from `gardenRows`: it already carries
        // each placement's `PlantId`, `ScientificName`, `SpanRows` and `SpanCols`,
        // and which garden it belongs to. That makes the whole response ONE
        // snapshot by construction rather than by timing, and drops a full scan
        // of the caller's placements. What SQL alone could give — `PlantType` and
        // `IsEdible` — comes from `LoadVarietyDisplayAsync`, whose per-plant read
        // is already bounded by the caller's own varieties.
        var varietyRows = gardenRows
            .SelectMany(g => g.Placements.Select(p => new
            {
                GardenId = g.Id,
                p.PlantId,
                p.ScientificName,
                p.SpanRows,
                p.SpanCols,
            }))
            .GroupBy(p => p.PlantId)
            .Select(grp => new
            {
                PlantId = grp.Key,
                grp.First().ScientificName,
                Count = grp.Count(),
                Cells = grp.Sum(p => p.SpanRows * p.SpanCols),
                GardenIds = (IReadOnlyList<Guid>)[.. grp.Select(p => p.GardenId).Distinct()],
            })
            .OrderByDescending(v => v.Count)
            // ORDINAL, and stated rather than defaulted: the sort moved from
            // PostgreSQL's collation to the CLR's, and `StringComparer.Ordinal`
            // is the one comparison that does not depend on the culture the
            // server happens to run under. Scientific names are ASCII binomials,
            // so it orders them the way a reader expects.
            .ThenBy(v => v.ScientificName, StringComparer.Ordinal)
            .ToList();

        var display = await LoadVarietyDisplayAsync(
            [.. varietyRows.Select(v => v.PlantId)], language, ct);

        var varieties = varietyRows
            .Select(v =>
            {
                display.TryGetValue(v.PlantId, out var d);
                return new VarietyCountDto(
                    v.PlantId,
                    v.ScientificName,
                    d.CommonName,
                    d.PlantType,
                    d.IsEdible,
                    d.ImageUrl,
                    d.ImageAttribution,
                    v.Count,
                    v.Cells,
                    v.GardenIds);
            })
            .ToList();

        var totals = new DashboardTotalsDto(
            gardens.Count,
            gardens.Sum(g => g.PlacementCount),
            // DISTINCT varieties (decision D11): a variety planted in two gardens
            // is one variety. Summing the per-garden counts would say seventeen
            // where the catalog says sixteen.
            varieties.Count,
            await CatalogPlantCountAsync(ct));

        return Ok(new DashboardResponse(gardens, varieties, totals));
    }

    /// <summary>
    /// Size of the plant catalog, counted at most once every
    /// <see cref="CatalogPlantCountTtl"/> (round 1, E2).
    ///
    /// <para><c>context.Plants.CountAsync</c> ran on EVERY dashboard load. On
    /// PostgreSQL an unqualified <c>COUNT(*)</c> is a scan, so its cost grows with
    /// the catalog while the number it produces changes about never — it is
    /// reference data an admin import writes, and it feeds one caption. It is
    /// also issued sequentially after the variety read and shares no dependency
    /// with it, so it was pure added latency on the critical path of the page.</para>
    ///
    /// <para>The value is deliberately allowed to be STALE inside the window: a
    /// caption saying 536 for five minutes after a 537th plant arrives is the
    /// intended behaviour, not a tolerated one.</para>
    ///
    /// <para>Round 3, E″2 — the refill is SERIALIZED. Every request that arrives
    /// while the window is empty misses the cache before any of them has written
    /// it back, so a cold start or a TTL expiry under load ran the same scan once
    /// per concurrent request — the stampede the cache exists to prevent. One
    /// waiter goes to the database and the rest take its answer, which is why the
    /// second <c>TryGetValue</c> inside the lock is the load-bearing line and not
    /// a belt-and-braces one.</para>
    /// </summary>
    private async Task<int> CatalogPlantCountAsync(CancellationToken ct)
    {
        if (cache.TryGetValue(CatalogPlantCountKey, out int cached)) return cached;

        // Static: the gate has to span REQUESTS, and this controller is created
        // per request. It guards a read of reference data whose refill is a
        // single query, so the wait is bounded by that query.
        await CatalogPlantCountLock.WaitAsync(ct);
        try
        {
            // The waiter that queued behind the winner finds the value here and
            // never reaches the database.
            if (cache.TryGetValue(CatalogPlantCountKey, out cached)) return cached;

            var count = await context.Plants.CountAsync(ct);
            cache.Set(CatalogPlantCountKey, count, CatalogPlantCountTtl);
            return count;
        }
        finally
        {
            CatalogPlantCountLock.Release();
        }
    }

    /// <summary>
    /// What the Counters widget needs about one placed variety beyond its counts:
    /// the catalog facts SQL alone can answer, and its display name and cover.
    /// </summary>
    /// <param name="CommonName">Localised name, requested language then English; null when neither exists.</param>
    /// <param name="PlantType">The catalog type name — half of the R4 edible rule.</param>
    /// <param name="IsEdible">The catalog's own flag — the other half of R4.</param>
    /// <param name="ImageUrl">A stable-source cover, or null.</param>
    /// <param name="ImageAttribution">Attribution for <paramref name="ImageUrl"/>; null exactly when it is.</param>
    private readonly record struct VarietyDisplay(
        string? CommonName,
        string? PlantType,
        bool? IsEdible,
        string? ImageUrl,
        string? ImageAttribution);

    /// <summary>
    /// Catalog facts, localised name and cover photo for the placed varieties, in
    /// one read.
    ///
    /// <para>The cover is picked with <see cref="PlantListItemMapper.StableImageRank"/>
    /// — the library's own priority — so a plant does not wear one photo on its
    /// Library card and another in the Counters widget. Ranking happens in memory
    /// because that method is a C# switch: the alternative is a second copy of the
    /// priority written as SQL, which is the divergence this lot exists to avoid.
    /// The set is bounded by the caller's own varieties, and only stable-source
    /// rows are read.</para>
    ///
    /// <para>Round 1, E3: it also carries <c>PlantType</c> and <c>IsEdible</c>.
    /// They used to come from a second <c>GROUP BY</c> over the caller's
    /// placements; they are catalog facts about a plant, this read is already
    /// keyed on exactly those plants, and moving them here is what let the second
    /// read go.</para>
    /// </summary>
    private async Task<Dictionary<Guid, VarietyDisplay>>
        LoadVarietyDisplayAsync(List<Guid> plantIds, string language, CancellationToken ct)
    {
        if (plantIds.Count == 0) return [];

        var rows = await context.Plants
            .AsNoTracking()
            .Where(p => plantIds.Contains(p.Id))
            .Select(p => new
            {
                p.Id,
                PlantType = p.PlantType!.Name,
                p.IsEdible,
                Names = p.Translations
                    .Where(t => t.Language == language || t.Language == "en")
                    .Select(t => new { t.Language, t.CommonName })
                    .ToList(),
                Images = p.Images
                    .Where(i => i.Source == PlantSourceType.Trefle
                        || i.Source == PlantSourceType.PlantNet)
                    .Select(i => new
                    {
                        i.Id,
                        i.ImageType,
                        i.DisplayOrder,
                        i.Url,
                        i.Credit,
                        i.LicenseName,
                        i.Source,
                    })
                    .ToList(),
            })
            .ToListAsync(ct);

        return rows.ToDictionary(
            r => r.Id,
            r =>
            {
                // Requested language, then English — the independent-field
                // fallback the list mapper applies (SMA-120).
                var name = r.Names.FirstOrDefault(t => t.Language == language)?.CommonName
                    ?? r.Names.FirstOrDefault(t => t.Language == "en")?.CommonName;

                var cover = r.Images
                    .OrderBy(i => PlantListItemMapper.StableImageRank(i.ImageType))
                    .ThenBy(i => i.DisplayOrder)
                    .ThenBy(i => i.Id)
                    .FirstOrDefault();

                return new VarietyDisplay(
                    name,
                    r.PlantType,
                    r.IsEdible,
                    cover?.Url,
                    cover is null
                        ? null
                        : ImageAttribution.Compose(cover.Credit, cover.LicenseName, cover.Source));
            });
    }

    /// <summary>
    /// The caller's layout, or the preset of their level when they have never
    /// saved one. Always 200 for an authenticated caller — never 404.
    /// </summary>
    [HttpGet("preferences")]
    public async Task<ActionResult<DashboardPreferencesResponse>> GetPreferences(CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var row = await context.UserDashboardPreferences
            .AsNoTracking()
            .SingleOrDefaultAsync(p => p.UserId == userId, ct);

        return Ok(ToResponse(row));
    }

    /// <summary>
    /// Replaces the caller's layout, creating the row on first save. 400 when the
    /// document is not one this server can store: unknown level, unknown or
    /// duplicated block key, unknown size, or an attempt to hide the gardens
    /// block.
    /// </summary>
    [HttpPut("preferences")]
    [RequestSizeLimit(MaxRequestBodyBytes)]
    public async Task<IActionResult> PutPreferences(
        SaveDashboardPreferencesRequest request,
        CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        if (Validate(request) is { } error) return BadRequest(new { error });

        var document = new StoredLayout(
            DashboardLayout.CurrentSchemaVersion,
            request.Level,
            [.. request.Blocks.Select(b => new StoredBlock(b.Key, b.Size, b.Hidden, b.Options))]);
        var json = JsonSerializer.Serialize(document, JsonWeb);

        try
        {
            await UpsertAsync(userId, json, ct);
        }
        catch (DbUpdateException ex)
            when (!ct.IsCancellationRequested && IsUserRowConflict(ex))
        {
            // A concurrent FIRST save won the unique index on UserId: both
            // requests read no row, both inserted, one lost. The PUT replaces
            // the document wholesale, so re-applying it over the row the winner
            // created is safe and idempotent. Exactly one retry — a second
            // conflict is a real failure and propagates.
            context.ChangeTracker.Clear();
            await UpsertAsync(userId, json, ct);
        }

        return NoContent();
    }

    /// <summary>
    /// The ONE failure the retry above answers (round 2, E'3): the unique index
    /// on <c>UserId</c> rejecting the second of two concurrent first inserts.
    /// Any other write failure — a foreign key, a check constraint, a dead
    /// connection — is not a race this endpoint can resolve by trying again,
    /// and a blanket <see cref="DbUpdateException"/> filter would buy it a
    /// second read-then-insert cycle before failing anyway.
    /// </summary>
    private static bool IsUserRowConflict(DbUpdateException ex) =>
        ex.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "IX_UserDashboardPreferences_UserId",
        };

    /// <summary>
    /// Writes the document on the caller's row, creating it on first save.
    /// Deliberately not atomic on its own: the read-then-insert race is handled
    /// by the single retry in <see cref="PutPreferences"/>.
    /// </summary>
    private async Task UpsertAsync(string userId, string layoutJson, CancellationToken ct)
    {
        var row = await context.UserDashboardPreferences
            .SingleOrDefaultAsync(p => p.UserId == userId, ct);

        if (row is null)
        {
            row = new UserDashboardPreferences { UserId = userId };
            context.UserDashboardPreferences.Add(row);
        }

        row.SchemaVersion = DashboardLayout.CurrentSchemaVersion;
        row.LayoutJson = layoutJson;

        await context.SaveChangesAsync(ct);
    }

    // ── Reading ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Projects a stored row (or its absence) onto the response. Every failure
    /// mode collapses to the preset, deliberately and silently.
    /// </summary>
    private static DashboardPreferencesResponse ToResponse(UserDashboardPreferences? row)
    {
        var stored = Parse(row);

        // Nothing usable stored: the level lives inside the document, so an
        // unreadable document takes the default level with it.
        if (stored is null) return Preset(DashboardLayout.DefaultLevel, updatedAt: null);

        var effectiveLevel = DashboardPresets.IsKnownLevel(stored.Level)
            ? stored.Level
            : DashboardLayout.DefaultLevel;

        return new DashboardPreferencesResponse(
            DashboardLayout.CurrentSchemaVersion,
            effectiveLevel,
            IsPreset: false,
            Merge(stored.Blocks, effectiveLevel),
            row!.UpdatedAt);
    }

    /// <summary>
    /// Deserializes the stored document, or null when there is nothing usable:
    /// no row, no document, a version this server does not know, or JSON that no
    /// longer binds. jsonb guarantees the text parses; it does not guarantee the
    /// shape still matches, so the try/catch is not redundant.
    ///
    /// <para>The null entries of the stored array are dropped HERE, not in
    /// <see cref="Merge"/>: nullable annotations are not runtime checks, so
    /// <c>"blocks":[null]</c> deserializes to a list holding a null, and Merge
    /// would dereference it. Parse is the boundary where untrusted stored data
    /// becomes a shape the rest of the read path can rely on — hence the
    /// separate <see cref="ParsedLayout"/>, whose blocks are non-null by
    /// construction.</para>
    /// </summary>
    private static ParsedLayout? Parse(UserDashboardPreferences? row)
    {
        if (row?.LayoutJson is not { Length: > 0 } json) return null;
        if (row.SchemaVersion != DashboardLayout.CurrentSchemaVersion) return null;

        try
        {
            var parsed = JsonSerializer.Deserialize<StoredLayout>(json, JsonWeb);
            if (parsed?.Blocks is null) return null;

            return new ParsedLayout(
                parsed.Level,
                [.. parsed.Blocks.Where(block => block is not null).Select(block => block!)]);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>The preset of a level, as a response.</summary>
    private static DashboardPreferencesResponse Preset(string level, DateTime? updatedAt) =>
        new(DashboardLayout.CurrentSchemaVersion,
            level,
            IsPreset: true,
            [.. DashboardPresets.For(level).Select(b => new DashboardBlockDto(b.Key, b.Size, b.Hidden, null))],
            updatedAt);

    /// <summary>
    /// Keeps the stored blocks in their stored order, drops keys this server does
    /// not know, and appends any block the document omits with its preset values.
    /// A layout written before a block existed therefore keeps working, and the
    /// new block simply arrives at the end.
    /// </summary>
    private static List<DashboardBlockDto> Merge(List<StoredBlock> stored, string level)
    {
        var preset = DashboardPresets.For(level);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var blocks = new List<DashboardBlockDto>(preset.Count);

        foreach (var block in stored)
        {
            if (block.Key is null || !DashboardLayout.Blocks.All.Contains(block.Key)) continue;
            if (!seen.Add(block.Key)) continue;

            var size = block.Size is not null && DashboardLayout.Sizes.All.Contains(block.Size)
                ? block.Size
                : preset.First(p => p.Key == block.Key).Size;
            var hidden = block.Hidden && block.Key != DashboardLayout.NonHidableBlock;

            blocks.Add(new DashboardBlockDto(block.Key, size, hidden, block.Options));
        }

        foreach (var missing in preset.Where(p => !seen.Contains(p.Key)))
        {
            blocks.Add(new DashboardBlockDto(missing.Key, missing.Size, missing.Hidden, null));
        }

        return blocks;
    }

    // ── Validation ───────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the first reason the document cannot be stored, or null when it
    /// can. Validation is deliberately strict on WRITE and forgiving on READ: a
    /// bad document must never enter the database, but one that somehow did must
    /// never break a page.
    /// </summary>
    private static string? Validate(SaveDashboardPreferencesRequest request)
    {
        if (!DashboardPresets.IsKnownLevel(request.Level)) return "unknown level";
        if (request.Blocks.Count == 0) return "blocks must not be empty";
        if (request.Blocks.Count > DashboardLayout.Blocks.All.Count) return "too many blocks";

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var block in request.Blocks)
        {
            if (!DashboardLayout.Blocks.All.Contains(block.Key)) return $"unknown block '{block.Key}'";
            if (!seen.Add(block.Key)) return $"duplicate block '{block.Key}'";
            if (!DashboardLayout.Sizes.All.Contains(block.Size)) return $"unknown size '{block.Size}'";
            if (block.Hidden && block.Key == DashboardLayout.NonHidableBlock)
            {
                return $"block '{block.Key}' cannot be hidden";
            }

            if (Validate(block) is { } optionsError) return optionsError;
        }

        return null;
    }

    /// <summary>
    /// Bounds one block's options document. BOTH ceilings are needed: the key
    /// count stops a wide document, the byte size stops a deep or a
    /// long-valued one, and neither implies the other.
    /// </summary>
    private static string? Validate(SaveDashboardBlockRequest block)
    {
        if (block.Options is not { Count: > 0 } options) return null;

        if (options.Count > MaxOptionKeysPerBlock)
        {
            return $"too many options for block '{block.Key}'";
        }

        var bytes = JsonSerializer.SerializeToUtf8Bytes(options, JsonWeb).Length;
        return bytes > MaxOptionsBytesPerBlock
            ? $"options for block '{block.Key}' are too large"
            : null;
    }

    private string? GetCurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

    // ── Stored shape ─────────────────────────────────────────────────────────
    // Deliberately separate from the API DTOs: the wire contract and the storage
    // format are free to diverge, and the stored one is nullable everywhere
    // because it is read back from data this server may not have written.

    // `Blocks` holds NULLABLE elements because that is what the column can
    // legitimately contain: `"blocks":[null]` is valid jsonb, and the annotation
    // must describe the data, not the wish.
    private record StoredLayout(int SchemaVersion, string? Level, List<StoredBlock?> Blocks);

    private record StoredBlock(string? Key, string? Size, bool Hidden, Dictionary<string, JsonElement>? Options);

    /// <summary>A document that survived <see cref="Parse"/>: no null blocks.</summary>
    private record ParsedLayout(string? Level, List<StoredBlock> Blocks);
}
