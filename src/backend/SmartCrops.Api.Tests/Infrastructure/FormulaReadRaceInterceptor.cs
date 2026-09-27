using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace SmartCrops.Api.Tests.Infrastructure;

/// <summary>
/// Runs an armed race the instant ONE statement of a request comes back —
/// the statement <paramref name="isTheRead"/> names — before the request
/// reads anything else. Fires at most once, and only while armed; the race's
/// own commands pass through untouched.
///
/// <para>Written for <c>GET /api/dashboard/preferences</c> (SMA-448, PR #293,
/// fix round 1, S4) and shared with <c>GET /api/formulas</c> (lot F3, step
/// L2, E9): each snapshot test names the joined read it requires, so a read
/// gone back to two statements matches nothing, <see cref="Fired"/> stays
/// false, and the test says so (R2-G1 — GitHub 4111245319).</para>
/// </summary>
internal sealed class FormulaReadRaceInterceptor(Func<string, bool> isTheRead) : DbCommandInterceptor
{
    private Func<Task>? _race;
    private int _fired;
    private int _seen;

    public bool Fired => Volatile.Read(ref _fired) == 1;

    /// <summary>How many commands passed through while armed — zero means the interceptor was never wired.</summary>
    public int Seen => Volatile.Read(ref _seen);

    public void Arm(Func<Task> race)
    {
        Volatile.Write(ref _fired, 0);
        Volatile.Write(ref _seen, 0);
        _race = race;
    }

    public override async ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result,
        CancellationToken cancellationToken = default)
    {
        // AFTER the read, not before: under READ COMMITTED a statement's
        // snapshot is taken when it starts, so a write committed before the
        // read would simply be part of it and prove nothing.
        var race = _race;
        if (race is null) return await base.ReaderExecutedAsync(command, eventData, result, cancellationToken);

        Interlocked.Increment(ref _seen);

        if (isTheRead(command.CommandText) && Interlocked.Exchange(ref _fired, 1) == 0)
        {
            _race = null;
            await race();
        }

        return await base.ReaderExecutedAsync(command, eventData, result, cancellationToken);
    }
}
