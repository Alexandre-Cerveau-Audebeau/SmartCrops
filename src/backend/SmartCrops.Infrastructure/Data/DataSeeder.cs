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
            // ── Vegetables (PlantTypeId = 1) ─────────────────────────
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Solanum lycopersicum",
                PlantTypeId = 1,
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "march-april",
                HarvestPeriod = "july-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Tomato" },
                    new() { Language = "fr", CommonName = "Tomate" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Daucus carota",
                PlantTypeId = 1,
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "march-june",
                HarvestPeriod = "june-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Carrot" },
                    new() { Language = "fr", CommonName = "Carotte" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Cucurbita pepo",
                PlantTypeId = 1,
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "april-june",
                HarvestPeriod = "july-september",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Zucchini" },
                    new() { Language = "fr", CommonName = "Courgette" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Lactuca sativa",
                PlantTypeId = 1,
                SunExposure = "partial_shade",
                WaterNeeds = "regular",
                SowingPeriod = "march-september",
                HarvestPeriod = "may-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Lettuce" },
                    new() { Language = "fr", CommonName = "Laitue" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Capsicum annuum",
                PlantTypeId = 1,
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "february-may",
                HarvestPeriod = "july-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Bell Pepper" },
                    new() { Language = "fr", CommonName = "Poivron" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Phaseolus vulgaris",
                PlantTypeId = 1,
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                SowingPeriod = "may-july",
                HarvestPeriod = "july-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Green Bean" },
                    new() { Language = "fr", CommonName = "Haricot vert" },
                ],
            },

            // ── Fruits (PlantTypeId = 2) ─────────────────────────────
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Fragaria × ananassa",
                PlantTypeId = 2,
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "february-march",
                HarvestPeriod = "may-july",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Strawberry" },
                    new() { Language = "fr", CommonName = "Fraise" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Rubus idaeus",
                PlantTypeId = 2,
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "november-march",
                HarvestPeriod = "june-september",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Raspberry" },
                    new() { Language = "fr", CommonName = "Framboise" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Vaccinium corymbosum",
                PlantTypeId = 2,
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "october-march",
                HarvestPeriod = "july-august",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Blueberry" },
                    new() { Language = "fr", CommonName = "Myrtille" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Ficus carica",
                PlantTypeId = 2,
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                SowingPeriod = "october-march",
                HarvestPeriod = "august-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Fig" },
                    new() { Language = "fr", CommonName = "Figue" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Vitis vinifera",
                PlantTypeId = 2,
                SunExposure = "full_sun",
                WaterNeeds = "low",
                SowingPeriod = "november-march",
                HarvestPeriod = "september-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Grape" },
                    new() { Language = "fr", CommonName = "Raisin" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Malus domestica",
                PlantTypeId = 2,
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "november-march",
                HarvestPeriod = "september-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Apple" },
                    new() { Language = "fr", CommonName = "Pomme" },
                ],
            },

            // ── Herbs (PlantTypeId = 3) ──────────────────────────────
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Ocimum basilicum",
                PlantTypeId = 3,
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                SowingPeriod = "april-may",
                HarvestPeriod = "june-september",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Basil" },
                    new() { Language = "fr", CommonName = "Basilic" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Mentha spicata",
                PlantTypeId = 3,
                SunExposure = "partial_shade",
                WaterNeeds = "regular",
                SowingPeriod = "march-may",
                HarvestPeriod = "june-september",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Mint" },
                    new() { Language = "fr", CommonName = "Menthe" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Salvia rosmarinus",
                PlantTypeId = 3,
                SunExposure = "full_sun",
                WaterNeeds = "low",
                SowingPeriod = "march-may",
                HarvestPeriod = "year-round",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Rosemary" },
                    new() { Language = "fr", CommonName = "Romarin" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Thymus vulgaris",
                PlantTypeId = 3,
                SunExposure = "full_sun",
                WaterNeeds = "low",
                SowingPeriod = "march-may",
                HarvestPeriod = "june-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Thyme" },
                    new() { Language = "fr", CommonName = "Thym" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Petroselinum crispum",
                PlantTypeId = 3,
                SunExposure = "partial_shade",
                WaterNeeds = "regular",
                SowingPeriod = "march-june",
                HarvestPeriod = "june-november",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Parsley" },
                    new() { Language = "fr", CommonName = "Persil" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Coriandrum sativum",
                PlantTypeId = 3,
                SunExposure = "partial_shade",
                WaterNeeds = "moderate",
                SowingPeriod = "march-september",
                HarvestPeriod = "may-november",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Cilantro" },
                    new() { Language = "fr", CommonName = "Coriandre" },
                ],
            },

            // ── Ornamental (PlantTypeId = 4) ─────────────────────────
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Helianthus annuus",
                PlantTypeId = 4,
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                SowingPeriod = "april-june",
                HarvestPeriod = "july-september",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Sunflower" },
                    new() { Language = "fr", CommonName = "Tournesol" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Rosa gallica",
                PlantTypeId = 4,
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "november-march",
                HarvestPeriod = "june-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Rose" },
                    new() { Language = "fr", CommonName = "Rose" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Dahlia pinnata",
                PlantTypeId = 4,
                SunExposure = "full_sun",
                WaterNeeds = "regular",
                SowingPeriod = "april-may",
                HarvestPeriod = "july-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Dahlia" },
                    new() { Language = "fr", CommonName = "Dahlia" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Hydrangea macrophylla",
                PlantTypeId = 4,
                SunExposure = "partial_shade",
                WaterNeeds = "regular",
                SowingPeriod = "october-march",
                HarvestPeriod = "june-september",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Hydrangea" },
                    new() { Language = "fr", CommonName = "Hortensia" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Tulipa gesneriana",
                PlantTypeId = 4,
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                SowingPeriod = "september-december",
                HarvestPeriod = "april-may",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Tulip" },
                    new() { Language = "fr", CommonName = "Tulipe" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Jasminum officinale",
                PlantTypeId = 4,
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                SowingPeriod = "october-march",
                HarvestPeriod = "june-september",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Jasmine" },
                    new() { Language = "fr", CommonName = "Jasmin" },
                ],
            },

            // ── Medicinal (PlantTypeId = 5) ──────────────────────────
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Lavandula",
                PlantTypeId = 5,
                SunExposure = "full_sun",
                WaterNeeds = "low",
                SowingPeriod = "march-may",
                HarvestPeriod = "june-august",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Lavender" },
                    new() { Language = "fr", CommonName = "Lavande" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Matricaria chamomilla",
                PlantTypeId = 5,
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                SowingPeriod = "march-may",
                HarvestPeriod = "june-september",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Chamomile" },
                    new() { Language = "fr", CommonName = "Camomille" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Aloe vera",
                PlantTypeId = 5,
                SunExposure = "full_sun",
                WaterNeeds = "low",
                SowingPeriod = "year-round",
                HarvestPeriod = "year-round",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Aloe Vera" },
                    new() { Language = "fr", CommonName = "Aloe vera" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Echinacea purpurea",
                PlantTypeId = 5,
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                SowingPeriod = "march-may",
                HarvestPeriod = "july-september",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Echinacea" },
                    new() { Language = "fr", CommonName = "Échinacée" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Salvia officinalis",
                PlantTypeId = 5,
                SunExposure = "full_sun",
                WaterNeeds = "low",
                SowingPeriod = "march-may",
                HarvestPeriod = "year-round",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Sage" },
                    new() { Language = "fr", CommonName = "Sauge" },
                ],
            },
            new()
            {
                Id = Guid.NewGuid(),
                ScientificName = "Calendula officinalis",
                PlantTypeId = 5,
                SunExposure = "full_sun",
                WaterNeeds = "moderate",
                SowingPeriod = "march-june",
                HarvestPeriod = "june-october",
                CreatedAt = now,
                UpdatedAt = now,
                Translations =
                [
                    new() { Language = "en", CommonName = "Calendula" },
                    new() { Language = "fr", CommonName = "Souci" },
                ],
            },
        };

        await context.Plants.AddRangeAsync(plants);
        await context.SaveChangesAsync();
    }
}
