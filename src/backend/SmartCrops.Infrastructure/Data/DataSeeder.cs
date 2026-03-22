using Microsoft.EntityFrameworkCore;
using SmartCrops.Core.Entities;

namespace SmartCrops.Infrastructure.Data;

public static class DataSeeder
{
    public static async Task SeedAsync(SmartCropsDbContext context)
    {
        if (await context.Plants.AnyAsync())
            return;

        var now = DateTime.UtcNow;

        var plants = new List<Plant>
        {
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Solanum lycopersicum",
                PlantTypeId = 1, // Vegetable
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "march-april",
                HarvestPeriod = "july-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Tomato", Description = "A widely grown fruit vegetable, rich in lycopene and vitamin C." },
                    new() { Language = "fr", CommonName = "Tomate", Description = "Légume-fruit très cultivé, riche en lycopène et en vitamine C." },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Ocimum basilicum",
                PlantTypeId = 3, // Herb
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                SowingPeriod = "april-may",
                HarvestPeriod = "june-september",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Basil", Description = "An aromatic herb widely used in Mediterranean cuisine." },
                    new() { Language = "fr", CommonName = "Basilic", Description = "Herbe aromatique très utilisée dans la cuisine méditerranéenne." },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Rosa",
                PlantTypeId = 4, // Ornamental
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Rose", Description = "A classic ornamental shrub prized for its fragrant blooms." },
                    new() { Language = "fr", CommonName = "Rose", Description = "Arbuste ornemental classique, apprécié pour ses fleurs parfumées." },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Lavandula",
                PlantTypeId = 5, // Medicinal
                SunExposure = "full_sun",
                WaterNeeds = "low",
                SowingPeriod = "march-may",
                HarvestPeriod = "june-august",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Lavender", Description = "A fragrant medicinal plant known for its calming properties." },
                    new() { Language = "fr", CommonName = "Lavande", Description = "Plante médicinale parfumée connue pour ses propriétés apaisantes." },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Fragaria × ananassa",
                PlantTypeId = 2, // Fruit
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "february-march",
                HarvestPeriod = "may-july",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Strawberry", Description = "A popular soft fruit with a sweet flavour, rich in vitamin C." },
                    new() { Language = "fr", CommonName = "Fraise", Description = "Fruit rouge populaire au goût sucré, riche en vitamine C." },
                ],
            },
        };

        await context.Plants.AddRangeAsync(plants);
        await context.SaveChangesAsync();
    }
}
