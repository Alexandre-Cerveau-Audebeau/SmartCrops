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
                    new() { Language = "en", CommonName = "Tomato", Description = "A widely grown fruit vegetable, rich in lycopene and vitamin C." },
                    new() { Language = "fr", CommonName = "Tomate", Description = "Légume-fruit très cultivé, riche en lycopène et en vitamine C." },
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
                    new() { Language = "en", CommonName = "Carrot", Description = "A root vegetable that thrives in loose, sandy soil. Rich in beta-carotene and easy to grow." },
                    new() { Language = "fr", CommonName = "Carotte", Description = "Légume-racine qui pousse bien en sol meuble et sableux. Riche en bêta-carotène et facile à cultiver." },
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
                    new() { Language = "en", CommonName = "Zucchini", Description = "A prolific summer squash that produces abundantly in warm weather. Harvest when fruits are young for best flavour." },
                    new() { Language = "fr", CommonName = "Courgette", Description = "Courge d'été très productive par temps chaud. Récoltez les fruits jeunes pour une meilleure saveur." },
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
                    new() { Language = "en", CommonName = "Lettuce", Description = "A fast-growing leafy green that prefers cooler conditions. Ideal for successive sowings throughout the season." },
                    new() { Language = "fr", CommonName = "Laitue", Description = "Légume-feuille à croissance rapide qui préfère la fraîcheur. Idéal pour des semis successifs tout au long de la saison." },
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
                    new() { Language = "en", CommonName = "Bell Pepper", Description = "A warm-season vegetable that needs a long growing period. Fruits ripen from green to red, yellow, or orange." },
                    new() { Language = "fr", CommonName = "Poivron", Description = "Légume de saison chaude nécessitant une longue période de culture. Les fruits mûrissent du vert au rouge, jaune ou orange." },
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
                    new() { Language = "en", CommonName = "Green Bean", Description = "A productive warm-season legume that fixes nitrogen in the soil. Pick pods regularly to encourage continued production." },
                    new() { Language = "fr", CommonName = "Haricot vert", Description = "Légumineuse productive de saison chaude qui fixe l'azote dans le sol. Cueillez régulièrement pour prolonger la production." },
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
                    new() { Language = "en", CommonName = "Strawberry", Description = "A popular soft fruit with a sweet flavour, rich in vitamin C." },
                    new() { Language = "fr", CommonName = "Fraise", Description = "Fruit rouge populaire au goût sucré, riche en vitamine C." },
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
                    new() { Language = "en", CommonName = "Raspberry", Description = "A hardy cane fruit that produces sweet berries over several weeks. Prune old canes after fruiting to encourage new growth." },
                    new() { Language = "fr", CommonName = "Framboise", Description = "Fruit à tiges robuste qui produit des baies sucrées sur plusieurs semaines. Taillez les anciennes tiges après la récolte." },
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
                    new() { Language = "en", CommonName = "Blueberry", Description = "An acid-loving shrub that produces antioxidant-rich berries. Requires acidic soil with a pH between 4.5 and 5.5." },
                    new() { Language = "fr", CommonName = "Myrtille", Description = "Arbuste acidophile produisant des baies riches en antioxydants. Nécessite un sol acide avec un pH entre 4,5 et 5,5." },
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
                    new() { Language = "en", CommonName = "Fig", Description = "A Mediterranean tree that thrives in warm, sheltered spots. Produces sweet, honey-flavoured fruits with minimal care." },
                    new() { Language = "fr", CommonName = "Figue", Description = "Arbre méditerranéen qui prospère dans les endroits chauds et abrités. Produit des fruits sucrés au goût de miel avec peu d'entretien." },
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
                    new() { Language = "en", CommonName = "Grape", Description = "A vigorous climbing vine grown for table fruit or winemaking. Requires annual pruning and a sturdy support structure." },
                    new() { Language = "fr", CommonName = "Raisin", Description = "Vigne grimpante vigoureuse cultivée pour le fruit de table ou la vinification. Nécessite une taille annuelle et un support solide." },
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
                    new() { Language = "en", CommonName = "Apple", Description = "A versatile fruit tree suited to temperate climates. Most varieties need a pollination partner for good fruit set." },
                    new() { Language = "fr", CommonName = "Pomme", Description = "Arbre fruitier polyvalent adapté aux climats tempérés. La plupart des variétés nécessitent un pollinisateur pour une bonne fructification." },
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
                    new() { Language = "en", CommonName = "Basil", Description = "An aromatic herb widely used in Mediterranean cuisine." },
                    new() { Language = "fr", CommonName = "Basilic", Description = "Herbe aromatique très utilisée dans la cuisine méditerranéenne." },
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
                    new() { Language = "en", CommonName = "Mint", Description = "A vigorous spreading herb ideal for teas and desserts. Best grown in containers to prevent it from taking over the garden." },
                    new() { Language = "fr", CommonName = "Menthe", Description = "Herbe vigoureuse idéale pour les tisanes et desserts. À cultiver en pot pour éviter qu'elle n'envahisse le jardin." },
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
                    new() { Language = "en", CommonName = "Rosemary", Description = "A drought-tolerant evergreen herb with needle-like leaves. Excellent for roasting meats and flavouring bread." },
                    new() { Language = "fr", CommonName = "Romarin", Description = "Herbe persistante résistante à la sécheresse aux feuilles en aiguilles. Excellent pour les viandes rôties et le pain aromatisé." },
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
                    new() { Language = "en", CommonName = "Thyme", Description = "A compact perennial herb with a warm, earthy flavour. Thrives in poor, well-drained soil and full sunshine." },
                    new() { Language = "fr", CommonName = "Thym", Description = "Herbe vivace compacte au goût chaud et terreux. Prospère en sol pauvre et bien drainé, en plein soleil." },
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
                    new() { Language = "en", CommonName = "Parsley", Description = "A biennial herb rich in iron and vitamins. Slow to germinate but produces abundantly once established." },
                    new() { Language = "fr", CommonName = "Persil", Description = "Herbe bisannuelle riche en fer et en vitamines. Lente à germer mais très productive une fois établie." },
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
                    new() { Language = "en", CommonName = "Cilantro", Description = "A fast-growing herb whose leaves and seeds are used worldwide. Bolts quickly in heat, so sow successively." },
                    new() { Language = "fr", CommonName = "Coriandre", Description = "Herbe à croissance rapide dont les feuilles et graines sont utilisées partout. Monte vite en graines par temps chaud." },
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
                    new() { Language = "en", CommonName = "Sunflower", Description = "A tall annual that follows the sun and produces large seed heads. Easy to grow and attracts pollinators." },
                    new() { Language = "fr", CommonName = "Tournesol", Description = "Plante annuelle haute qui suit le soleil et produit de grandes têtes de graines. Facile à cultiver et attire les pollinisateurs." },
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
                    new() { Language = "en", CommonName = "Rose", Description = "A classic ornamental shrub prized for its fragrant blooms. Requires regular pruning and good air circulation to prevent disease." },
                    new() { Language = "fr", CommonName = "Rose", Description = "Arbuste ornemental classique apprécié pour ses fleurs parfumées. Nécessite une taille régulière et une bonne circulation d'air." },
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
                    new() { Language = "en", CommonName = "Dahlia", Description = "A tuberous perennial with spectacular blooms in many shapes and colours. Lift tubers before frost for winter storage." },
                    new() { Language = "fr", CommonName = "Dahlia", Description = "Vivace tubéreuse aux floraisons spectaculaires de formes et couleurs variées. Déterrez les tubercules avant le gel pour l'hiver." },
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
                    new() { Language = "en", CommonName = "Hydrangea", Description = "A shade-tolerant shrub with large flower clusters that change colour based on soil pH. Blue in acidic soil, pink in alkaline." },
                    new() { Language = "fr", CommonName = "Hortensia", Description = "Arbuste tolérant l'ombre avec de grandes grappes de fleurs dont la couleur varie selon le pH du sol. Bleu en sol acide, rose en sol alcalin." },
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
                    new() { Language = "en", CommonName = "Tulip", Description = "A spring-flowering bulb available in nearly every colour. Plant bulbs in autumn at three times their depth for best results." },
                    new() { Language = "fr", CommonName = "Tulipe", Description = "Bulbe à floraison printanière disponible dans presque toutes les couleurs. Plantez les bulbes en automne à trois fois leur profondeur." },
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
                    new() { Language = "en", CommonName = "Jasmine", Description = "A climbing plant with intensely fragrant white flowers. Perfect for training over arches, pergolas, and fences." },
                    new() { Language = "fr", CommonName = "Jasmin", Description = "Plante grimpante aux fleurs blanches intensément parfumées. Parfait pour habiller arches, pergolas et clôtures." },
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
                    new() { Language = "en", CommonName = "Lavender", Description = "A fragrant medicinal plant known for its calming properties." },
                    new() { Language = "fr", CommonName = "Lavande", Description = "Plante médicinale parfumée connue pour ses propriétés apaisantes." },
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
                    new() { Language = "en", CommonName = "Chamomile", Description = "A gentle medicinal herb used for centuries in soothing teas. Flowers are harvested when fully open and dried for infusions." },
                    new() { Language = "fr", CommonName = "Camomille", Description = "Herbe médicinale douce utilisée depuis des siècles en tisane apaisante. Les fleurs sont récoltées ouvertes et séchées pour les infusions." },
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
                    new() { Language = "en", CommonName = "Aloe Vera", Description = "A succulent with thick gel-filled leaves used for skin healing. Grows well indoors and needs very little water." },
                    new() { Language = "fr", CommonName = "Aloe vera", Description = "Plante succulente aux feuilles épaisses remplies de gel utilisé pour soigner la peau. Pousse bien en intérieur et nécessite très peu d'eau." },
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
                    new() { Language = "en", CommonName = "Echinacea", Description = "A hardy perennial used to support the immune system. Its purple cone flowers also attract butterflies and bees." },
                    new() { Language = "fr", CommonName = "Échinacée", Description = "Vivace robuste utilisée pour renforcer le système immunitaire. Ses fleurs violettes en cône attirent aussi papillons et abeilles." },
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
                    new() { Language = "en", CommonName = "Sage", Description = "An evergreen herb with velvety leaves valued for both culinary and medicinal use. Traditionally used to aid digestion and soothe sore throats." },
                    new() { Language = "fr", CommonName = "Sauge", Description = "Herbe persistante aux feuilles veloutées appréciée en cuisine et en médecine. Traditionnellement utilisée pour la digestion et les maux de gorge." },
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
                    new() { Language = "en", CommonName = "Calendula", Description = "A cheerful annual with bright orange flowers used in healing salves. Easy to grow and self-seeds readily for the following year." },
                    new() { Language = "fr", CommonName = "Souci", Description = "Plante annuelle aux fleurs orange vif utilisées dans les baumes cicatrisants. Facile à cultiver et se ressème spontanément." },
                ],
            },
        };

        await context.Plants.AddRangeAsync(plants);
        await context.SaveChangesAsync();
    }
}
