using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Dashboard;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Controllers;

/// <summary>
/// SMA-448, lot F1 — the formulas. The formula is a RIGHT on the account
/// (<c>AspNetUsers."Formula"</c>), and the API is the one source of what each
/// formula permits: <see cref="GetFormulas"/> serves the catalogue the rest of
/// the server refuses by (<see cref="FormulaCatalog"/>), and the caller's own
/// state against it. Scoped to the caller, like every dashboard endpoint.
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
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<FormulasResponse>> GetFormulas(CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var account = await context.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.Formula, u.FormulaChosenAt })
            .SingleOrDefaultAsync(ct);
        if (account is null) return Unauthorized();

        var gardens = await LoadGardenDimensionsAsync(userId, ct);

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
