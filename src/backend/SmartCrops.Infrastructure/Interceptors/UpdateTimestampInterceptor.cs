using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Infrastructure.Interceptors;

/// <summary>
/// EF Core <see cref="SaveChangesInterceptor"/> that refreshes the
/// <see cref="IHasUpdatedAt.UpdatedAt"/> property to <see cref="DateTime.UtcNow"/>
/// for every tracked entity in <see cref="EntityState.Modified"/> state.
///
/// Does not touch entities in <see cref="EntityState.Added"/> or
/// <see cref="EntityState.Deleted"/> state. On INSERT, <c>UpdatedAt</c> is left for
/// the persistence layer to populate: where a column-level default such as
/// <c>DEFAULT CURRENT_TIMESTAMP</c> (PostgreSQL) is configured, that default
/// applies; otherwise the property keeps whatever value the application code
/// set before <c>SaveChangesAsync</c>. Entities that don't implement
/// <see cref="IHasUpdatedAt"/> are ignored at the type-system level via
/// <c>ChangeTracker.Entries&lt;IHasUpdatedAt&gt;()</c>.
///
/// Stateless and thread-safe: a single instance can be registered as a singleton.
/// Uses <see cref="DateTime.UtcNow"/> for consistency across timezones; no
/// <c>IClock</c> abstraction is introduced for now (KISS — add only if a test
/// scenario requires it). See <c>docs/adr/0001-use-datetime-utc-not-datetimeoffset.md</c>
/// for the rationale on staying with <see cref="DateTime"/> rather than
/// <see cref="DateTimeOffset"/>.
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
        // CancellationToken is not propagated here: UpdateTimestamps performs only
        // in-memory operations on the change tracker. If this ever evolves to include
        // async work (external time service, distributed clock), the signature
        // will need to accept and honor a CancellationToken.
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
