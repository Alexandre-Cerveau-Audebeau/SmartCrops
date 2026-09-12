namespace SmartCrops.Api.DTOs;

/// <summary>
/// SMA-336 PR 3a/5 — one match of <c>GET /api/geocode/search</c>: exactly what
/// the location endpoints accept back, so the browser stores a result it was
/// handed and never invents one. The provider's own id and URL slug are not
/// carried: nothing reads them, and a stored location must not depend on a
/// provider identifier.
/// </summary>
/// <param name="Name">Normalized place name (« Lyon »).</param>
/// <param name="Region">Region or state (« Auvergne-Rhône-Alpes »), or null.</param>
/// <param name="Country">Country NAME as the provider returned it — never an ISO code.</param>
/// <param name="Latitude">Decimal degrees, −90..90.</param>
/// <param name="Longitude">Decimal degrees, −180..180.</param>
public record GeocodeResultResponse(
    string Name,
    string? Region,
    string? Country,
    double Latitude,
    double Longitude);
