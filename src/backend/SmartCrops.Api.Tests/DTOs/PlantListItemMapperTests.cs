using SmartCrops.Api.DTOs;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;

namespace SmartCrops.Api.Tests.DTOs;

/// <summary>
/// Unit tests for <see cref="PlantListItemMapper"/> image selection (SMA-118).
/// Perenual <c>Main</c> images are expired signed S3 URLs (HTTP 403), so the list
/// card must surface a STABLE-source image (Trefle/PlantNet) when one exists and
/// <c>null</c> (→ client placeholder) otherwise — never the dead Perenual URL.
/// </summary>
public class PlantListItemMapperTests
{
    private static Plant PlantWith(params PlantImage[] images) => new()
    {
        Id = Guid.NewGuid(),
        ScientificName = "Solanum lycopersicum",
        PlantTypeId = 1,
        Images = images,
    };

    private static PlantImage Image(PlantSourceType source, PlantImageType type, string url, int displayOrder = 0) => new()
    {
        Source = source,
        ImageType = type,
        Url = url,
        DisplayOrder = displayOrder,
    };

    [Fact]
    public void ToListItem_PrefersStableTrefleImage_OverPerenualMain()
    {
        var plant = PlantWith(
            Image(PlantSourceType.Perenual, PlantImageType.Main, "https://s3.wasabisys.com/perenual/expired.jpg?X-Amz-Expires=86400"),
            Image(PlantSourceType.Trefle, PlantImageType.Habit, "https://bs.plantnet.org/stable-habit.jpg"));

        var dto = PlantListItemMapper.ToListItem(plant);

        Assert.Equal("https://bs.plantnet.org/stable-habit.jpg", dto.ImageUrl);
        Assert.NotNull(dto.ImageAttribution);
    }

    [Fact]
    public void ToListItem_PerenualOnly_YieldsNullImageUrl_NotTheDeadUrl()
    {
        var plant = PlantWith(
            Image(PlantSourceType.Perenual, PlantImageType.Main, "https://s3.wasabisys.com/perenual/expired.jpg?X-Amz-Expires=86400"));

        var dto = PlantListItemMapper.ToListItem(plant);

        Assert.Null(dto.ImageUrl);
        Assert.Null(dto.ImageAttribution);
    }

    [Fact]
    public void ToListItem_NoImages_YieldsNullImageUrl()
    {
        var dto = PlantListItemMapper.ToListItem(PlantWith());

        Assert.Null(dto.ImageUrl);
        Assert.Null(dto.ImageAttribution);
    }

    [Fact]
    public void ToListItem_PicksCoverTypeByPriority_HabitOverLeaf()
    {
        var plant = PlantWith(
            Image(PlantSourceType.Trefle, PlantImageType.Leaf, "https://bs.plantnet.org/leaf.jpg"),
            Image(PlantSourceType.Trefle, PlantImageType.Habit, "https://bs.plantnet.org/habit.jpg"));

        var dto = PlantListItemMapper.ToListItem(plant);

        Assert.Equal("https://bs.plantnet.org/habit.jpg", dto.ImageUrl);
    }

    [Fact]
    public void ToListItem_SurfacesRequestedLanguageTranslation()
    {
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = "Solanum lycopersicum",
            PlantTypeId = 1,
            Translations =
            [
                new PlantTranslation { Language = "en", CommonName = "Tomato", Description = "A red fruit." },
                new PlantTranslation { Language = "fr", CommonName = "Tomate", Description = "Un fruit rouge." },
            ],
        };

        var dto = PlantListItemMapper.ToListItem(plant, "fr");

        Assert.Equal("Tomate", dto.CommonName);
        Assert.Equal("Un fruit rouge.", dto.Description);
    }

    [Fact]
    public void ToListItem_FallsBackToEnglish_WhenRequestedLanguageMissing()
    {
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = "Solanum lycopersicum",
            PlantTypeId = 1,
            Translations =
            [
                new PlantTranslation { Language = "en", CommonName = "Tomato", Description = "A red fruit." },
            ],
        };

        var dto = PlantListItemMapper.ToListItem(plant, "fr");

        Assert.Equal("Tomato", dto.CommonName);
    }

    [Fact]
    public void ToListItem_NoTranslations_YieldsNullCommonName()
    {
        var dto = PlantListItemMapper.ToListItem(PlantWith(), "en");

        Assert.Null(dto.CommonName);
        Assert.Null(dto.Description);
    }
}
