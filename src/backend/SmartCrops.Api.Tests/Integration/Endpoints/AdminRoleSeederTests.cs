using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SmartCrops.Core.Authorization;
using SmartCrops.Core.Entities;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-33 / #68 — tests for <see cref="AdminRoleSeeder"/>. The boot seeding is
/// skipped under the Testing environment (Program.cs), so these call the seeder
/// directly with the host's real <c>RoleManager</c>/<c>UserManager</c>.
/// </summary>
public class AdminRoleSeederTests : IntegrationTestBase
{
    public AdminRoleSeederTests(PostgresFixture fixture) : base(fixture) { }

    private async Task<(RoleManager<IdentityRole> Roles, UserManager<ApplicationUser> Users)> ManagersAsync(IServiceScope scope)
    {
        await Task.CompletedTask;
        return (
            scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>(),
            scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>());
    }

    private static async Task<ApplicationUser> CreateUserAsync(UserManager<ApplicationUser> users, string email, bool confirmed)
    {
        var user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = confirmed };
        var result = await users.CreateAsync(user);
        Assert.True(result.Succeeded, string.Join("; ", result.Errors.Select(e => e.Description)));
        return user;
    }

    [Fact]
    public async Task Seed_CreatesAdminRole_AndGrantsItToConfirmedListedUser()
    {
        using var scope = CreateScope();
        var (roles, users) = await ManagersAsync(scope);
        var email = $"admin-{Guid.NewGuid():N}@example.com";
        var user = await CreateUserAsync(users, email, confirmed: true);

        await AdminRoleSeeder.SeedAsync(roles, users, [email], NullLogger.Instance);

        Assert.True(await roles.RoleExistsAsync(Roles.Admin));
        Assert.True(await users.IsInRoleAsync(user, Roles.Admin));
    }

    [Fact]
    public async Task Seed_IsIdempotent_SecondRunDoesNotDuplicateMembership()
    {
        using var scope = CreateScope();
        var (roles, users) = await ManagersAsync(scope);
        var email = $"admin-{Guid.NewGuid():N}@example.com";
        var user = await CreateUserAsync(users, email, confirmed: true);

        await AdminRoleSeeder.SeedAsync(roles, users, [email], NullLogger.Instance);
        // Second run over the same config must be a no-op (no duplicate role, no
        // duplicate membership, no exception).
        await AdminRoleSeeder.SeedAsync(roles, users, [email], NullLogger.Instance);

        var roleNames = await users.GetRolesAsync(user);
        Assert.Single(roleNames, Roles.Admin);
    }

    [Fact]
    public async Task Seed_SkipsUnconfirmedUser()
    {
        using var scope = CreateScope();
        var (roles, users) = await ManagersAsync(scope);
        var email = $"unconfirmed-{Guid.NewGuid():N}@example.com";
        var user = await CreateUserAsync(users, email, confirmed: false);

        await AdminRoleSeeder.SeedAsync(roles, users, [email], NullLogger.Instance);

        Assert.False(await users.IsInRoleAsync(user, Roles.Admin));
    }

    [Fact]
    public async Task Seed_MissingAccount_DoesNotThrow_AndGrantsNothing()
    {
        using var scope = CreateScope();
        var (roles, users) = await ManagersAsync(scope);
        var email = $"ghost-{Guid.NewGuid():N}@example.com";

        // No account for this email — must be a clean no-op, not a failure.
        await AdminRoleSeeder.SeedAsync(roles, users, [email], NullLogger.Instance);

        Assert.True(await roles.RoleExistsAsync(Roles.Admin)); // role still ensured
        Assert.Null(await users.FindByEmailAsync(email));
    }
}
