using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Dashboard;
using SmartCrops.Core.Entities;
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
public class DashboardController(SmartCropsDbContext context) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonWeb = new(JsonSerializerDefaults.Web);

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
        catch (DbUpdateException) when (!ct.IsCancellationRequested)
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
