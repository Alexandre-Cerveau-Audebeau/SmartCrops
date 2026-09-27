using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SmartCrops.Core.Dashboard;

namespace SmartCrops.Api.Controllers;

/// <summary>
/// SMA-448, lot F3, step L1 — the refusals a formula's limits produce, on the
/// wire: <b>403</b> <c>application/problem+json</c> (RFC 9457), a stable
/// <c>code</c> the client branches on, and the numbers the screen says
/// (pre-flight § C.4, decided by Alexandre on 26/09). 403 and not 400: the
/// request is understood and valid, the RIGHT is missing — and a 403 has no
/// other meaning on the gardens' routes, where ownership answers 404 and
/// authentication 401. The switch of formula keeps its own 409
/// <c>formula.tooSmall</c> (<see cref="FormulasController"/>): there the
/// STATE blocks, not the right.
/// </summary>
public static class FormulaRefusals
{
    /// <summary>The formula allows no more gardens.</summary>
    public const string GardenLimitCode = "formula.gardenLimit";

    /// <summary>The garden would grow beyond the formula's largest size.</summary>
    public const string GardenSizeCode = "formula.gardenSize";

    /// <summary>
    /// <c>{ code: "formula.gardenLimit", formula, limit, current }</c>: the
    /// formula, how many gardens it allows, how many the account has — three
    /// for three, or five for three on an account that kept its gardens.
    /// </summary>
    public static ObjectResult GardenLimit(FormulaDefinition formula, int current)
    {
        var problem = Problem("The formula allows no more gardens.");
        problem.Extensions["code"] = GardenLimitCode;
        problem.Extensions["formula"] = formula.Key;
        problem.Extensions["limit"] = formula.GardenLimit;
        problem.Extensions["current"] = current;
        return Forbidden(problem);
    }

    /// <summary>
    /// <c>{ code: "formula.gardenSize", formula, limit: { width, height },
    /// current: { width, height } | null, requested: { width, height } }</c>:
    /// the formula, its largest size, the garden's stored size (null before
    /// its first plan), and the size that was asked.
    /// </summary>
    public static ObjectResult GardenSize(FormulaDefinition formula, GardenSize? current, GardenSize requested)
    {
        var problem = Problem("The garden would grow beyond the formula's largest size.");
        problem.Extensions["code"] = GardenSizeCode;
        problem.Extensions["formula"] = formula.Key;
        problem.Extensions["limit"] = Size(formula.MaxGardenSize);
        problem.Extensions["current"] = current is null ? null : Size(current);
        problem.Extensions["requested"] = Size(requested);
        return Forbidden(problem);
    }

    private static object Size(GardenSize size) => new { width = size.Width, height = size.Height };

    private static ProblemDetails Problem(string title) => new()
    {
        Status = StatusCodes.Status403Forbidden,
        Title = title,
    };

    private static ObjectResult Forbidden(ProblemDetails problem) => new(problem)
    {
        StatusCode = StatusCodes.Status403Forbidden,
        ContentTypes = { "application/problem+json" },
    };
}
