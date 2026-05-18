using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests;

public class GardensTestFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = Guid.NewGuid().ToString();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["Jwt:Key"] = "SmartCrops-Test-Secret-Key-Min32Characters!!",
                    ["Jwt:Issuer"] = "SmartCrops",
                    ["Jwt:Audience"] = "SmartCrops",
                    ["Google:ClientId"] = "test-client-id",
                    ["Google:ClientSecret"] = "test-client-secret",
                    ["Frontend:BaseUrl"] = "http://localhost:3000",
                    // TrefleOptions.Token is [Required] and validated on host
                    // boot via ValidateOnStart; any non-empty placeholder keeps
                    // the test host alive. The stub-or-disabled Trefle service
                    // is never actually called from gardens tests.
                    ["Trefle:Token"] = "test-token",
                }
            );
        });
        builder.ConfigureServices(services =>
        {
            // Remove the existing DbContext registration
            var descriptor = services.SingleOrDefault(d =>
                d.ServiceType == typeof(DbContextOptions<SmartCropsDbContext>)
            );
            if (descriptor != null)
                services.Remove(descriptor);

            // Add in-memory database
            services.AddDbContext<SmartCropsDbContext>(options =>
            {
                options.UseInMemoryDatabase(_dbName);
            });
        });
    }

    public string GenerateToken(string userId)
    {
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes("SmartCrops-Test-Secret-Key-Min32Characters!!")
        );
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: "SmartCrops",
            audience: "SmartCrops",
            claims: [new Claim(JwtRegisteredClaimNames.Sub, userId)],
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds
        );
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public class GardensControllerTests : IClassFixture<GardensTestFactory>
{
    private readonly GardensTestFactory _factory;

    public GardensControllerTests(GardensTestFactory factory)
    {
        _factory = factory;
    }

    private async Task<(Guid gardenId, Guid plantId)> SeedGardenWithPlant(string userId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SmartCropsDbContext>();

        var garden = new Garden
        {
            Id = Guid.NewGuid(),
            Name = "Test Garden",
            UserId = userId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        var plantType = await db.PlantTypes.FindAsync(1);
        if (plantType == null)
        {
            plantType = new PlantType { Id = 1, Name = "Vegetable" };
            db.PlantTypes.Add(plantType);
        }

        var plant = new Plant
        {
            Id = Guid.NewGuid(),
            ScientificName = "Solanum lycopersicum",
            PlantTypeId = 1,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        var gardenPlant = new GardenPlant
        {
            GardenId = garden.Id,
            PlantId = plant.Id,
            AddedAt = DateTime.UtcNow,
            Notes = "Initial notes",
        };

        db.Gardens.Add(garden);
        db.Plants.Add(plant);
        db.GardenPlants.Add(gardenPlant);
        await db.SaveChangesAsync();

        return (garden.Id, plant.Id);
    }

    [Fact]
    public async Task PatchPlantNotes_ValidNotes_Returns200()
    {
        var userId = Guid.NewGuid().ToString();
        var (gardenId, plantId) = await SeedGardenWithPlant(userId);

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _factory.GenerateToken(userId)
        );

        var response = await client.PatchAsJsonAsync(
            $"/api/gardens/{gardenId}/plants/{plantId}",
            new { Notes = "Updated notes" }
        );

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<PlantNotesResponse>();
        Assert.Equal("Updated notes", body?.Notes);
    }

    [Fact]
    public async Task PatchPlantNotes_ExceedsMaxLength_Returns400()
    {
        var userId = Guid.NewGuid().ToString();
        var (gardenId, plantId) = await SeedGardenWithPlant(userId);

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _factory.GenerateToken(userId)
        );

        var longNotes = new string('a', 501);
        var response = await client.PatchAsJsonAsync(
            $"/api/gardens/{gardenId}/plants/{plantId}",
            new { Notes = longNotes }
        );

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PatchPlantNotes_NonExistentGarden_Returns404()
    {
        var userId = Guid.NewGuid().ToString();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _factory.GenerateToken(userId)
        );

        var response = await client.PatchAsJsonAsync(
            $"/api/gardens/{Guid.NewGuid()}/plants/{Guid.NewGuid()}",
            new { Notes = "Some notes" }
        );

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PatchPlantNotes_OtherUsersGarden_Returns404()
    {
        var ownerUserId = Guid.NewGuid().ToString();
        var otherUserId = Guid.NewGuid().ToString();
        var (gardenId, plantId) = await SeedGardenWithPlant(ownerUserId);

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _factory.GenerateToken(otherUserId)
        );

        var response = await client.PatchAsJsonAsync(
            $"/api/gardens/{gardenId}/plants/{plantId}",
            new { Notes = "Hacked notes" }
        );

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PatchPlantNotes_NoAuthHeader_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.PatchAsJsonAsync(
            $"/api/gardens/{Guid.NewGuid()}/plants/{Guid.NewGuid()}",
            new { Notes = "Some notes" }
        );

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PatchPlantNotes_PlantNotInGarden_Returns404()
    {
        var userId = Guid.NewGuid().ToString();
        var (gardenId, _) = await SeedGardenWithPlant(userId);

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _factory.GenerateToken(userId)
        );

        var response = await client.PatchAsJsonAsync(
            $"/api/gardens/{gardenId}/plants/{Guid.NewGuid()}",
            new { Notes = "Some notes" }
        );

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PatchPlantNotes_NullNotes_ClearsNotes()
    {
        var userId = Guid.NewGuid().ToString();
        var (gardenId, plantId) = await SeedGardenWithPlant(userId);

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _factory.GenerateToken(userId)
        );

        var response = await client.PatchAsJsonAsync(
            $"/api/gardens/{gardenId}/plants/{plantId}",
            new { Notes = (string?)null }
        );

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<PlantNotesResponse>();
        Assert.Null(body?.Notes);
    }

    private record PlantNotesResponse(Guid GardenId, Guid PlantId, string? Notes, DateTime AddedAt);
}
