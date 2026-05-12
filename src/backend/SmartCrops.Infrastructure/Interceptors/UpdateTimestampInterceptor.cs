using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Infrastructure.Interceptors;

/// <summary>
/// EF Core <see cref="SaveChangesInterceptor"/> that refreshes the
/// <see cref="IHasUpdatedAt.UpdatedAt"/> property to <see cref="DateTime.UtcNow"/>
/// for every tracked entity in <see cref="EntityState.Modified"/> state.
///
/// Does not touch entities in <see cref="EntityState.Added"/> (INSERT keeps
/// PostgreSQL's <c>DEFAULT CURRENT_TIMESTAMP</c>) or <see cref="EntityState.Deleted"/>
/// (no-op). Entities that don't implement <see cref="IHasUpdatedAt"/> are ignored
/// at the type-system level via <c>ChangeTracker.Entries&lt;IHasUpdatedAt&gt;()</c>.
///
/// Stateless and thread-safe: a single instance can be registered as a singleton.
/// Uses <see cref="DateTime.UtcNow"/> for consistency across timezones; no
/// <c>IClock</c> abstraction is introduced for now (KISS — add only if a test
/// scenario requires it).
/// </summary>
public sealed class UpdateTimestampInterceptor : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        UpdateTimestamps(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        UpdateTimestamps(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private static void UpdateTimestamps(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        var utcNow = DateTime.UtcNow;

        foreach (var entry in context.ChangeTracker.Entries<IHasUpdatedAt>())
        {
            if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = utcNow;
            }
        }
    }
}
