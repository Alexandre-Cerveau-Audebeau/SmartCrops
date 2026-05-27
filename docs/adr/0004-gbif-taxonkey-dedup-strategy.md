# ADR-0004: GbifTaxonKey-based plant deduplication strategy

- **Status**: Accepted
- **Date**: 2026-05-26
- **Deciders**: Alexandre (project owner), with documentation drafted during the Issue #86 / SMA-11 pre-flight audit
- **Context**: PR #84 (bulk-import batch 1) surfaced persistent GBIF unique-index collisions between rows holding semantically equivalent but textually distinct `ScientificName` values

## Context

The `Plant` table dedups inserts on a case-insensitive `LOWER(ScientificName)` functional unique index (see PR #81). That dedup catches identical names with case variation, but it does not see synonyms, recent botanical reclassifications, or taxonomy drift on the GBIF side. When two distinct `ScientificName` values resolve to the same accepted GBIF taxon (e.g. `Rosmarinus officinalis` and `Salvia rosmarinus`, both mapping to GBIF usage key `10902460`), the bulk-create endpoint stages two separate rows. Per-source enrichment then runs against each row; the first GBIF enrichment writes the shared `GbifTaxonKey`, the second hits `IX_Plants_GbifTaxonKey` (a `UNIQUE INDEX … WHERE "GbifTaxonKey" IS NOT NULL`) and rolls back its whole transaction with PostgreSQL SqlState `23505`.

The PR #84 batch-1 run produced 2 such collisions on 75 plants (the rosemary pair and the leek pair — `Allium porrum` vs `Allium ampeloprasum`). Both collisions involved rows whose origin was unrelated to the bulk-import batch itself: the SMA-11 pre-flight audit established that the conflicting partner row in each pair was inserted manually during earlier dev/smoke work, not by the canonical seeder (which already uses the modern accepted names). The mechanism is row-origin-agnostic — any pair of `Plant` rows with textually distinct `ScientificName` values that resolve to the same accepted taxon will collide at enrichment time, regardless of whether they came from the seeder, the bulk-import endpoint, admin UI manual creation, or future external integrations.

The leek case additionally illustrates **taxonomy drift over time**: the previously-enriched row's stored key dates from an older GBIF taxonomy snapshot, and today's GBIF assigns the same numeric key to a different name. Pre-flight checks against current GBIF do not predict drift artefacts already persisted.

Scale projection: at 1000-3000 plants, the expected collision count from synonyms + reclassifications + intra-batch overlaps is in the **10-50/1000** range. Without a strategy, every batch import will lose a non-trivial fraction of its rows to silent enrichment failures classified as `Failed`.

## Decision

Three complementary layers, none of them load-bearing on its own:

1. **(a) Ad-hoc merges for known duplicate pairs in the dev DB.** For each existing duplicate pair — two rows whose `ScientificName` values resolve to the same accepted taxon — keep the row with richer enrichment data as the survivor, migrate any user-relational FKs (`GardenPlacements`, `GardenPlants`, `PlantSuggestions`) and merge content-display FKs (`PlantCommonNames`, `PlantImages`, `PlantLongDescriptions`, `PlantPests`, `PlantSynonyms`, `PlantTranslations`) loser-to-survivor with natural-key dedup, then delete the loser. Raw 1-1 enrichment data on the loser (`PlantTrefleData`, `PlantPerenualData`, `PlantSources` from the loser's enrich runs) is intentionally discarded with the loser — the survivor either already has its own or will get it re-enriched in the same operation.

2. **(b) Pre-flight overlap detection at batch staging time.** The `scripts/bulk-import` pre-flight tool already resolves every candidate `ScientificName` against GBIF `species/match`. Extend it with two cross-checks: (i) for each resolved accepted key, query the DB for any existing `Plant` row carrying that key under a different `ScientificName`; (ii) detect intra-batch collisions where two candidates resolve to the same accepted key. Output a flagged-overlaps companion file for human review before bulk-create runs. No auto-resolution — the curator decides per row whether to drop the duplicate, merge with the existing row, or accept the collision knowingly. Tracked as a follow-up issue (SMA-45).

3. **(c) Runtime resilience: catch `23505` on `IX_Plants_GbifTaxonKey`.** Even with (b), taxonomy drift means a previously-enriched plant can collide retroactively with a new plant. The GBIF enrichment controller (and the future shared chunk runner from Issue #83) catches the specific `PostgresException { SqlState: "23505", ConstraintName: "IX_Plants_GbifTaxonKey" }` case and classifies the outcome as `Skipped` with `Reason: "DuplicateTaxonKey"` instead of `Failed`. The driver's per-plant transaction still rolls back, but the batch continues and the operator gets a structured signal (which existing row owns the key) that a merge is needed. Tracked as a follow-up issue (SMA-46).

The `IX_Plants_GbifTaxonKey` UNIQUE partial index is preserved as the authoritative single-row-per-accepted-taxon guarantee at the DB layer. Multiple `NULL` values remain permitted via the existing `WHERE "GbifTaxonKey" IS NOT NULL` filter clause.

## Rationale

The three-layer approach is preferred because each layer covers a distinct angle the others cannot. **DB-level uniqueness on `IX_Plants_GbifTaxonKey`** stays as the cheapest final guard against silent duplicate writes from any source — demoting it (alternative d) would require defensive checks at every write site without protecting ad-hoc manual `INSERT`s during smoke testing. **GBIF resolution is deliberately kept out of the synchronous staging path** (alternative e) so bulk-create remains independent of upstream API availability, preserving the stage-first / enrich-later separation the seek-cursor enrich-all driver (PR #82) relies on. And the three layers themselves are complementary: (a) one-shot remediation of known duplicates, (b) scalable prevention at staging time for new batches, (c) runtime resilience to taxonomy drift that (b) cannot predict — the leek case is the canonical example of why (c) is load-bearing on top of (b). Each layer covers a blind spot of the others; none is sufficient alone.

## Alternatives considered and rejected

- **(d) Demote `IX_Plants_GbifTaxonKey` to a non-unique index, dedup in application code.** Rejected. The DB-level uniqueness constraint is a cheap final guard against silent duplicate writes that originate from any path (admin UI, bulk import, future external integrations). Moving the guarantee into application code would require defensive checks at every write site and would not protect against ad-hoc manual `INSERT`s during smoke testing. The PostgreSQL `23505` error is loud and structured — a worse outcome than catching it and routing to `Skipped/DuplicateTaxonKey` is silent data divergence.

- **(e) Pre-resolve the GBIF accepted name at bulk-create time and dedup on the accepted name instead of the input `ScientificName`.** Rejected. Bulk-create is a synchronous staging endpoint that must remain independent of upstream API availability (GBIF rate limits, transient outages, taxonomy server flips). Pushing GBIF lookups into the synchronous insert path breaks the stage-first/enrich-later separation that the seek-cursor enrich-all driver (PR #82) is built around: enrichment is allowed to fail and resume, staging is not. Keeping resolution in the pre-flight tool (layer b) places the GBIF dependency where it belongs and gives the curator a chance to override before any DB write.

## Consequences

- **The pre-flight tool becomes the canonical staging gate for scale-up.** Running `scripts/bulk-import` pre-flight against the DB before each batch becomes a documented requirement once layer (b) ships. Future runbooks and the `scripts/bulk-import/README.md` need to reflect this.

- **The enrichment outcome enum grows a new `Skipped` subtype `DuplicateTaxonKey`.** The driver script and any future admin UI must distinguish this from `NotMatched` (data variance, retry won't help) and from generic `Failed` (transient, retry recommended). The README bounded-retry section already accommodates a third stable-failure category — the `DuplicateTaxonKey` count signals a merge candidate, not a re-run candidate.

- **Taxonomy drift is documented as an operational reality.** Plants enriched today may collide with plants enriched tomorrow even when names are semantically distinct, because GBIF's accepted-key assignments are not stable across multi-year horizons. The leek case (the previously-enriched `Allium porrum` row carrying `2856037`, today's accepted key for `Allium ampeloprasum`) is the canonical example. Layer (c) is the load-bearing response; layer (b) shrinks the drift surface but does not eliminate it.

- **No schema migration.** All three layers operate on top of the existing index. Layer (a) is one-shot DML against the live DB. Layer (b) is a script change. Layer (c) is a controller/runner change.

- **Library / read-model surface implications.** Once duplicates are merged, the library may surface plants that have multiple historical aliases (e.g. a single row for `Salvia rosmarinus` that the user previously knew as `Rosmarinus officinalis`). Surfacing aliases is out of scope for this ADR but is tracked separately under SMA-7 (synonym display).

This PR (Issue #86 / SMA-11) ships layer (a) only.

## When to revisit

- **Observed collision rate at scale exceeds projection by ~2×.** The 10-50/1000 projection in Context is informed by current synonym/reclassification density. If the SMA-13 scale-up run measures collisions sustained above ~100/1000, the three-layer plan is under-resourced: re-evaluate whether layer (b) prevention is sufficient or whether automated reconciliation (a generalisation of layer (a)) needs to ship.
- **GBIF contract / taxonomy change.** Either a breaking change to the `species/match` API surface (response shape, rank semantics, `acceptedUsageKey` resolution) or a public statement that GBIF accepted keys are not stable identifiers would invalidate the "accepted taxon = plant identity" assumption layer (a)/(b) rely on. The taxonomy-drift behaviour the leek case exhibits is already known; we're talking about a step-change beyond that.
- **Pre-flight latency degrades at scale.** Layer (b) does a DB cross-check per resolved key. On batches in the low thousands this should stay well under a minute, but if the per-candidate `SELECT 1 FROM "Plants" WHERE "GbifTaxonKey" = …` lookup becomes a bottleneck (e.g. driver run wall-time dominated by pre-flight rather than upstream API calls), shift to a single bulk `WHERE … IN (…)` round-trip per batch and/or align with AI-5's `CREATE INDEX CONCURRENTLY` runbook at 100k+ rows.

## Related

- **ADR-0003** (Plant denormalized read model) — provides the dual-write context that gives raw enrichment rows their `1-1` relationship with `Plant`. Merging duplicates means raw enrichment data on the loser is discarded with the loser, accepted as a known cost.
- **Issue #83 / SMA-12** (shared EnrichAll chunk runner) — once the three GBIF/Trefle/Perenual enrichment controllers consolidate into one runner, layer (c)'s `23505` catch lands in one place rather than three.
- **SMA-45** (pre-flight overlap detection) — layer (b) implementation.
- **SMA-46** (runtime `DuplicateTaxonKey` classification) — layer (c) implementation.
- **SMA-7** (synonym display in the library) — read-model surface implication once duplicates are merged.
