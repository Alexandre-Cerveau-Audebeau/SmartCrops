using SmartCrops.Core.Geo;

namespace SmartCrops.Api.Tests.Geo;

/// <summary>
/// SMA-336 PR 3a/5 — the pre-fill rule at its exact bounds: 23.5° opens
/// « mid », 60° opens « high », the equator reads as the northern hemisphere,
/// and the southern hemisphere uses the same absolute bounds.
/// </summary>
public class LatitudeBandsTests
{
    [Theory]
    [InlineData(0.0, "N", "low")]        // the equator: northern by convention
    [InlineData(10.0, "N", "low")]
    [InlineData(23.49, "N", "low")]
    [InlineData(23.5, "N", "mid")]       // the tropics' edge opens « mid »
    [InlineData(45.76, "N", "mid")]      // Lyon
    [InlineData(59.99, "N", "mid")]      // Oslo stays temperate
    [InlineData(60.0, "N", "high")]      // the sub-polar bound opens « high »
    [InlineData(90.0, "N", "high")]
    [InlineData(-0.01, "S", "low")]
    [InlineData(-23.5, "S", "mid")]
    [InlineData(-33.87, "S", "mid")]     // Sydney
    [InlineData(-60.0, "S", "high")]
    [InlineData(-90.0, "S", "high")]
    public void Derive_ReturnsHemisphereAndBand(double latitude, string hemisphere, string band)
    {
        var result = LatitudeBands.Derive(latitude);

        Assert.Equal(hemisphere, result.Hemisphere);
        Assert.Equal(band, result.Band);
    }

    [Fact]
    public void Bounds_AreTheRecordedArbitraryValues()
    {
        // Named here so a change to either bound is a deliberate edit of two
        // files, not a drift of one.
        Assert.Equal(23.5, LatitudeBands.TropicalLimitDegrees);
        Assert.Equal(60.0, LatitudeBands.SubpolarLimitDegrees);
    }
}
