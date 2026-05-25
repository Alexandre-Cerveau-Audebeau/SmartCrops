# Bulk import -- driver script

`Enrich-AllSources.ps1` walks every `Plant` row through the three
`/enrich-all` endpoints with keyset (seek) pagination and loops each phase
until the cursor reaches the tail of the `!XxxEnriched` set.

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

`CREATE INDEX CONCURRENTLY` on `EnrichmentStatus` only becomes relevant at
100k+ rows. At the current and PR 2b scales (tens to low thousands), the
sequential scan on the `!flagged` filter is fast and unmeasurable.
