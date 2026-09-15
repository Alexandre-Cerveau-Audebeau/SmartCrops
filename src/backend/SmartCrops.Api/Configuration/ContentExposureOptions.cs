namespace SmartCrops.Api.Configuration;

/// <summary>
/// Options binding for the <c>"ContentExposure"</c> section of
/// <c>appsettings.json</c>. Controls how much licensed third-party source text
/// (Perenual long descriptions and free-text care fields) the public read API
/// surfaces, without a code change (SMA-70).
///
/// <para><see cref="ExposeSourceText"/> defaults to <c>false</c>: the public
/// detail endpoint omits the Perenual narrative + free-text fields and ships
/// only the factual, non-copyrightable data (hardiness, temperatures, pH,
/// dimensions, numeric xData, flags, taxonomy). Flip it to <c>true</c> (e.g. once
/// a redistribution agreement is in place) to re-expose the source text with no
/// recompile.</para>
///
/// <para>NOT behind the gate, by decision — short factual values from the
/// Perenual row: <c>PropagationMethods</c>, <c>WateringBenchmark</c> (+ unit),
/// <c>PruningMonths</c> (SMA-231), and since SMA-336 PR 4a/5 (decision Q2 of the
/// PR 4 pre-flight) <c>FloweringSeason</c> and <c>HarvestSeason</c>: each is ONE
/// word of a closed list of five (Spring / Summer / Autumn / Fall / Winter), of
/// the same nature as a month list, not prose. The detail mapper exposes them
/// unconditionally and the dashboard aggregate transports them; a future lot
/// must not re-gate them. What stays gated: <c>OriginCountries</c>,
/// <c>SunlightPreferences</c>, <c>Maintenance</c>, the long descriptions, the
/// sowing / propagation instructions and the edible parts.</para>
/// </summary>
public class ContentExposureOptions
{
    public const string SectionName = "ContentExposure";

    /// <summary>
    /// When <c>false</c> (default), gate the licensed Perenual source text out of
    /// the public detail response (long descriptions, sowing/propagation
    /// instructions, edible parts, and the Perenual free-text care fields). The
    /// list endpoints never carry this text regardless (they use a neutral DTO).
    /// </summary>
    public bool ExposeSourceText { get; set; }
}
