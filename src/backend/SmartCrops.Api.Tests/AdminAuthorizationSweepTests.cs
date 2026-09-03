using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.IdentityModel.Tokens;
using SmartCrops.Api.Tests.Infrastructure;

namespace SmartCrops.Api.Tests;

/// <summary>
/// Shares ONE booted host across the whole sweep: authorization filters answer
/// before any action or store access runs, so the in-memory database is never
/// touched — it exists only so <c>AddInfrastructure</c> can register a
/// DbContext at boot. The "Testing" environment skips the DB-init block.
/// </summary>
public sealed class AdminSweepFactoryFixture : IDisposable
{
    public WebApplicationFactory<Program> Factory { get; } = new TestWebAppBuilder()
        .WithEnvironment("Testing")
        .WithJwtAuth()
        .WithGoogleOAuth()
        .WithFrontendUrl()
        .WithTrefle()
        .WithPerenual()
        .WithTypesense()
        .WithSmtp()
        .WithInMemoryDatabase("AdminAuthorizationSweep")
        .Build();

    public void Dispose() => Factory.Dispose();
}

/// <summary>
/// Go-live standing proof (Lot 1b): every Admin controller rejects
/// non-admins. One representative route per controller under
/// <c>Controllers/Admin/</c> — the cheapest each exposes (a single controller
/// has a GET; the rest are POST-only, which changes nothing here because
/// authorization short-circuits before model binding or the action body).
/// A missing bearer must answer 401, a valid NON-admin bearer 403. A wrong
/// path in the table cannot silently pass: it would 404 and fail both
/// assertions. A RED here is a REAL authorization hole — the fix is adding
/// the missing Roles restriction to the controller, never weakening this
/// test.
/// </summary>
public class AdminAuthorizationSweepTests : IClassFixture<AdminSweepFactoryFixture>
{
    // Mirrors TestWebAppBuilder.WithJwtAuth so tokens signed here validate
    // against the host. Only sub (+ roles) is set: with no security_stamp
    // claim, the OnTokenValidated check in Program.cs returns early and the
    // store is never consulted.
    private const string TestJwtKey = "SmartCrops-Test-Secret-Key-Min32Characters!!";
    private const string TestJwtIssuer = "SmartCrops";
    private const string TestJwtAudience = "SmartCrops";

    private readonly WebApplicationFactory<Program> _factory;

    public AdminAuthorizationSweepTests(AdminSweepFactoryFixture fixture)
    {
        _factory = fixture.Factory;
    }

    // One route per Admin controller. Route-constrained ids use Guid.Empty:
    // syntactically valid so routing matches (a malformed id would 404 at the
    // constraint and never reach the authorization proof).
    public static TheoryData<string, string> AdminRoutes => new()
    {
        { "GET", "/api/admin/dashboard/stats" },                                           // AdminDashboardController (SMA-414)
        { "POST", "/api/admin/bulk-import" },                                              // BulkImportController
        { "POST", "/api/admin/perenual/pest-catalog/harvest" },                            // PerenualPestCatalogController
        { "GET", "/api/admin/perenual/species-list" },                                     // PlantPerenualController
        { "POST", "/api/admin/perenual/cache-catalog" },                                   // PerenualRawCacheController
        { "POST", "/api/admin/plants/00000000-0000-0000-0000-000000000000/repin" },        // PlantRepinController
        { "POST", "/api/admin/search/reindex" },                                           // SearchIndexController
        { "POST", "/api/admin/taxonomy/enrich/00000000-0000-0000-0000-000000000000" },     // PlantTaxonomyController
        { "POST", "/api/admin/translations/backfill" },                                    // PlantTranslationsController
        { "POST", "/api/admin/trefle/enrich/00000000-0000-0000-0000-000000000000" },       // PlantTrefleController
    };

    [Theory]
    [MemberData(nameof(AdminRoutes))]
    public async Task NoBearer_Returns401(string method, string path)
    {
        var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), path);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(AdminRoutes))]
    public async Task NonAdminBearer_Returns403(string method, string path)
    {
        var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        request.Headers.Authorization =
            new AuthenticationHeaderValue("Bearer", GenerateNonAdminToken());

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private static string GenerateNonAdminToken()
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestJwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: TestJwtIssuer,
            audience: TestJwtAudience,
            claims: [new Claim(JwtRegisteredClaimNames.Sub, Guid.NewGuid().ToString())],
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
