using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.Tests.Infrastructure;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Enums;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Interceptors;

namespace SmartCrops.Api.Tests.Interceptors;

public class InterceptorTestFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        new TestWebAppBuilder()
            .WithEnvironment("Development")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            // WithInMemoryDatabase isn't used: these tests assert the production
            // UpdateTimestampInterceptor still fires against the in-memory provider,
            // so the DbContext registration has to re-attach the interceptor that
            // the production AddDbContext lambda wires in (DependencyInjection.cs).
            .WithServices(services =>
            {
                var descriptors = services
                    .Where(d => d.ServiceType == typeof(DbContextOptions<SmartCropsDbContext>))
                    .ToList();
                foreach (var descriptor in descriptors)
                {
                    services.Remove(descriptor);
                }

                services.AddDbContext<SmartCropsDbContext>((sp, options) =>
                {
                    options
                        .UseInMemoryDatabase("InterceptorTests")
                        .AddInterceptors(sp.GetRequiredService<UpdateTimestampInterceptor>());
                });
            })
            .ApplyTo(builder);
    }
}

/// <summary>
/// Integration tests for <see cref="UpdateTimestampInterceptor"/>.
///
/// Note on test infrastructure: these tests run against the EF Core in-memory
/// provider (consistent with the existing 10 tests). The interceptor itself is
/// provider-agnostic — it hooks into DbContext.SaveChanges, not the database
/// layer — so in-memory is sufficient to exercise it. What in-memory CANNOT
/// verify is PostgreSQL's <c>DEFAULT CURRENT_TIMESTAMP</c> at INSERT time;
/// that is documented in test 2 and is out of scope for PR #37.
///
/// Thread-safety: the interceptor is stateless (no fields, static helper) and
/// registered as a singleton; this is exercised by the production path and
/// asserted by inspection rather than a flaky concurrency test.
/// </summary>
public class UpdateTimestampInterceptorTests : IClassFixture<InterceptorTestFactory>
{
    private static readonly TimeSpan Tolerance = TimeSpan.FromSeconds(5);

    private readonly InterceptorTestFactory _factory;

    public UpdateTimestampInterceptorTests(InterceptorTestFactory factory)
    {
        _factory = factory;
    }

    private async Task<(Guid plantId, Guid gardenId, int phaseId)> SeedAggregateAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        // Defensive per-test isolation: reset the in-memory store on every
        // call. EnsureCreatedAsync materializes the PlantType reference data
        // from HasData (see PlantTypeConfiguration), so no explicit seed here.
        await db.Database.EnsureDeletedAsync();
        await db.Database.EnsureCreatedAsync();

