using SmartCrops.Core.Entities;

namespace SmartCrops.Core.Models;

/// <summary>
/// SMA-336 PR 3a/5 — a resolved place: what the geocoder answered, as stored
/// on a garden (an override) or on the account (the default every garden
/// without an override inherits). ONE record for the two carriers, so the
/// read rule — the garden's own location, else the account's — is written
/// once (ADR-0006) and every consumer gets the same shape.
///
/// <para>The six stored columns are the same on both tables; this record is
/// the non-null projection of them. A carrier whose coordinates or name are
/// NULL has no location: the columns are only ever written together (the
/// endpoints validate the name, the database enforces the coordinate pair),
/// so a partial row is data this build did not write and reads as « not
/// located » rather than as a place with a hole in it.</para>
/// </summary>
/// <param name="Name">Normalized place name as the geocoder returned it (« Lyon »).</param>
/// <param name="Region">Region or state, or null.</param>
/// <param name="Country">Country NAME as the geocoder returned it — never an ISO code.</param>
/// <param name="Latitude">Decimal degrees, −90..90.</param>
/// <param name="Longitude">Decimal degrees, −180..180.</param>
/// <param name="ResolvedAt">UTC instant the location was resolved (ADR-0001); null on a row written before it was stamped.</param>
public sealed record GeoLocation(
    string Name,
    string? Region,
    string? Country,
    double Latitude,
    double Longitude,
    DateTime? ResolvedAt)
{
    /// <summary>The garden's OWN location (its override), or null when it has none.</summary>
    public static GeoLocation? From(Garden garden) => Create(
        garden.LocationName,
        garden.LocationRegion,
        garden.LocationCountry,
        garden.Latitude,
        garden.Longitude,
        garden.LocationResolvedAt);

    /// <summary>The account's DEFAULT location, or null when the user never set one.</summary>
    public static GeoLocation? From(ApplicationUser user) => Create(
        user.LocationName,
        user.LocationRegion,
        user.LocationCountry,
        user.Latitude,
        user.Longitude,
        user.LocationResolvedAt);

    /// <summary>
    /// The same projection from the six raw columns — for a query that
    /// selects them without materializing the carrier.
    /// </summary>
    public static GeoLocation? Create(
        string? name,
        string? region,
        string? country,
        double? latitude,
        double? longitude,
        DateTime? resolvedAt)
    {
        if (name is null || latitude is null || longitude is null) return null;
        return new GeoLocation(name, region, country, latitude.Value, longitude.Value, resolvedAt);
    }

    /// <summary>
    /// Writes this location onto a garden, every column at once. The caller
    /// saves; <see cref="ResolvedAt"/> is expected to be stamped by the writer.
    /// </summary>
    public void ApplyTo(Garden garden)
    {
        garden.LocationName = Name;
        garden.LocationRegion = Region;
        garden.LocationCountry = Country;
        garden.Latitude = Latitude;
        garden.Longitude = Longitude;
        garden.LocationResolvedAt = ResolvedAt;
    }

    /// <summary>Writes this location onto an account as its default, every column at once.</summary>
    public void ApplyTo(ApplicationUser user)
    {
        user.LocationName = Name;
        user.LocationRegion = Region;
        user.LocationCountry = Country;
        user.Latitude = Latitude;
        user.Longitude = Longitude;
        user.LocationResolvedAt = ResolvedAt;
    }

    /// <summary>Clears the garden's own location — it then inherits the account's default again.</summary>
    public static void Clear(Garden garden)
    {
        garden.LocationName = null;
        garden.LocationRegion = null;
        garden.LocationCountry = null;
        garden.Latitude = null;
        garden.Longitude = null;
        garden.LocationResolvedAt = null;
    }

    /// <summary>Clears the account's default location.</summary>
    public static void Clear(ApplicationUser user)
    {
        user.LocationName = null;
        user.LocationRegion = null;
        user.LocationCountry = null;
        user.Latitude = null;
        user.Longitude = null;
        user.LocationResolvedAt = null;
    }

}
