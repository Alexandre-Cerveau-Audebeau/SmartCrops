namespace SmartCrops.Api.Controllers;

/// <summary>
/// The one place the user-supplied <c>lang</c> query value is normalized —
/// shared by every controller that speaks the unified locale key
/// (<see cref="PlantsController"/>, <see cref="GardensController"/>).
/// </summary>
public static class LanguageCodes
{
    // Normalise the user-supplied lang code (default gracefully to "en" for
    // null/empty/whitespace or implausibly long input). Trim + lowercase so
    // "FR" / " fr " match the stored lower-case Language ("fr"). No
    // BadRequest/throw — the mappers + repositories already tolerate an
    // unknown code via the en fallback; this just keeps the input bounded,
    // canonical, and consistent across endpoints.
    public static string Normalize(string? lang)
    {
        var v = lang?.Trim();
        return string.IsNullOrEmpty(v) || v.Length > 10 ? "en" : v.ToLowerInvariant();
    }
}
