# Bulk import -- driver scripts

This directory holds the two scripts that bracket a bulk-import run:

1. **`Invoke-BulkImportPreflight.ps1`** — pre-flight overlap gate. Run this
   **before** posting the curated CSV to `/api/admin/bulk-import` so any
   GBIF taxon-key collisions are flagged for human review.
2. **`Enrich-AllSources.ps1`** — post-create enrichment driver. Walks every
   newly-staged `Plant` row through the three `/enrich-all` endpoints.

## Pre-flight overlap gate (SMA-45, ADR-0004 layer b)

### Why

`POST /api/admin/bulk-import` deduplicates on `ScientificName` only
(case-insensitive). Two distinct names that resolve to the same accepted
GBIF taxon (e.g. `Rosmarinus officinalis` / `Salvia rosmarinus`, both →
`10902460`) will both be staged, and then collide on `IX_Plants_GbifTaxonKey`
at enrichment time. PR #84's batch-1 run produced 2 such collisions on 75
plants; the projection for the 1000-3000-plant SMA-13 scale-up is
**10-50 collisions per 1000 rows** if no pre-flight runs.

The pre-flight calls `POST /api/admin/bulk-import/preflight`, a read-only
endpoint that resolves every candidate against GBIF (via the same
`GbifDedupResolver` the runtime enrichment uses — single source of truth)
and flags two classes of overlap:

- **`intra_batch`** — two or more candidates in the same submission resolve
  to the same accepted key.
- **`db_existing`** — a candidate's resolved key already lives on a `Plant`
  row carrying a *different* scientific name (case-insensitive).

