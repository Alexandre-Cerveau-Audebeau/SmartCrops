using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Invariants;

/// <summary>
/// Validates the <c>CK_PlantSuggestions_Status</c> CHECK constraint enforcing the
/// allowed workflow values for <c>PlantSuggestion.Status</c>: Pending / Approved / Rejected.
/// </summary>
public class StatusConstraintTests : IntegrationTestBase
{
    public StatusConstraintTests(PostgresFixture fixture) : base(fixture) { }

    [Theory]
    [InlineData("Pending")]
    [InlineData("Approved")]
    [InlineData("Rejected")]
    public async Task Status_AllowedValue_Accepted(string status)
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantSuggestions.Add(new PlantSuggestion
        {
            Id = Guid.NewGuid(),
            PlantId = plantId,
            FieldName = "CommonName",
            SuggestedValue = "Tomato",
            Status = status,
        });

        var ex = await Record.ExceptionAsync(() => db.SaveChangesAsync());
        Assert.Null(ex);
    }

    [Theory]
    [InlineData("pending")]      // case mismatch
    [InlineData("PENDING")]
    [InlineData("Reviewed")]     // not in allow-list
    [InlineData("")]             // empty
    public async Task Status_DisallowedValue_Rejected(string status)
    {
        var plantId = await SeedPlantAsync();

        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        db.PlantSuggestions.Add(new PlantSuggestion
        {
            Id = Guid.NewGuid(),
            PlantId = plantId,
            FieldName = "CommonName",
            SuggestedValue = "Tomato",
            Status = status,
        });

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains("CK_PlantSuggestions_Status", ex.InnerException?.Message ?? string.Empty);
    }

    private async Task<Guid> SeedPlantAsync()
    {
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = $"Test plant {Guid.NewGuid():N}",
            PlantTypeId = 1,
        };
        db.Plants.Add(plant);
        await db.SaveChangesAsync();
        return plant.Id;
    }
}
