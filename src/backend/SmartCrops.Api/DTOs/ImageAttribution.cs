using SmartCrops.Core.Enums;

namespace SmartCrops.Api.DTOs;

/// <summary>
/// Composes a complete, always-present attribution line for a plant image from
/// the attribution metadata already in the database (SMA-70). It does NOT fill
/// missing data — backfilling structured license/credit columns is SMA-71. The
/// inputs are asymmetric by source: Trefle rows carry a full <c>Credit</c>
/// string ("Taken … by Author (cc-by-sa)") but no structured license; Perenual
/// rows carry a <c>LicenseName</c> but no credit. This helper turns either into
/// a usable, non-null attribution so the frontend never renders a licensed image
/// without one.
/// </summary>
public static class ImageAttribution
{
    /// <summary>Perenual content license terms (CC BY-SA), used when a Perenual row has no LicenseUrl.</summary>
    public const string PerenualLicenseUrl = "https://creativecommons.org/licenses/by-sa/4.0/";

    /// <summary>Trefle content license terms (CC BY-SA), used when a Trefle row has no LicenseUrl.</summary>
    public const string TrefleLicenseUrl = "https://creativecommons.org/licenses/by-sa/4.0/";

    /// <summary>
    /// Build the attribution string. Priority: the source-provided
    /// <paramref name="credit"/> (Trefle already embeds author + license); else
    /// <c>"© {Source} — {LicenseName}"</c> when a license name exists (Perenual);
    /// else a bare <c>"© {Source}"</c> so the line is never empty.
    /// </summary>
    public static string Compose(string? credit, string? licenseName, PlantSourceType source)
    {
        if (!string.IsNullOrWhiteSpace(credit)) return credit.Trim();
        if (!string.IsNullOrWhiteSpace(licenseName)) return $"© {source} — {licenseName.Trim()}";
        return $"© {source}";
    }

    /// <summary>
    /// Return the stored <paramref name="licenseUrl"/> when present, else the
    /// per-source fallback license-terms URL (both CC BY-SA today). Null only for
    /// an unrecognised source with no stored URL.
    /// </summary>
    public static string? LicenseUrlOrFallback(string? licenseUrl, PlantSourceType source)
    {
        if (!string.IsNullOrWhiteSpace(licenseUrl)) return licenseUrl;
        return source switch
        {
            PlantSourceType.Perenual => PerenualLicenseUrl,
            PlantSourceType.Trefle => TrefleLicenseUrl,
            _ => null,
        };
    }
}
