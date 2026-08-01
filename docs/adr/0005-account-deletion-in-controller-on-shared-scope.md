# ADR-0005: Account deletion and export live in AuthController, on a shared-scope transaction

- **Status**: Accepted
- **Date**: 2026-08-01
- **Deciders**: Alexandre (project owner), documented during the SMA-341 round-2 review (PR #193 — CodeRabbit asked for this record on both review surfaces)
- **Context**: SMA-341 shipped the GDPR self-service endpoints (`DELETE /api/auth/account`, `GET /api/auth/account/export`) as a go-live prerequisite; two architectural facts they rely on deserve a durable record

## Context

`DELETE /api/auth/account` must delete the caller's gardens BEFORE the Identity user, because `Gardens → AspNetUsers` is `DeleteBehavior.Restrict` (a bare `UserManager.DeleteAsync` fails outright for any garden owner), and it wraps the whole sequence — `ExecuteDeleteAsync` on gardens, two `ExecuteUpdateAsync` anonymization passes on `PlantSuggestions`, then `UserManager.DeleteAsync` — in a single transaction opened on the injected `SmartCropsDbContext`. A half-deleted account (gardens gone, user still present) is worse than a failed deletion.

Two facts about this design were raised by the SMA-341 round-1 review:

1. **The transaction depends on `UserManager<ApplicationUser>` and the injected `SmartCropsDbContext` resolving the SAME scoped instance.** `UserManager.DeleteAsync` issues its `SaveChangesAsync` through its own store; that write joins the controller's transaction only because the store's context IS the controller's context. The review's Extension surface investigated this concern and self-invalidated it: `AddEntityFrameworkStores<SmartCropsDbContext>()` registers `UserStore` against the same scoped `AddDbContext<SmartCropsDbContext>` registration the controller receives, so the assumption is SOUND today — but it is implicit, and nothing in the code would fail loudly at startup if it stopped being true.

2. **Deletion ordering and export scope are domain rules living in an HTTP controller.** The gardens-first order, the decision that `PlantSuggestions` a user AUTHORED are their personal data (anonymized on erasure, carried in the export) while suggestions they merely REVIEWED are moderation records about someone else (identity severed on erasure, EXCLUDED from the export), and the arts. 17/20 scope-parity requirement are business rules of the GDPR domain, currently expressed inline in `AuthController`.

## Decision

Record both facts; change neither in this lot.

1. **The scope-identity assumption is accepted as load-bearing and is documented here.** Anyone re-registering the Identity store over a DIFFERENT context — a second `DbContext` dedicated to Identity, a pooled/factory registration for `SmartCropsDbContext` that breaks per-request instance sharing, or a custom `IUserStore` with its own persistence — breaks the deletion transaction SILENTLY: the gardens delete and the user delete would commit independently, and a failure between them would produce exactly the half-deleted account the transaction exists to prevent. Any such change must either keep a single shared scoped context or replace the transaction with an explicit shared-connection strategy (e.g. `DbContext.Database.UseTransaction` on both contexts).

2. **The domain rules stay in `AuthController` for this lot; no `IAccountDataService` is extracted.** SMA-341 is a go-live prerequisite; extracting a service layer mid-lot is a refactor with its own review surface and risk, on a controller whose auth plumbing (cookie handling, `GetCurrentUserId`, email helpers) the endpoints legitimately share.

## Rationale

The assumption in (1) is not hypothetical plumbing trivia: it is the difference between "one transaction" and "two uncoordinated writes" in an irreversible flow. Documenting it here is the cheapest guard available — a test asserting reference equality between the store's context and the injected one would couple the suite to Identity internals, while this record costs nothing and names the exact refactors that would break the invariant.

For (2), the standard argument for extraction (testability, reuse) is weak today: the rules have exactly one consumer each, and the integration tests exercise them end-to-end through the HTTP surface — which is also the layer where the GDPR contract (status codes, opaque error bodies, file download semantics) actually lives.

## Alternatives considered and rejected

- **Extract `IAccountDataService` now.** Rejected for this lot: a refactor inside a go-live prerequisite, doubling the review surface for zero behavioral change. Revisit when a second consumer appears (see below).
- **Assert the scope identity at runtime** (e.g. a startup check or an in-transaction reference comparison). Rejected: couples production code to Identity's store internals for a condition that only a deliberate DI change can break; the ADR names that change instead.
- **Replace the shared-scope transaction with `TransactionScope`.** Rejected: ambient transactions with async EF Core carry their own pitfalls (provider support, escalation), and the current explicit `BeginTransactionAsync` is simpler and already correct under the invariant.

## Consequences

- The DI registration of `SmartCropsDbContext` and `AddEntityFrameworkStores<SmartCropsDbContext>()` is load-bearing for account deletion. PRs touching either must check this ADR.
- The arts. 17/20 scope decisions (authored = the person's data; reviewed = someone else's) are recorded once here and mirrored in code comments at both endpoints; policy copy (§07) and `profile.exportBody` must stay aligned with them.
- The export's buffered serialization (whole document materialized to a byte array before the response starts) is a known ceiling recorded in a code comment at the endpoint; streaming (`JsonSerializer.SerializeAsync` against `Response.Body`) is the named future direction, deliberately not implemented at today's data shape.

## When to revisit

- **A second consumer of deletion or export appears** — an admin-console GDPR deletion (SMA-156), a scheduled retention job, or a CLI — extract `IAccountDataService` then, moving the ordering and scope rules with it.
- **Identity storage changes** — a dedicated Identity `DbContext`, context pooling, or a custom user store — the shared-scope invariant must be re-established or the transaction strategy replaced (see Decision 1).
- **Export payloads grow** past a few hundred placements per account, or GDPR export bursts show up in memory metrics — implement the streaming path.

## Related

- **ADR-0001** (DateTime UTC convention) — the export's single `exportedAt` read follows it.
- **SMA-341** (this lot), **SMA-156** (admin-console GDPR deletion, very long term — the likely second consumer), **SMA-348** (retention-section inaccuracies, tracked separately).
- Pre-flight report `rapport-sma341-preflight.md` — the FK/cascade ground truth (Gardens RESTRICT, Identity satellites CASCADE) the deletion order rests on.
