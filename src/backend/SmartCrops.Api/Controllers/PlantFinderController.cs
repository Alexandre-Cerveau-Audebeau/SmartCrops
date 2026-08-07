using Microsoft.AspNetCore.Mvc;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;
using Typesense;

namespace SmartCrops.Api.Controllers;

/// <summary>
/// Public faceted plant finder (SMA-255 T3): text search + structured facet
/// filters + facet counts + pagination, served by the Typesense index and
/// hydrated from Postgres. Anonymous like the Library list endpoints. This is
/// the catalogue's only search path — the v2 Library consumes it directly.
///
/// Query-string contract (ASP.NET default binding): scalars as
/// <c>?q=...&amp;lang=fr&amp;page=2&amp;perPage=24</c>, multi-selects as
/// repeated keys (<c>?careLevels=Easy&amp;careLevels=Medium</c>), tri-state
/// booleans as <c>?isEdible=true</c>, ranges as
/// <c>?hardinessZoneMin=4&amp;hardinessZoneMax=9</c>. See
/// <see cref="PlantSearchQuery"/> for the full parameter roster. The display
/// language binds as <c>lang</c> — the same key as the legacy list endpoints
/// (CodeRabbit alignment) — NOT <c>language</c>, which is ignored.
/// </summary>
[ApiController]
[Route("api/plants/finder")]
public class PlantFinderController : ControllerBase
{
    private readonly IPlantSearchService _search;
    private readonly IPlantRepository _plants;
    private readonly ILogger<PlantFinderController> _logger;

    public PlantFinderController(
        IPlantSearchService search,
        IPlantRepository plants,
        ILogger<PlantFinderController> logger)
    {
        _search = search;
        _plants = plants;
        _logger = logger;
    }

    /// <summary>
    /// Search the plant catalogue. Items come back fully hydrated as the same
    /// <see cref="PlantListItemResponse"/> the Library list serves (single
    /// PlantCard contract), in the engine's relevance order. Facet counts
    /// reflect the filtered result set and include the "unknown" bucket.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> Find(
        [FromQuery] PlantSearchQuery query,
        [FromQuery(Name = "lang")] string? lang = null,
        CancellationToken ct = default)
    {
        // The legacy list endpoints bind the display language as `lang`; this
        // endpoint follows suit. PlantSearchQuery is a Core domain type with
        // no ASP.NET reference, so the rename can't be an attribute on the
        // property — it lives here as an explicit alias: `lang` wins, a stray
        // `language=` key is deliberately overwritten (ignored), and absence
        // falls back to "en".
        query.Language = lang ?? "en";

        var errors = PlantSearchQueryValidator.Validate(query);
        if (errors.Count > 0)
            return BadRequest(string.Join(" ", errors));

        try
        {
            var result = await _search.SearchAsync(query, ct);

            var plants = await _plants.GetByIdsAsync(result.Ids, query.Language, ct);
            if (plants.Count != result.Ids.Count)
            {
                // Index drift (a plant deleted since the last reindex): serve
                // what exists rather than failing the whole page.
                var missing = result.Ids.Except(plants.Select(p => p.Id)).ToList();
                _logger.LogWarning(
                    "Finder hydration: {MissingCount} Typesense hit(s) missing in Postgres — skipped ({MissingIds})",
                    missing.Count, string.Join(", ", missing));
            }

            var items = plants
                .Select(p => PlantListItemMapper.ToListItem(p, query.Language))
                .ToList();

            return Ok(new PlantFinderResponse(
                items, result.Found, result.Page, result.PerPage, result.FacetCounts));
        }
        catch (ArgumentException ex)
        {
            // Defense-in-depth vocabulary/range guard in the filter builder —
            // normally unreachable behind PlantSearchQueryValidator.
            return BadRequest(ex.Message);
        }
        catch (Exception ex) when (ex is TypesenseApiException or HttpRequestException)
        {
            // Same failure contract as SearchIndexController (SMA-255 T2):
            // engine rejection or unreachable container is a 503, not an
            // opaque 500; cancellation falls through to the framework.
            _logger.LogError(ex, "Finder search failed — Typesense unreachable or rejected the request");
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                "Search engine unavailable; see server logs for detail.");
        }
    }
}
