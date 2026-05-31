using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.DTOs;
using SmartCrops.Core.Authorization;
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
    public async Task GetAll_IsMedicinalFalse_ReturnsOnlyNonMedicinal_ExcludingNullFlag()
    {
        await SeedAsync(
            new Plant { Id = Guid.NewGuid(), ScientificName = "Medicinal One", PlantTypeId = OrnamentalTypeId, IsMedicinal = true },
            new Plant { Id = Guid.NewGuid(), ScientificName = "NonMedicinal Two", PlantTypeId = OrnamentalTypeId, IsMedicinal = false },
            new Plant { Id = Guid.NewGuid(), ScientificName = "Unknown Three", PlantTypeId = OrnamentalTypeId, IsMedicinal = null });

        var filtered = await Client.GetFromJsonAsync<List<PlantListItemResponse>>("/api/plants?isMedicinal=false");

        Assert.NotNull(filtered);
        // Only the false-flag row; the true-flag AND the NULL-flag rows are excluded.
        Assert.Single(filtered!);
        Assert.All(filtered!, p => Assert.Equal(false, p.IsMedicinal));
        Assert.Contains(filtered!, p => p.ScientificName == "NonMedicinal Two");
        Assert.DoesNotContain(filtered!, p => p.ScientificName == "Medicinal One");
        Assert.DoesNotContain(filtered!, p => p.ScientificName == "Unknown Three");
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

    // ── Catalogue mutations — SMA-33/#68 ──────────────────────────────────
    // These were ANONYMOUS (open catalogue mutation on the public internet) and
    // are now gated to [Authorize(Roles = "Admin")]. The GET endpoints above stay
    // public, proving the gate is method-level (mutations only), not class-wide.

    [Fact]
    public async Task Create_NoAuth_Returns401()
    {
        var response = await Client.PostAsJsonAsync("/api/plants",
            new { scientificName = "Anon Created", plantTypeId = OrnamentalTypeId });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_AuthenticatedNonAdmin_Returns403()
    {
        AuthAsNonAdmin();

        var response = await Client.PostAsJsonAsync("/api/plants",
            new { scientificName = "NonAdmin Created", plantTypeId = OrnamentalTypeId });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Create_Admin_PassesAuthorizationGate()
    {
        // The admin IS authorized — proven by the absence of 401/403. The body
        // here is a partial Plant, which the [ApiController] implicit-required
        // validation on the non-nullable PlantType nav rejects with 400; that
        // raw-entity binding (mass-assignment) is a separate, deferred concern.
        // The full happy-path 2xx is covered by Delete_Admin_Returns204, which
        // takes no body. This test isolates the authorization outcome.
        AuthAsAdmin();

        var response = await Client.PostAsJsonAsync("/api/plants",
            new { scientificName = "Admin Created", plantTypeId = OrnamentalTypeId });

        // Admin is authorized: not 401/403, and not a 5xx (so an authorization
        // regression can't hide behind an unrelated server error).
        Assert.True((int)response.StatusCode < 500, $"Authorized path should not 5xx; was {(int)response.StatusCode}.");
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Update_NoAuth_Returns401()
    {
        var id = Guid.NewGuid();
        var response = await Client.PutAsJsonAsync($"/api/plants/{id}",
            new { id, scientificName = "X", plantTypeId = OrnamentalTypeId });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Update_AuthenticatedNonAdmin_Returns403()
    {
        AuthAsNonAdmin();
        var id = Guid.NewGuid();
        var response = await Client.PutAsJsonAsync($"/api/plants/{id}",
            new { id, scientificName = "X", plantTypeId = OrnamentalTypeId });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Update_Admin_PassesAuthorizationGate()
    {
        // As with Create: admin authorization is proven by the absence of
        // 401/403. The partial-Plant body trips the same [ApiController]
        // implicit-required validation (400) on the PlantType nav — the deferred
        // raw-entity binding concern, not authorization.
        var id = Guid.NewGuid();
        await SeedAsync(new Plant { Id = id, ScientificName = "Before", PlantTypeId = OrnamentalTypeId });
        AuthAsAdmin();

        var response = await Client.PutAsJsonAsync($"/api/plants/{id}",
            new { id, scientificName = "After", plantTypeId = OrnamentalTypeId });

        // Admin is authorized: not 401/403, and not a 5xx (so an authorization
        // regression can't hide behind an unrelated server error).
        Assert.True((int)response.StatusCode < 500, $"Authorized path should not 5xx; was {(int)response.StatusCode}.");
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Delete_NoAuth_Returns401()
    {
        var response = await Client.DeleteAsync($"/api/plants/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Delete_AuthenticatedNonAdmin_Returns403()
    {
        AuthAsNonAdmin();

        var response = await Client.DeleteAsync($"/api/plants/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Delete_Admin_Returns204()
    {
        var id = Guid.NewGuid();
        await SeedAsync(new Plant { Id = id, ScientificName = "ToDelete", PlantTypeId = OrnamentalTypeId });
        AuthAsAdmin();

        var response = await Client.DeleteAsync($"/api/plants/{id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
        Assert.False(await db.Plants.AnyAsync(p => p.Id == id));
    }

    private void AuthAsAdmin() => SetBearer(Roles.Admin);
    private void AuthAsNonAdmin() => SetBearer();

    private void SetBearer(params string[] roles) =>
        Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", Fixture.GenerateToken($"u-{Guid.NewGuid():N}", roles));
}
