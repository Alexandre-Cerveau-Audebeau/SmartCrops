# Bulk-import batch 1 — run report

Live run of the PR 2b curated list (75 species) against the local Docker stack rebuilt at HEAD `f960eaa` (`feat/bulk-import-batch1`), exercising the bulk-create endpoint (#80) and the seek-cursor enrich-all driver (#82) end-to-end.

## Bulk-create

Endpoint: `POST /api/admin/bulk-import` with the `category → PlantType` mapping applied at the call site (no schema change):

| CSV `category` | mapped `PlantType` | rows |
|---|---|---|
| `vegetable` | Vegetable | 20 |
| `fruit` | Fruit | 10 |
| `herb` | Herb | 15 |
| `flower` / `shrub` / `indoor` | Ornamental | 30 |

| Total | Created | Skipped | Failed |
|---|---|---|---|
| 75 | 40 | 35 | 0 |

35 skipped = 35 rows already present in the DB (seed + prior smoke). 40 new rows staged with `EnrichmentStatus = Manual` (=1).

## Driver run summary

`.\scripts\bulk-import\Enrich-AllSources.ps1 -Limit 25 -ThrottleSeconds 2`. Cursor pagination, GBIF → Trefle → Perenual.

### Run 1

| Phase | Total | Matched | NotMatched | Failed | Remaining (post-phase) |
|---|---|---|---|---|---|
| GBIF | 41 | 39 | 0 | 2 | 2 |
| Trefle | 44 | 35 | 9 | 0 | 9 |
| Perenual | 48 | 35 | 12 | 1 | 13 |

### Run 2 (mop-up)

| Phase | Total | Matched | NotMatched | Failed | Remaining |
|---|---|---|---|---|---|
| GBIF | 2 | 0 | 0 | 2 | 2 |
| Trefle | 9 | 0 | 9 | 0 | 9 |
| Perenual | 13 | 0 | 12 | 1 | 13 |

### Run 3 (mop-up confirmation)

| Phase | Total | Matched | NotMatched | Failed | Remaining |
|---|---|---|---|---|---|
| GBIF | 2 | 0 | 0 | 2 | 2 |
| Trefle | 9 | 0 | 9 | 0 | 9 |
| Perenual | 13 | 0 | 12 | 1 | 13 |

Failed stable on **3 consecutive runs** (GBIF 2/2/2, Trefle 0/0/0, Perenual 1/1/1) → persistent failures, conforming to the README bounded-retry threshold (PR #82 r5 runbook, "3+ consecutive runs"). The 3 individually-identified plants in [Persistent failures](#persistent-failures-3-root-cause-analysed) are the same set across runs 1-3; no failure moved between transient and persistent classification on the third pass.

## Final counts (all 82 plants in DB, curated batch + pre-existing seed)

```sql
SELECT
  COUNT(*) AS total,                                                 -- 82
  COUNT(*) FILTER (WHERE "EnrichmentStatus" & 2 = 2) AS gbif,        -- 80
  COUNT(*) FILTER (WHERE "EnrichmentStatus" & 4 = 4) AS trefle,      -- 73
  COUNT(*) FILTER (WHERE "EnrichmentStatus" & 8 = 8) AS perenual,    -- 69
  COUNT(*) FILTER (WHERE "Genus" IS NOT NULL) AS genus_populated     -- 80
FROM "Plants";
```

`Genus` populated on every plant that GBIF flagged (80/80) — the GBIF-first ordering is doing its job, and the 2 GBIF-failed plants are the only rows without a curated genus.

## Spot-checks (3 plants chosen to exercise distinct GBIF resolution paths)

| Plant | Genus / Family | Flags | Trefle common names (languages) | Images | Perenual id (HasSupreme) |
|---|---|---|---|---|---|
| **Salvia rosmarinus** (validated GBIF-accepted) | Salvia / Lamiaceae | GBIF+Trefle+Perenual ✓ (15) | 0 (Trefle row written but payload had no common names) | 1 | yes (HasSupreme=true) |
| **Allium ampeloprasum** (HIGHERRANK fix) | (none — GBIF failed) | Trefle+Perenual (13, no GBIF) | 66 across 19 langs (ar, ca, cy, cym, da, de, en, es, fr, he, hu, it, nb, nl, nn, nno, nob, pt, sv) | 31 | 665 (HasSupreme=true) — leek matched **as species**, vs the pre-fix `Allium porrum` which GBIF only resolved at GENUS rank |
| **Sansevieria trifasciata** (SYNONYM kept as traditional) | **Dracaena** / Asparagaceae | GBIF+Perenual (11, no Trefle) | 0 (Trefle NotMatched) | 2 | 7171 (HasSupreme=true) |

`Sansevieria trifasciata` was identified during planning as a synonym-resolution case to verify, and resolved through GBIF's `acceptedUsageKey` to `Genus=Dracaena` as expected:
- GBIF resolved via `acceptedUsageKey` → the canonical `Dracaena` was persisted as `Plant.Genus` (the synonym `Sansevieria` survives only in `ScientificName` because it's our human-facing label).
- Perenual found it (id 7171, Supreme payload) — the path under either name reaches the upstream record.
- Trefle did not match.

## Persistent failures (3, root-cause analysed)

### GBIF — `IX_Plants_GbifTaxonKey` 23505 duplicate (×2)

| Plant Id | ScientificName | Likely accepted twin in DB |
|---|---|---|
| `186d31ce-5d23-49ca-9f4a-d0a45171c03a` | Rosmarinus officinalis (pre-existing seed row) | Salvia rosmarinus (curated batch row) — both resolve to the same accepted GBIF taxon |
| `553d1b38-bc44-4954-a1e8-1332926dbf82` | Allium ampeloprasum (curated batch row, the leek fix) | Pre-existing seed row collides on the same GBIF taxon key |

Pre-existing data condition — the curated list deliberately uses GBIF-accepted names while the legacy seed rows still carry traditional names that GBIF resolves to the same taxon. Not a bug in the cursor or driver; would be cleared by either (a) consolidating duplicate rows at the application layer, or (b) demoting `IX_Plants_GbifTaxonKey` to a non-unique index if multiple ScientificName aliases per taxon is the intended model.

### Perenual — `22001` `varchar(200)` overflow (×1)

| Plant Id | ScientificName | Perenual id |
|---|---|---|
| `242b138e-2561-4ad3-995e-fdb1cc868c2a` | Spinacia oleracea (spinach) | 7468 |

Upstream Perenual payload contained a string longer than the schema-side `varchar(200)` cap. The genus gate and canonical mismatch logic passed; the failure is on the final `SaveChangesAsync`. Needs either a column widening (likely `PlantPerenualData` for a description / URL / origin field) or a per-field truncation guard at the resolver. Schema fix, separate PR.

## Real errors vs expected skips

| Category | Count | Verdict |
|---|---|---|
| GBIF `Failed to enrich plant` (23505) | 2 | Real schema-condition issue → see "Persistent failures" |
| Perenual `Failed to enrich plant` (22001) | 1 | Real schema condition (varchar limit) → see "Persistent failures" |
| Trefle NotMatched | 9 | Expected — data variance (Trefle catalog gaps for `Allium porrum`, `Cynara scolymus`, `Ficus carica`, `Iris germanica`, `Lavandula`, `Mentha piperita`, `Raphanus sativus`, `Sansevieria trifasciata`, `Tagetes patula`) |
| Perenual NotMatched | 12 | Expected — data variance |
| Other ERROR/Exception lines | 0 | No off-by-one (≥8574), no genus-gate misfires, no timeouts |

## Durability export

`scripts/bulk-import/exports/batch1_20260526_125128.sql` (≈4.2 MB, `pg_dump --data-only` over `Plants`, `PlantSources`, `PlantCommonNames`, `PlantImages`, `PlantPerenualData`, `PlantTrefleData`, `PlantLongDescriptions`, `PlantSynonyms`, `PlantPests`). Local-only, gitignored under `scripts/bulk-import/exports/`. This is the insurance capture against an accidental `docker compose down -v` before the next infrastructure decision.

## Notes

- Auth: a throwaway local user (`bulkimport-test+<ts>@localhost.dev`) was registered via `POST /api/auth/register`; the JWT cookie value was lifted into `$env:SMARTCROPS_TOKEN` for the run. Credentials live only in this session — no persistence.
- Docker volume preserved throughout (no `down -v`; only `up --build -d` to refresh the API image to HEAD).
- 3 runs total (initial + 2 mop-up retries). Failed counts were identical across runs 1, 2, and 3, satisfying the runbook's "3+ consecutive runs" persistence threshold. No further retries.
- The follow-up shared-runner refactor flagged in PR #82 r6 is still tracked in #83 — independent of this PR.
