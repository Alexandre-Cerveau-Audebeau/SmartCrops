using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
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
/// SMA-448, lot F1 — the formulas. The formula is a RIGHT on the account
/// (<c>AspNetUsers."Formula"</c>), and the API is the one source of what each
/// formula permits: <see cref="GetFormulas"/> serves the catalogue the rest of
/// the server refuses by (<see cref="FormulaCatalog"/>), and the caller's own
/// state against it; <see cref="PutCurrent"/> changes the caller's formula,
/// losing nothing. Scoped to the caller, like every dashboard endpoint.
/// </summary>
[ApiController]
[Route("api/formulas")]
[Authorize]
public class FormulasController(SmartCropsDbContext context) : ControllerBase
{
    /// <summary>
    /// GET /api/formulas — the three formulas and what each grants (limits,
    /// widgets, sizes, weather mode, compact bar, preset), then the caller: its
    /// formula, whether it has ever chosen one, its gardens counted and
    /// measured, and which formula it may choose, with the reasons one is too
    /// small. 200 for any authenticated caller.
    ///
    /// <para>SMA-448, lot F3, step L2 — E9 (PR #293, fix round 1): the account
    /// and its gardens in ONE statement, the account left-joined to them. Under
    /// READ COMMITTED each statement sees the database as of its own start, so
    /// two reads could straddle a switch of formula and a creation, and pair
    /// the formula of before with the gardens of after — a Novice « beyond its
    /// limit » that the account never was; one statement answers from one
    /// instant. The pattern of <c>GET /api/dashboard/preferences</c> (S4).</para>
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<FormulasResponse>> GetFormulas(CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var rows = await (
            from user in context.Users.AsNoTracking()
            where user.Id == userId
            join garden in context.Gardens.AsNoTracking() on user.Id equals garden.UserId into owned
            from garden in owned.DefaultIfEmpty()
            select new
            {
                user.Formula,
                user.FormulaChosenAt,
                GardenId = (Guid?)garden.Id,
                garden.LayoutWidth,
                garden.LayoutHeight,
            })
            .ToListAsync(ct);
        if (rows.Count == 0) return Unauthorized();

        var account = rows[0];
        var gardens = rows
            .Where(row => row.GardenId is not null)
            .Select(row => new GardenDimensions(row.GardenId!.Value, row.LayoutWidth, row.LayoutHeight))
            .ToList();

        return Ok(new FormulasResponse(
            [.. FormulaCatalog.All.Select(FormulaDtos.From)],
            new FormulaAccountDto(
                account.Formula,
                account.FormulaChosenAt is not null,
                account.FormulaChosenAt,
                gardens.Count,
                LargestSize(gardens),
                [.. FormulaCatalog.All.Select(formula => Availability(formula, account.Formula, gardens))])));
    }