        // Seed entities with a deliberately old UpdatedAt so the interceptor's
        // refresh is unambiguous in assertions.
        var oldStamp = DateTime.UtcNow.AddDays(-30);

        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = "Solanum lycopersicum",
            PlantTypeId = 1,
            Family = "Solanaceae",
            CreatedAt = oldStamp,
            UpdatedAt = oldStamp,
        };

        var garden = new Garden
        {
            Id = Guid.NewGuid(),
            Name = "Test Garden",
            UserId = Guid.NewGuid().ToString(),
            CreatedAt = oldStamp,
            UpdatedAt = oldStamp,
        };

        var phase = new PlantPhase
        {
            PlantId = plant.Id,
            PhaseType = PlantPhaseType.Sowing,
            StartMonth = 3,
            EndMonth = 5,
            Notes = "initial",
            CreatedAt = oldStamp,
            UpdatedAt = oldStamp,
        };

        db.Plants.Add(plant);
        db.Gardens.Add(garden);
        db.PlantPhases.Add(phase);
        await db.SaveChangesAsync();

        return (plant.Id, garden.Id, phase.Id);
    }

    [Fact]
    public async Task UpdateRefreshes_UpdatedAt_OnModifiedEntity()
    {
        var (plantId, _, _) = await SeedAggregateAsync();

        DateTime before;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();
            var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
            before = plant.UpdatedAt;

            plant.Family = "Solanaceae-updated";
            await db.SaveChangesAsync();

            Assert.True(plant.UpdatedAt > before, "Interceptor should refresh UpdatedAt on Modified entity.");
            var now = DateTime.UtcNow;
            Assert.InRange(plant.UpdatedAt, now - Tolerance, now + Tolerance);
        }
    }

    [Fact]
    public async Task Insert_DoesNotOverride_UpdatedAt_OnAddedEntity()
    {
        // Sentinel chosen so any interceptor write would be glaringly visible.
        var sentinel = DateTime.MinValue.ToUniversalTime();
        var (plantId, _, _) = await SeedAggregateAsync();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var longDesc = new PlantLongDescription
        {
            PlantId = plantId,
            Language = "en",
            LongDescription = "Test long description",
            CreatedAt = sentinel,
            UpdatedAt = sentinel,
        };

        db.PlantLongDescriptions.Add(longDesc);
        await db.SaveChangesAsync();

        // The interceptor must not touch entities in Added state.
        // Note: against PostgreSQL the column would also be filled by
        // DEFAULT CURRENT_TIMESTAMP at INSERT — that DB-level behavior is not
        // exercised by the in-memory provider used in these tests, so we assert
        // only the interceptor contract here (the sentinel must survive).
        Assert.Equal(sentinel, longDesc.UpdatedAt);
    }

    [Fact]
    public async Task Delete_DoesNotTouch_UpdatedAt()
    {
        var (_, _, phaseId) = await SeedAggregateAsync();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var phase = await db.PlantPhases.SingleAsync(p => p.Id == phaseId);
        var before = phase.UpdatedAt;

        db.PlantPhases.Remove(phase);
        await db.SaveChangesAsync();

        // The in-memory entity remains accessible after SaveChangesAsync; the
        // interceptor must have left UpdatedAt untouched on a Deleted entry.
        Assert.Equal(before, phase.UpdatedAt);
        Assert.False(await db.PlantPhases.AnyAsync(p => p.Id == phaseId));
    }

    [Fact]
    public async Task MultipleEntities_AreAllRefreshed_InSameSaveChanges()
    {
        var (plantId, gardenId, phaseId) = await SeedAggregateAsync();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var plant = await db.Plants.SingleAsync(p => p.Id == plantId);
        var garden = await db.Gardens.SingleAsync(g => g.Id == gardenId);
        var phase = await db.PlantPhases.SingleAsync(p => p.Id == phaseId);

        var beforePlant = plant.UpdatedAt;
        var beforeGarden = garden.UpdatedAt;
        var beforePhase = phase.UpdatedAt;

        plant.Family = "MultiUpdate-Plant";
        garden.Name = "MultiUpdate-Garden";
        phase.Notes = "MultiUpdate-Phase";

        await db.SaveChangesAsync();

        Assert.True(plant.UpdatedAt > beforePlant);
        Assert.True(garden.UpdatedAt > beforeGarden);
        Assert.True(phase.UpdatedAt > beforePhase);

        // Contract: all entities modified in a single SaveChangesAsync have their
        // UpdatedAt refreshed to approximately "now".
        // Implementation detail (not asserted): the current interceptor captures
        // DateTime.UtcNow once per SaveChanges call, so the three values would also
        // be strictly equal. We deliberately don't assert that, to leave the door
        // open for future per-entity timestamp strategies (e.g. distributed tracing).
        var now = DateTime.UtcNow;
        Assert.InRange(plant.UpdatedAt, now - Tolerance, now + Tolerance);
        Assert.InRange(garden.UpdatedAt, now - Tolerance, now + Tolerance);
        Assert.InRange(phase.UpdatedAt, now - Tolerance, now + Tolerance);
    }

    [Fact]
    public async Task EntityWithoutMarker_IsIgnored()
    {
        // GardenPlant is a junction entity that does NOT implement IHasUpdatedAt.
        // It only carries an AddedAt timestamp, which must remain untouched.
        var (plantId, gardenId, _) = await SeedAggregateAsync();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var addedAt = DateTime.UtcNow.AddDays(-7);
        var gardenPlant = new GardenPlant
        {
            GardenId = gardenId,
            PlantId = plantId,
            AddedAt = addedAt,
            Notes = "initial",
        };
        db.GardenPlants.Add(gardenPlant);
        await db.SaveChangesAsync();

        // Modify a scalar; the interceptor must not throw and must not invent
        // any timestamp on this entity (no IHasUpdatedAt to refresh).
        gardenPlant.Notes = "updated";
        await db.SaveChangesAsync();

        Assert.Equal(addedAt, gardenPlant.AddedAt);
        Assert.Equal("updated", gardenPlant.Notes);
    }
}
