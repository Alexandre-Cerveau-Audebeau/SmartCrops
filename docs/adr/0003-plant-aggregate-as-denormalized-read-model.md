# ADR-0003: `Plant` aggregate as the denormalized read model

- **Status**: Accepted
- **Date**: 2026-05-17
- **Deciders**: Alexandre (project owner), with documentation drafted during PR #57 planning
- **Context**: PR #57 pre-flight audit revealed a documentation gap around the Plant aggregate's denormalization strategy

## Context

PR #36 ("Plant enrichment EF Core migration") denormalized roughly 25 Trefle and Perenual fields directly onto the `Plant` entity, alongside the 8 enrichment tables that were created in the same migration (`PlantTrefleData`, `PlantPerenualData`, `PlantImage`, `PlantCommonName`, `PlantSynonym`, `PlantPhase`, `PlantSource`, `PlantLongDescription`).

That denormalization was a deliberate architectural choice but was **never formally documented**. The XML doc on `Plant` mentions "denormalized READ MODEL" in passing, and the ETL note hints at the merge priority `Manual > Perenual > Trefle > GBIF`, but no ADR captured the rationale, the trade-offs, or the write-time contract for future ETL services.

The PR #57 pre-flight audit surfaced the cost of this gap directly: the original planning assumed `Plant` was a thin canonical entity and scheduled the addition of ~40 fields that already existed (because memories #20/#23 were stale relative to the actual schema). This ADR captures the decision so the next planning session — and the upcoming ETL PRs — can rely on a single source of truth.

## Decision

**`Plant` is the denormalized read model for the plant aggregate.**

- **`Plant` holds** the curated, query-optimized representation: scientific name, taxonomy (`Family` / `Genus` / `SpeciesEpithet` / `Author` / `Year` / `GbifTaxonKey` / `WfoId`), classification booleans (`Is*` prefix), enum-typed traits (`LifeCycle` / `GrowthRate` / `CareLevel` / `WateringNeedLevel` / `GrowthHabit`), numeric ranges (`Min/Max HeightCm` / `Min/Max SpreadCm` / `Min/Max TempC` / `Min/Max HardinessZone`, `SoilPhMin/Max`, `LightLevel`, `SoilNutriments`), structured JSON arrays (`FlowerColors`, `NativeRegions`, `IntroducedRegions`, `EdibleParts`), free-text descriptions (`SowingInstructions`, `PropagationInstructions`), and the primary `ImageUrl`.

- **Enrichment tables serve three distinct roles**:
  - **Audit trail** of raw source data — `PlantTrefleData.RawResponseJson`, `PlantPerenualData.RawResponseJson`, `PlantSource` with `LastFetchedAt`, and the per-source typed fields (`PlantTrefleData.WfoId/TrefleSlug/GrowthHabit/FlowerColors/NativeRegionsJson/IntroducedRegionsJson`, `PlantPerenualData.PerenualType/SunlightPreferences/PropagationMethods/...`)
  - **Multilingual storage** — `PlantCommonName` (one row per language with BCP 47 code), `PlantLongDescription` (one row per language)
  - **1-N relations that don't naturally fit on `Plant`** — `PlantImage` (categorized via `PlantImageType` + per-image license/credit), `PlantPhase` (lifecycle timeline), `PlantPest` (diseases/pests added in PR #57), `PlantSynonym` (taxonomic synonyms)

- **ETL services dual-write**: every Trefle / Perenual / GBIF ingestion populates both
  - the relevant enrichment row (raw source preservation), and
  - the matching denormalized fields on `Plant` (curated read model).

- **UI and API queries read from `Plant` directly**. Cross-join to enrichment tables is reserved for the intrinsically 1-N scenarios (multilingual `PlantCommonName`, multi-image `PlantImage`, timeline `PlantPhase`, pest list `PlantPest`).

## Rationale

1. **Read performance.** The Library page lists 30+ plants with full enrichment data; cross-joining 8 enrichment tables on every page load is unnecessarily slow and complicates query plans. A denormalized `Plant` row reduces this to a single-table lookup.

2. **Query simplicity.** Filtering by flower color, native region, growth habit, or hardiness zone is a single `WHERE` clause on `Plant`. The same filter against the audit tables would require joins and would surface raw-format quirks (per-source slug strings, JSON `*Json` columns vs. canonical typed columns).

3. **Audit preservation.** The enrichment tables retain raw API responses (`RawResponseJson`) and per-fetch metadata (`LastSyncAt`, `LastFetchedAt`), enabling re-derivation if curation rules evolve without re-calling external APIs.

4. **CQRS-lite.** The architecture separates a read-optimized model (`Plant`) from write-side audit and source-of-truth tables. This is a well-understood pattern for domains where reads vastly outnumber writes, which is the SmartCrops case (ETL runs on a slow cadence; reads happen on every page view).

## Consequences

### Positive

- Library, Plant Detail, and recommendation queries are fast and simple.
- The ETL contract is explicit: "populate both raw audit and denormalized fields in the same transaction".
- The schema mirrors the read model directly; no client-side join logic.

### Negative

- **~2× storage overhead** on the duplicated fields. Acceptable at SmartCrops scale (the plant catalogue is bounded — even an exhaustive ingestion is well under 1M rows).
- **ETL coordination overhead.** Every Trefle / Perenual / GBIF ingestion must update two locations atomically. Mitigated by EF Core transactions: the dual write is one `SaveChanges` call.
- **Drift risk** if denormalization rules change and existing rows aren't re-derived. Mitigated by treating any rule change as a planned re-derivation PR (read raw from enrichment table, recompute, update `Plant`).

## When to revisit

- If storage becomes a constraint (unlikely at SmartCrops scale).
- If write-heavy workflows emerge — e.g. user-generated `PlantSuggestion` rows being applied to `Plant` at high frequency — and the denormalization write cost dominates.
- If multi-tenant or per-region curation requirements introduce conflicting denormalization values (one tenant wants tomato classified as a vegetable, another as a fruit).
- If the catalogue grows past the rough "single-region warm cache" bound (~1M plants) and the read-time benefit of denormalization no longer outweighs the storage cost.

## Related

- PR #36 — `feat(infra): Plant enrichment EF Core migration` (implemented the denormalization implicitly)
- PR #41 — `feat(infra): BCP 47 CHECK constraint on PlantCommonName.LanguageCode` (companion convention for multilingual storage on `PlantCommonName`)
- PR #55 — `feat(domain): complete UpdatedAt coverage on Plant aggregate (closes #38)` (interceptor + DEFAULT alignment across the aggregate)
- PR #56 — `feat(infra): Testcontainers PostgreSQL integration tests (closes #39)` (integration test infrastructure exercises both `Plant` and enrichment-table invariants)
- PR #57 — `feat(domain): D1 Plant real delta + ADR-0003 denormalization strategy` (this ADR + the real-delta field additions + `PlantPest` entity)

The upcoming ETL PRs (GBIF taxonomy, Trefle, Perenual Supreme bulk) will apply the dual-write rule established here.
