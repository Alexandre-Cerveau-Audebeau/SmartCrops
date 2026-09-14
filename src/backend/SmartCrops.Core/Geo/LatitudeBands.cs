namespace SmartCrops.Core.Geo;

/// <summary>
/// SMA-336 PR 3a/5 — the two exposure inputs a latitude can PRE-FILL:
/// <c>Garden.Hemisphere</c> (« N » / « S ») and <c>Garden.LatitudeBand</c>
/// (« low » / « mid » / « high »). Pure, so the rule is testable at its exact
/// bounds and reusable by any writer of a location.
///
/// <para>The writer applies it ONLY where the garden carries no value yet —
/// a hemisphere or a band the user set by hand is never overwritten. This is
/// what the config dialog announced for the exposure engine's inputs:
/// « a future geolocation API will pre-fill both from the user's real
/// latitude without changing the stored contract ».</para>
///
/// <para>The bounds are ARBITRARY and recorded as such: 23.5° is the
/// tropics' edge, the natural end of « low » (the band's own label says
/// « tropicale »); 60° is where « high » starts, chosen because the band's
/// label says « subpolaire » and the sub-polar belt is usually drawn from
/// there — a temperate garden in Oslo (59.9°) stays « mid ». Either bound
/// may move with the exposure engine; nothing else depends on them.</para>
/// </summary>
public static class LatitudeBands
{
    /// <summary>Absolute latitude below which the band is « low » (tropical).</summary>
    public const double TropicalLimitDegrees = 23.5;

    /// <summary>Absolute latitude from which the band is « high » (sub-polar).</summary>
    public const double SubpolarLimitDegrees = 60.0;

    public const string North = "N";
    public const string South = "S";
    public const string Low = "low";
    public const string Mid = "mid";
    public const string High = "high";

    /// <summary>
    /// The hemisphere and the latitude band a latitude implies. The equator
    /// itself reads as the northern hemisphere: the exposure engine's own
    /// default, and there is no better answer for 0°.
    /// </summary>
    /// <param name="latitude">Decimal degrees, −90..90.</param>
    public static (string Hemisphere, string Band) Derive(double latitude)
    {
        var hemisphere = latitude >= 0 ? North : South;
        var absolute = Math.Abs(latitude);
        var band = absolute < TropicalLimitDegrees ? Low
            : absolute < SubpolarLimitDegrees ? Mid
            : High;
        return (hemisphere, band);
    }
}