    /// <summary>
    /// PUT /api/formulas/current — the caller chooses a formula. The choice is
    /// DELIBERATE, so it stamps <c>FormulaChosenAt</c>, even when the formula
    /// is the one the account is already on (« Garder Jardinier »).
    ///
    /// <para><b>A formula too small for the account's gardens is refused</b> —
    /// too many gardens, or one wider or taller than it allows — in 409
    /// <c>application/problem+json</c>, code <c>formula.tooSmall</c>, with its
    /// reasons (pre-flight § C.4). The formula the account is on is never too
    /// small for it: it keeps it, beyond its limits if it already is (« Votre
    /// formule — conservée »; the limits apply going forward only).</para>
    ///
    /// <para><b>Nothing is lost, in either direction</b> (V4): in ONE
    /// transaction, the account's row locked, the current layout goes to the
    /// archive under the formula it leaves, and the archived layout of the
    /// formula it enters comes back into the current row — or, for a formula
    /// never visited, the row's layout empties and that formula's preset
    /// applies. The current row stays one per account and names the formula as
    /// its level: the image before the formulas keeps reading it (§ C.3 c).</para>
    /// </summary>
    [HttpPut("current")]
    public async Task<IActionResult> PutCurrent(ChangeFormulaRequest request, CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        if (!DashboardPresets.IsKnownLevel(request.Formula))
        {
            return BadRequest(new { error = $"unknown formula '{request.Formula}'" });
        }

        var target = FormulaCatalog.For(request.Formula);

        await using var transaction = await context.Database.BeginTransactionAsync(ct);

        var current = await AccountFormulaLock.LockAsync(context, userId, ct);
        if (current is null) return Unauthorized();

        if (target.Key != current)
        {
            var reasons = FormulaCatalog.ShortfallsFor(target, await LoadGardenDimensionsAsync(userId, ct));
            if (reasons.Count > 0) return TooSmall(target, reasons);

            await SwapLayoutsAsync(userId, current, target.Key, ct);
        }

        // SMA-437, review of the v3, M1 — the stamp turns with the formula. This
        // UPDATE writes the row OUTSIDE Identity, and `UserManager.UpdateAsync`
        // rewrites EVERY column of it with `ConcurrencyStamp` as its only guard:
        // an Identity write that read the account before this switch committed
        // (the default location, the profile) found the stamp unchanged and put
        // the old formula back, with the old « chosen at ». Turned here, the late
        // write fails as a ConcurrencyFailure instead (FormulaIdentityWriteRaceTests).
        var chosenAt = DateTime.UtcNow;
        var stamp = Guid.NewGuid().ToString();
        await context.Users
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(u => u.Formula, target.Key)
                    .SetProperty(u => u.FormulaChosenAt, chosenAt)
                    .SetProperty(u => u.ConcurrencyStamp, stamp),
                ct);
        await context.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return NoContent();
    }

    /// <summary>
    /// The layout of <paramref name="from"/> to the archive, verbatim; the
    /// layout of <paramref name="to"/> back from it into the current row, its
    /// level set to <paramref name="to"/> — or, never visited, an empty layout
    /// naming <paramref name="to"/>, read as its preset. The archive row that
    /// came back is removed: the archive never holds the formula the account
    /// is on.
    /// </summary>
    private async Task SwapLayoutsAsync(string userId, string from, string to, CancellationToken ct)
    {
        var currentRow = await context.UserDashboardPreferences.SingleOrDefaultAsync(p => p.UserId == userId, ct);
        var archived = await context.SavedDashboardLayouts
            .Where(l => l.UserId == userId && (l.Formula == from || l.Formula == to))
            .ToListAsync(ct);

        if (currentRow?.LayoutJson is { } leaving)
        {
            var archivedFrom = archived.SingleOrDefault(l => l.Formula == from);
            if (archivedFrom is null)
            {
                context.SavedDashboardLayouts.Add(new SavedDashboardLayout
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    Formula = from,
                    LayoutJson = leaving,
                    SchemaVersion = currentRow.SchemaVersion,
                });
            }
            else
            {
                archivedFrom.LayoutJson = leaving;
                archivedFrom.SchemaVersion = currentRow.SchemaVersion;
            }
        }

        var archivedTo = archived.SingleOrDefault(l => l.Formula == to);
        if (archivedTo is not null) context.SavedDashboardLayouts.Remove(archivedTo);

        if (currentRow is null)
        {
            currentRow = new UserDashboardPreferences { UserId = userId };
            context.UserDashboardPreferences.Add(currentRow);
        }

        currentRow.LayoutJson = archivedTo is null ? EmptyLayout(to) : WithLevel(archivedTo.LayoutJson, to);
        currentRow.SchemaVersion = archivedTo?.SchemaVersion ?? DashboardLayout.CurrentSchemaVersion;
    }

    /// <summary>
    /// A layout with no block, naming its level: every block of that level's
    /// preset comes back from <c>Merge</c> at its preset place, so it reads as
    /// the preset — here and in the image before the formulas, which takes its
    /// level from the document.
    /// </summary>
    private static string EmptyLayout(string level) =>
        new JsonObject
        {
            ["schemaVersion"] = DashboardLayout.CurrentSchemaVersion,
            ["level"] = level,
            ["blocks"] = new JsonArray(),
        }.ToJsonString();

    /// <summary>
    /// An archived document with its level set to the formula it comes back
    /// under. A document that does not parse as an object is restored as it
    /// was: the read path already degrades it to the preset, never an error.
    /// </summary>
    private static string WithLevel(string layoutJson, string level)
    {
        try
        {
            if (JsonNode.Parse(layoutJson) is JsonObject document)
            {
                document["level"] = level;
                return document.ToJsonString();
            }
        }
        catch (JsonException)
        {
            // Restored verbatim below.
        }

        return layoutJson;
    }

    /// <summary>
    /// 409 <c>application/problem+json</c> (RFC 9457): the formula is too
    /// small for the account's gardens — a stable <c>code</c> for the client to
    /// branch on, the formula, and the reasons the choice screen will say.
    /// </summary>
    private static ObjectResult TooSmall(FormulaDefinition formula, IReadOnlyList<FormulaShortfall> reasons)
    {
        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status409Conflict,
            Title = "This formula is too small for the account's gardens.",
        };
        problem.Extensions["code"] = "formula.tooSmall";
        problem.Extensions["formula"] = formula.Key;
        problem.Extensions["reasons"] = reasons.Select(FormulaDtos.From).ToList();

        return new ObjectResult(problem)
        {
            StatusCode = StatusCodes.Status409Conflict,
            ContentTypes = { "application/problem+json" },
        };
    }

    /// <summary>The caller's gardens, as the catalogue weighs them: identity and plan size.</summary>
    private async Task<List<GardenDimensions>> LoadGardenDimensionsAsync(string userId, CancellationToken ct) =>
        await context.Gardens
            .AsNoTracking()
            .Where(g => g.UserId == userId)
            .Select(g => new GardenDimensions(g.Id, g.LayoutWidth, g.LayoutHeight))
            .ToListAsync(ct);

    /// <summary>
    /// The widest width and the tallest height among the gardens with a plan —
    /// possibly two gardens: what a formula's largest size is weighed against.
    /// </summary>
    private static GardenSizeDto? LargestSize(IReadOnlyCollection<GardenDimensions> gardens)
    {
        var planned = gardens.Where(g => g.Width is not null && g.Height is not null).ToList();
        return planned.Count == 0
            ? null
            : new GardenSizeDto(planned.Max(g => g.Width!.Value), planned.Max(g => g.Height!.Value));
    }

    /// <summary>
    /// Whether the caller may choose <paramref name="formula"/>: always the one
    /// it is on (« Votre formule — conservée »), any other only if it holds
    /// every garden. The reasons are listed either way.
    /// </summary>
    private static FormulaAvailabilityDto Availability(
        FormulaDefinition formula,
        string currentFormula,
        IReadOnlyCollection<GardenDimensions> gardens)
    {
        var reasons = FormulaCatalog.ShortfallsFor(formula, gardens);
        var current = formula.Key == currentFormula;
        return new FormulaAvailabilityDto(
            formula.Key,
            current,
            current || reasons.Count == 0,
            [.. reasons.Select(FormulaDtos.From)]);
    }

    private string? GetCurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);
}
