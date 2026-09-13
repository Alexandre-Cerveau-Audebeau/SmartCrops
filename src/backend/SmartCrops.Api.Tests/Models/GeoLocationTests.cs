using SmartCrops.Core.Entities;
using SmartCrops.Core.Models;

namespace SmartCrops.Api.Tests.Models;

/// <summary>
/// SMA-336 PR 3a/5, review round 1 (K4) — the projection guard of
/// <see cref="GeoLocation.Create"/>: a place needs a name AND both
/// coordinates; a blank name is no name, on both carriers.
/// </summary>
public class GeoLocationTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n")]
    public void Create_BlankName_IsNoLocation(string? name)
    {
        Assert.Null(GeoLocation.Create(name, "Auvergne-Rhône-Alpes", "France", 45.76, 4.84, DateTime.UtcNow));
    }

    [Fact]
    public void Create_NameAndPair_IsALocation()
    {
        var location = GeoLocation.Create("Lyon", null, "France", 45.76, 4.84, null);

        Assert.NotNull(location);
        Assert.Equal("Lyon", location!.Name);
        Assert.Equal(45.76, location.Latitude);
        Assert.Equal(4.84, location.Longitude);
    }

    [Theory]
    [InlineData(45.76, null)]
    [InlineData(null, 4.84)]
    [InlineData(null, null)]
    public void Create_HalfAPair_IsNoLocation(double? latitude, double? longitude)
    {
        Assert.Null(GeoLocation.Create("Lyon", null, null, latitude, longitude, null));
    }

    [Fact]
    public void From_Garden_WithBlankName_IsNoLocation()
    {
        var garden = new Garden { Id = Guid.NewGuid(), Name = "Terrasse", UserId = "u", LocationName = "  ", Latitude = 45.76, Longitude = 4.84 };

        Assert.Null(GeoLocation.From(garden));
    }

    [Fact]
    public void From_User_WithBlankName_IsNoLocation()
    {
        var user = new ApplicationUser { Id = "u", LocationName = "", Latitude = 45.76, Longitude = 4.84 };

        Assert.Null(GeoLocation.From(user));
    }
}
