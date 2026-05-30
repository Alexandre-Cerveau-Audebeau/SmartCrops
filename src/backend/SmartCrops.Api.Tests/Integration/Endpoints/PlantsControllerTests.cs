using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// Integration tests for the public plant list endpoints (SMA-70 / SMA-63):
/// the <c>IsMedicinal</c> filter, and the guarantee that the neutral list DTO
/// never leaks the licensed Perenual source-text scalars.
/// </summary>
public class PlantsControllerTests : IntegrationTestBase
{
    public PlantsControllerTests(PostgresFixture fixture) : base(fixture) { }

    // PlantTypeId 4 = Ornamental (seeded by PlantTypeConfiguration, survives Respawn).
    private const int OrnamentalTypeId = 4;

    private async Task SeedAsync(params Plant[] plants)
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        foreach (var p in plants)
        {
            p.CreatedAt = DateTime.UtcNow;
            p.UpdatedAt = DateTime.UtcNow;
        }
        db.Plants.AddRange(plants);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task GetAll_IsMedicinalTrue_ReturnsOnlyMedicinal_ExcludingNullFlag()
    {
        await SeedAsync(
            new Plant { Id = Guid.NewGuid(), ScientificName = "Medicinal One", PlantTypeId = OrnamentalTypeId, IsMedicinal = true },
            new Plant { Id = Guid.NewGuid(), ScientificName = "NonMedicinal Two", PlantTypeId = OrnamentalTypeId, IsMedicinal = false },
            new Plant { Id = Guid.NewGuid(), ScientificName = "Unknown Three", PlantTypeId = OrnamentalTypeId, IsMedicinal = null });

        var filtered = await Client.GetFromJsonAsync<List<PlantListItemResponse>>("/api/plants?isMedicinal=true");

        Assert.NotNull(filtered);
        Assert.NotEmpty(filtered);
        // Every returned row is medicinal; the false-flag and NULL-flag rows are excluded.
        Assert.All(filtered!, p => Assert.Equal(true, p.IsMedicinal));
        Assert.Contains(filtered!, p => p.ScientificName == "Medicinal One");
        Assert.DoesNotContain(filtered!, p => p.ScientificName == "NonMedicinal Two");
        Assert.DoesNotContain(filtered!, p => p.ScientificName == "Unknown Three");

        // Sanity: the unfiltered list returns all three (filter is opt-in).
        var all = await Client.GetFromJsonAsync<List<PlantListItemResponse>>("/api/plants");
        Assert.Equal(3, all!.Count);
    }

    [Fact]
    public async Task GetAll_NeutralDto_DoesNotLeakPerenualSourceText()
    {
        // A plant carrying the denormalised Perenual source-text scalars in the DB.
        await SeedAsync(new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = "Source Text Plant",
            PlantTypeId = OrnamentalTypeId,
            PropagationInstructions = "Division; Root Cutting.",
            SowingInstructions = "Sow in spring.",
            EdibleParts = "[\"leaf\"]",
        });

        var json = await Client.GetStringAsync("/api/plants");

        // The list DTO has no such properties, so the keys must be absent entirely.
        Assert.DoesNotContain("propagationInstructions", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("sowingInstructions", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("edibleParts", json, StringComparison.OrdinalIgnoreCase);
        // ...and the empty-navigation leak is gone too.
        Assert.DoesNotContain("gardenPlants", json, StringComparison.OrdinalIgnoreCase);
        // But the neutral payload is present.
        Assert.Contains("scientificName", json, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("isMedicinal", json, StringComparison.OrdinalIgnoreCase);
    }
}
