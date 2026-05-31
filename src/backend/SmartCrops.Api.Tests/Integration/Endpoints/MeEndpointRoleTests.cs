using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-33 — <c>GET /api/auth/me</c> must surface the admin role flag so the
/// frontend can hide admin-only UI. The flag's source of truth is the DB role
/// membership (resolved via UserManager), not the JWT claim, so it reflects a
/// role granted after the token was issued.
/// </summary>
public class MeEndpointRoleTests : IntegrationTestBase
{
    public MeEndpointRoleTests(PostgresFixture fixture) : base(fixture) { }

    private record Me(string UserId, string? Email, string? DisplayName, bool IsAdmin);

    private async Task<ApplicationUser> CreateUserAsync(bool inAdminRole)
    {
        using var scope = CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var email = $"me-{Guid.NewGuid():N}@example.com";
        var user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true };
        Assert.True((await users.CreateAsync(user)).Succeeded);
        if (inAdminRole)
        {
            if (!await roles.RoleExistsAsync(Roles.Admin))
            {
                await roles.CreateAsync(new IdentityRole(Roles.Admin));
            }
            Assert.True((await users.AddToRoleAsync(user, Roles.Admin)).Succeeded);
        }
        return user;
    }

    private void AuthAs(string userId) =>
        Client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Fixture.GenerateToken(userId));

    [Fact]
    public async Task Me_AdminUser_ReturnsIsAdminTrue()
    {
        var user = await CreateUserAsync(inAdminRole: true);
        AuthAs(user.Id);

        var me = await Client.GetFromJsonAsync<Me>("/api/auth/me");

        Assert.NotNull(me);
        Assert.True(me!.IsAdmin);
    }

    [Fact]
    public async Task Me_NonAdminUser_ReturnsIsAdminFalse()
    {
        var user = await CreateUserAsync(inAdminRole: false);
        AuthAs(user.Id);

        var me = await Client.GetFromJsonAsync<Me>("/api/auth/me");

        Assert.NotNull(me);
        Assert.False(me!.IsAdmin);
    }
}
