using System.ComponentModel.DataAnnotations;
using SmartCrops.Core.Models;

namespace SmartCrops.Api.DTOs;

/// <summary>
/// SMA-336 PR 3a/5 — body of <c>PUT /api/gardens/{id}/location</c> and of
/// <c>PUT /api/auth/profile/location</c>: a place the browser was handed by
/// <c>GET /api/geocode/search</c>, sent back as is. The server validates its
/// FORM (a name, coordinates in range, lengths) and never re-geocodes it —
/// these are the user's own coordinates, the database enforces the pair.
/// </summary>
/// <param name="Name">Normalized place name (« Lyon »).</param>
/// <param name="Region">Region or state, or null.</param>
/// <param name="Country">Country NAME, or null.</param>
/// <param name="Latitude">Decimal degrees, −90..90.</param>
/// <param name="Longitude">Decimal degrees, −180..180.</param>
/// <remarks>
/// The ranges use the <c>double</c> overload of <see cref="RangeAttribute"/>
/// ON PURPOSE: <c>[Range(-90, 90)]</c> picks the <c>int</c> overload, which
/// converts the bound value to an integer before comparing — 90.5 rounds to
/// 90 and passes. The endpoint tests hold both bounds at a fraction of a
/// degree outside the range.
/// </remarks>
public record SaveLocationRequest(
    [Required, StringLength(120)] string Name,
    [StringLength(120)] string? Region,
    [StringLength(80)] string? Country,
    [Range(-90.0, 90.0)] double Latitude,
    [Range(-180.0, 180.0)] double Longitude)
{
    /// <summary>The stored form: trimmed, stamped now (UTC, ADR-0001).</summary>
    public GeoLocation ToGeoLocation(DateTime resolvedAtUtc) => new(
        Name.Trim(),
        string.IsNullOrWhiteSpace(Region) ? null : Region.Trim(),
        string.IsNullOrWhiteSpace(Country) ? null : Country.Trim(),
        Latitude,
        Longitude,
        resolvedAtUtc);
}

/// <summary>
/// A stored location on the wire — the EFFECTIVE one on a garden response,
/// with <see cref="LocationSources"/> saying where it came from.
/// </summary>
/// <param name="Name">Normalized place name.</param>
/// <param name="Region">Region or state, or null.</param>
/// <param name="Country">Country NAME, or null.</param>
/// <param name="Latitude">Decimal degrees.</param>
/// <param name="Longitude">Decimal degrees.</param>
/// <param name="ResolvedAt">UTC instant it was resolved; null on a row written before it was stamped.</param>
public record GardenLocationDto(
    string Name,
    string? Region,
    string? Country,
    double Latitude,
    double Longitude,
    DateTime? ResolvedAt)
{
    public static GardenLocationDto From(GeoLocation location) => new(
        location.Name,
        location.Region,
        location.Country,
        location.Latitude,
        location.Longitude,
        location.ResolvedAt);

    /// <summary>
    /// The location a garden reads and where it comes from: its own override
    /// first, else the account's default, else nothing (ADR-0006).
    /// </summary>
    public static (GardenLocationDto? Location, string? Source) Resolve(GeoLocation? own, GeoLocation? profileDefault)
    {
        if (own is not null) return (From(own), LocationSources.Garden);
        if (profileDefault is not null) return (From(profileDefault), LocationSources.Profile);
        return (null, null);
    }
}

/// <summary>Where a garden's effective location comes from — the vocabulary of <c>locationSource</c>.</summary>
public static class LocationSources
{
    /// <summary>The garden's own override.</summary>
    public const string Garden = "garden";

    /// <summary>The account's default, inherited.</summary>
    public const string Profile = "profile";
}
