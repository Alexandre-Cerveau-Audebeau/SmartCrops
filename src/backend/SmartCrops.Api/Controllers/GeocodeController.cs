using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartCrops.Api.DTOs;
using SmartCrops.Infrastructure.ExternalApis.WeatherApi;

namespace SmartCrops.Api.Controllers;

/// <summary>
/// SMA-336 PR 3a/5 — <c>GET /api/geocode/search?q=</c>: the place lookup
/// behind the « Ville ou code postal » field. The browser never calls the
/// provider itself — the key travels in the provider's query string — so this
/// endpoint fronts it, authenticated and behind the <c>"geocode"</c>
/// rate-limit policy (an autocomplete field calls it on every pause in the
/// typing).
///
/// <para>Three answers, none of them a provider message. A query too short or
/// too long is refused BEFORE any call (400). « Nothing matches » — the
/// provider's code 1006 or an empty array, which the client treats alike — is
/// an empty list (200), never an error: the user simply keeps typing. Every
/// other failure (a refusal, a transport error, a rejected or missing key) is
/// a neutral 503 whose body says only that geocoding is unavailable; the
/// cause is in the server log.</para>
/// </summary>
[ApiController]
[Route("api/geocode")]
[Authorize]
[EnableRateLimiting("geocode")]
public class GeocodeController(
    WeatherApiClient weatherApi,
    ILogger<GeocodeController> logger) : ControllerBase
{
    /// <summary>Shortest query forwarded: below it a lookup answers half the planet.</summary>
    internal const int MinQueryLength = 2;

    /// <summary>Longest query forwarded: a place name, a postal code — not a paragraph.</summary>
    internal const int MaxQueryLength = 100;

    /// <summary>The 503 body — one neutral word, the same for every cause.</summary>
    internal const string UnavailableError = "geocoding unavailable";

    /// <summary>
    /// Matches for a free-text place query, as the location endpoints accept
    /// them back.
    /// </summary>
    /// <param name="q">City name or postal code; trimmed, 2 to 100 characters.</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpGet("search")]
    public async Task<ActionResult<List<GeocodeResultResponse>>> Search(
        [FromQuery] string? q,
        CancellationToken ct = default)
    {
        var query = q?.Trim() ?? string.Empty;
        if (query.Length < MinQueryLength || query.Length > MaxQueryLength)
        {
            return BadRequest(new { error = $"q must be between {MinQueryLength} and {MaxQueryLength} characters" });
        }

        var result = await weatherApi.SearchAsync(query, ct);

        if (result.IsSuccess)
        {
            // A match the provider returned without a name or a coordinate is
            // not a place the location endpoints could store: dropped here so
            // the browser never offers it.
            var matches = result.Value.Locations
                .Where(l => !string.IsNullOrWhiteSpace(l.Name) && l.Lat is not null && l.Lon is not null)
                .Select(l => new GeocodeResultResponse(l.Name!, l.Region, l.Country, l.Lat!.Value, l.Lon!.Value))
                .ToList();
            return Ok(matches);
        }

        if (result.Failure.Kind == WeatherApiFailureKind.NoLocation)
        {
            return Ok(new List<GeocodeResultResponse>());
        }

        // The client has already logged the cause with its code; this line ties
        // it to the endpoint so an operator can read the sequence.
        logger.LogWarning(
            "Geocode search unavailable: provider failure {Kind} (code {Code}, HTTP {Status})",
            result.Failure.Kind, result.Failure.ProviderCode, result.Failure.HttpStatus);
        return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = UnavailableError });
    }
}
