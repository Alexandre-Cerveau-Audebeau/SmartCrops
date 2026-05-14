# ADR-0001: Use `DateTime` with UTC convention rather than `DateTimeOffset`

- **Status**: Accepted
- **Date**: 2026-05-12
- **Deciders**: Alexandre (project owner)
- **Context**: CodeRabbit feedback on PR #37 (SaveChangesInterceptor for UpdatedAt)

## Context

CodeRabbit raised the `DateTime` vs `DateTimeOffset` question three times during the review of PR #37:

- On `IHasUpdatedAt.UpdatedAt` (Comment 1.1, actionable / major)
- On `PlantImage.cs` timestamp properties (Comment 2.2, assertive)
- As Architectural Insight #7 in the GitHub PR summary

The suggestion is to switch all timestamp properties from `DateTime` to `DateTimeOffset` to:

- Preserve explicit timezone offset information
- Prevent ambiguity when data crosses geographic boundaries
- Future-proof for distributed system scenarios

## Decision

We keep `DateTime` (in UTC) across the entire codebase for the current scope of SmartCrops v2.

## Rationale

1. **Single-tenant, single-timezone application.** SmartCrops is mono-tenant France-centric. There is no scenario today where timestamps cross timezone boundaries.
2. **Strict UTC convention already enforced.** Every code path uses `DateTime.UtcNow`. PostgreSQL columns are `timestamp without time zone` with the documented invariant that values are stored as UTC. The `Kind` ambiguity (`Local` vs `UTC` vs `Unspecified`) that motivates `DateTimeOffset` in mixed-convention codebases does not exist here.
3. **Cost of migration is high.**
   - 15+ entities to refactor (Plant, Garden, GardenPlant, GardenPlacement, ApplicationUser, 8 enrichment tables, PlantSuggestion, etc.)
   - 1 Postgres migration: `timestamp` → `timestamptz` on every timestamp column, non-trivially reversible
   - DTOs and API contracts that serialize timestamps would change (potential breaking change for the frontend)
   - All tests that assert on timestamps would need adjustment
4. **Benefit at current scope: zero.** No multi-timezone use case is on the roadmap (Phase 6 IA, OVH deployment, planned features).
5. **CodeRabbit itself acknowledges the trade-off**: *"If the system will remain single-timezone or consistently uses UTC, DateTime is sufficient."*

## Consequences

### Positive

- Reduced refactoring effort during the active build phase (PR #34–#46 backlog).
- Consistency with existing migrations and seed data.
- Simpler mental model: every timestamp is UTC, period.

### Negative

- Risk of a future developer breaking the UTC convention (e.g. using `DateTime.Now`). Mitigation: code review and a static analysis rule could be added later if needed.
- If SmartCrops ever needs multi-timezone or B2B public API timestamps, this decision will need to be revisited and the migration paid for then.

## When to revisit

Trigger this ADR for re-evaluation if any of the following becomes a roadmap item:

- Multi-region deployment with users in different timezones
- A public B2B API that exposes signed timestamps
- Integration with external services that require explicit timezone offsets (e.g. audit trails for compliance)
- The codebase grows past ~30 entities with timestamps and the duplication / risk profile changes

## Related

- PR #37: SaveChangesInterceptor for auto-update UpdatedAt (this ADR was created in response to that review)
- `src/backend/SmartCrops.Infrastructure/Interceptors/UpdateTimestampInterceptor.cs`: XML doc references this ADR