Candidates GBIF cannot resolve are counted as `NoMatch` and excluded from the
overlap checks (a NoMatch row cannot collide on a key it doesn't have); the
count is surfaced so the curator can investigate spelling / taxonomy issues
before enrichment.

### Auth

The pre-flight endpoint is `[Authorize]` — same policy as bulk-import
itself. Provide an admin bearer token via the environment variable
(recommended, keeps it out of shell history):

```powershell
$env:SMARTCROPS_TOKEN = "<jwt>"
```

Or pass it once via `-Cookie`. **Never hardcode the token in the script or
this doc**, and never commit it. The token follows the same lifecycle as for
`Enrich-AllSources.ps1` (lift the JWT from the SPA's local storage, or hit
the login endpoint directly).

### Usage

```powershell
$env:SMARTCROPS_TOKEN = "<jwt>"
.\Invoke-BulkImportPreflight.ps1 -CuratedCsv .\curated-batch1.csv
```

Parameters:

| Parameter    | Default                  | Notes                                                                         |
| ------------ | ------------------------ | ----------------------------------------------------------------------------- |
| `CuratedCsv` | (required)               | Path to the curated CSV. Same schema as `curated-batch1.csv`.                 |
| `BaseUrl`    | `http://localhost:5000`  | Backend root, no trailing slash.                                              |
| `ChunkSize`  | `250`                    | Candidates per POST. Server cap is 500; chunks larger than 500 will 400.      |
| `Cookie`     | `$env:SMARTCROPS_TOKEN`  | Admin bearer. Required.                                                       |

Output: `exports/flagged-overlaps.csv` is always rewritten (the file's
**row count** is the signal — header-only when the batch is clean). Schema:

```
candidate_scientific_name,candidate_category,resolved_accepted_key,
resolved_match_type,conflict_type,conflicting_partner,suggested_action
```

Exit code: `1` when at least one overlap is flagged, `0` otherwise. The
script prints a one-line per-chunk summary and a final aggregate.

### Iterate to clean

The intended loop is:

1. Run the pre-flight against the curated CSV.
2. If `flagged-overlaps.csv` has rows, the curator **edits the curated CSV**
   to resolve them (drop the colliding candidate, replace with a non-
   overlapping name, or flag for a planned merge per ADR-0004 layer a).
3. Re-run the pre-flight. Repeat until `flagged-overlaps.csv` has 0 rows.
4. Then `POST /api/admin/bulk-import` with the cleaned curated list.
5. Then run `Enrich-AllSources.ps1` (next section).

The pre-flight is read-only: it can be run any number of times against a
hot DB without side effects.

### Known limit: taxonomy drift (SMA-46)

The pre-flight asks GBIF for **today's** accepted key. A plant enriched
months ago may carry a key that, at the time, accepted a different name —
GBIF's accepted-key assignments are not stable across multi-year horizons.
The leek case from RUN_REPORT_batch1.md is the canonical example: the
previously-enriched `Allium porrum` row was carrying `2856037`, which
today's GBIF assigns to `Allium ampeloprasum`. The pre-flight will report
this as a `db_existing` overlap, but it cannot tell the curator whether it
is a genuine synonym collision or a drift artefact — the human still has
to look. **Runtime resilience for collisions the pre-flight cannot
predict** is layer (c) of ADR-0004, tracked under SMA-46: the GBIF
enrichment path catches the `23505` on `IX_Plants_GbifTaxonKey` and routes
the outcome to a `Skipped/DuplicateTaxonKey` classification instead of
`Failed`.

---

## Enrichment driver: `Enrich-AllSources.ps1`

The remaining sections describe the post-create enrichment driver. It walks
every `Plant` row through the three `/enrich-all` endpoints with keyset
(seek) pagination and loops each phase until the cursor reaches the tail of
the `!XxxEnriched` set.

## When to use

After a bulk-create run (`POST /api/admin/bulk-import`, PR #80) has staged
minimal Plant rows with `EnrichmentStatus = Manual`. The driver script is
what turns those minimal rows into fully-enriched plants.

## Phase order (non-negotiable)

`GBIF -> Trefle -> Perenual`

- **GBIF writes `plant.Genus`** (and Family, SpeciesEpithet, GbifTaxonKey).
- **Perenual's genus gate reads `plant.Genus`.** Running Perenual before
  GBIF makes the gate fire its conservative-skip branch (null/empty genus
  can't be validated) and silently drops Perenual scalar + xData
  denormalisation. The audit row still lands; the useful data does not.
- **Trefle is independent**, but slotting it second keeps the phase order
  monotonic with the dependency.

## Cursor model (PR 2a-2 round 2)

Each phase uses `?afterId=<Guid>` as a keyset cursor. The query is
`WHERE Id > afterId AND (EnrichmentStatus & XxxEnriched) == 0 ORDER BY Id
LIMIT N`, and the response returns `NextAfterId = max(processed Id)`. The
driver advances the cursor each chunk, so **every plant is scanned exactly
once per pass regardless of whether the upstream source matched it**.

This replaces the original `OrderBy(Id).Take(limit)` design (CR r1 #2),
which could stall: a front block of unmatchable plants (NoMatch never
gets flagged) stayed at the head of every chunk, and the previous
stalled-remaining guard would halt the phase before any larger Id was
ever attempted.

Termination is a short chunk (`Total < Limit`) or a null cursor. The
stalled guard is no longer needed.

## Resumability

No state file. The SQL filter `(EnrichmentStatus & XxxEnriched) == 0` IS
the state. Crash the script halfway through, fix the issue, re-run with
the same `-Limit` -- every plant already flagged is excluded by the next
chunk's `Where` clause, and the cursor restarts from the head of the
remaining `!flagged` set.

Plants the upstream source could not match (`NoMatch`) are never flagged,
so they are retried on every re-run. If you want to stop retrying them,
either fix the upstream input (rename the species, etc.) or pass
`?force=true` to that phase's endpoint once the inputs are clean.

## Failure model (Failed vs NotMatched)

`EnrichAll` walks every plant in the chunk through the per-plant
`Enrich(id)` action wrapped in a `try/catch`. Two outcomes are distinct:

- **`NotMatched`** — the upstream resolver returned `NONE` (the plant
  name is not in GBIF/Trefle/Perenual, or no candidate cleared the
  match thresholds). The plant stays `!XxxEnriched`. Re-running won't
  change anything until you fix the input (rename the species, supply
  an explicit Perenual id, etc.) or pass `?force=true`.

- **`Failed`** — the enrichment threw (HTTP 5xx, transient network
  blip, deadlock, a row that surfaced a defensive guard). The plant
  also stays `!XxxEnriched`, but the cause is transient: a retry is
  expected to succeed.

**The cursor advances past failed plants within a single run.** This
is deliberate. The two alternatives are both worse:

- "Advance only to the last successful Id" re-introduces the head-of-set
  stall the seek cursor was added to fix (PR 2a-2 r2): if an entire
  chunk fails, the cursor doesn't move and the next chunk re-fetches
  the same rows forever.
- "Re-throw on first failure" turns one bad plant into a poison-pill
  that aborts a 3000-plant run. The 2999 healthy plants must not pay
  for one transient blip.

A failed plant is **never lost**. The driver holds no state file:
`-afterId` resets to `null` at the start of each run, so the next
invocation re-queries `(EnrichmentStatus & XxxEnriched) == 0`, the
failed plant is still in that set, and it's re-selected at the head
of the remaining rows.

**Mop-up recipe.** When the driver prints
`WARNING: N plant(s) failed during <source>`, re-run the script.
Repeat until `Failed = 0` on every phase or until the remaining
plants are stable `NotMatched` (data variance — see above). If the
same plants fail repeatedly, inspect the API logs — the per-plant
exception is logged at `Error` with the plant Id.

**Bounded retry.** If the same plants keep failing across 3+
consecutive runs, treat the failures as persistent (data-quality
issue, a defensive validation guard firing, or a permanently-broken
upstream record) rather than transient (network blip, deadlock).
Stop re-running and inspect the per-plant exception in the API logs
before any further attempt — retrying persistent failures only
burns API quota.

## Final `NotEnrichedRemaining` interpretation

The response includes `NotEnrichedRemaining` for observability. After a
full driver run it counts plants no upstream source ever matched -- data
variance, not a bug. Investigate per-plant via the single-plant `enrich/`
endpoint if needed.

The field is always present (non-nullable `int` in `EnrichAllResponse`);
the driver's `PSObject.Properties.Name -contains 'notEnrichedRemaining'`
check is purely defensive against a future schema regression.

## Auth

The `enrich-all` endpoints are `[Authorize]`. Pass an admin bearer token
via `-Cookie` or `$env:SMARTCROPS_TOKEN`. **No secret is hardcoded** in
the script or this doc.

Get a token by logging in through the SPA (devtools -> Application ->
Local Storage -> copy the JWT) or by hitting the login endpoint directly.

## Usage

```powershell
# Recommended: env var (no token in shell history)
$env:SMARTCROPS_TOKEN = "<jwt>"
.\Enrich-AllSources.ps1 -BaseUrl http://localhost:5000 -Limit 50

# One-off
.\Enrich-AllSources.ps1 -Cookie "<jwt>" -Limit 25 -ThrottleSeconds 5
```

## Parameter defaults

| Parameter         | Default                  | Notes                                                                    |
| ----------------- | ------------------------ | ------------------------------------------------------------------------ |
| `BaseUrl`         | `http://localhost:5000`  | Backend root, no trailing slash.                                         |
| `Limit`           | `50`                     | Chunk size. `[ValidateRange(1, MaxValue)]` at bind-time.                 |
| `ThrottleSeconds` | `2`                      | Sleep between successful chunks. `[ValidateRange(0, MaxValue)]`.         |
| `Cookie`          | `$env:SMARTCROPS_TOKEN`  | Auth bearer. Required.                                                   |

## Scale note (runbook AI-5)

`CREATE INDEX CONCURRENTLY` on the composite `(EnrichmentStatus, Id)`
only becomes relevant at 100k+ rows. The column order is deliberate: the
keyset query is `WHERE (EnrichmentStatus & XxxEnriched) == 0 AND Id >
afterId ORDER BY Id`, so the index is leading-column aligned on the
filter and trailing-column aligned on the cursor's seek + ordering. At
the current and PR 2b scales (tens to low thousands), the sequential
scan on the `!flagged` filter is fast and unmeasurable.
