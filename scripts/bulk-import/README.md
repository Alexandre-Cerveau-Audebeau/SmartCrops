# Bulk import — driver script

`Enrich-AllSources.ps1` walks every `Plant` row through the three
`/enrich-all` endpoints in chunks and loops each phase until done.

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

## Resumability

There is no state file. The SQL filter `(EnrichmentStatus & XxxEnriched) == 0`
is the state. Crash the script halfway through, fix the issue, re-run with
the same `-Limit` — every plant already flagged is excluded by the next
chunk's `Where` clause.

## Stalled guard

A phase stops when `NotEnrichedRemaining` does NOT decrease between two
consecutive chunks. That means the chunk processed only unmatchable plants
(no upstream match found), so retrying would loop forever. The script
prints the stalled count and moves to the next phase.

If you want to retry the stalled plants later, use the per-plant endpoint
or pass `?force=true` to that phase's `enrich-all` once you've cleaned up
the inputs.

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
| `Limit`           | `50`                     | Chunk size. Trefle (120 req/min) is the tightest quota; 50 is safe.      |
| `ThrottleSeconds` | `2`                      | Sleep between successful chunks. Driver-side, not server-side.           |
| `Cookie`          | `$env:SMARTCROPS_TOKEN`  | Auth bearer. Required.                                                   |

## Scale note (runbook AI-5)

`CREATE INDEX CONCURRENTLY` on `EnrichmentStatus` only becomes relevant at
100k+ rows. At the current and PR 2b scales (tens to low thousands), the
sequential scan on the `!flagged` filter is fast and unmeasurable.
