using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Entities;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-414 (D1) — every account creation path stamps <c>CreatedAt</c> in UTC.
/// The Register path is proven end-to-end through the endpoint. The Google
/// callback creates its account inline in <c>GoogleCallback</c>, which this
/// suite cannot drive (no OAuth harness exists), so that stamp is covered by
/// code review only — stated as such in the lot report.
/// </summary>
public class UserCreatedAtTests : IntegrationTestBase
{
    public UserCreatedAtTests(PostgresFixture fixture) : base(fixture) { }

    // Satisfies both the DTO's [MinLength(6)] and Identity's default password
    // policy (digit + lower + upper + non-alphanumeric).
    private const string ValidPassword = "Str0ng!Pass";

    [Fact]
    public async Task Register_NewAccount_StampsCreatedAtUtc()
    {
        var email = $"created-{Guid.NewGuid():N}@example.com";
        var before = DateTime.UtcNow.AddSeconds(-1);

        var response = await Client.PostAsJsonAsync(
            "/api/auth/register", new { email, password = ValidPassword });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        using var scope = CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email);

        Assert.NotNull(user);
        Assert.NotNull(user!.CreatedAt);
        Assert.Equal(DateTimeKind.Utc, user.CreatedAt!.Value.Kind);
        Assert.InRange(user.CreatedAt.Value, before, DateTime.UtcNow.AddSeconds(1));
    }
}
