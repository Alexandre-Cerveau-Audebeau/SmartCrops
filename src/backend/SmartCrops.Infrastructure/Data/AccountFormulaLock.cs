using Microsoft.EntityFrameworkCore;

namespace SmartCrops.Infrastructure.Data;

/// <summary>
/// SMA-448, lot F1 — the ONE way a request takes hold of an account's formula
/// before acting on it: the account's row is locked (<c>FOR UPDATE</c>) for the
/// rest of the caller's transaction, and its formula read in the same
/// statement. A formula switch and a layout save of one account are thereby
/// serialized: the switch can never archive a layout a save is still writing,
/// and a save can never land on the row a switch has just refilled.
///
/// <para>Only meaningful inside a transaction the caller opened — outside one,
/// PostgreSQL releases the lock at the end of the statement.</para>
/// </summary>
public static class AccountFormulaLock
{
    /// <summary>
    /// Locks the account's row until the current transaction ends and returns
    /// its formula; null when the account does not exist.
    /// </summary>
    public static async Task<string?> LockAsync(SmartCropsDbContext context, string userId, CancellationToken ct)
    {
        // `ToListAsync`, not `SingleOrDefaultAsync`: an operator on top of a raw
        // query makes EF compose it as a sub-SELECT, and the lock must stay on
        // the statement itself.
        var formulas = await context.Database
            .SqlQuery<string>($"SELECT \"Formula\" AS \"Value\" FROM \"AspNetUsers\" WHERE \"Id\" = {userId} FOR UPDATE")
            .ToListAsync(ct);

        return formulas.Count == 0 ? null : formulas[0];
    }
}
