# Bulk-import batch 2 — enrichment run report

**Date:** 2026-05-29
**Stack:** local Docker, API rebuilt at develop `7bb4810` (post PR #94).

## Executive summary

500 Perenual catalog candidates → **473 curated collision-free** → **465 inserted** → enriched across GBIF + Trefle + Perenual. The headline result: **0 `Skipped/DuplicateTaxonKey` across the entire run** — the GBIF taxon-key collision class that produced 2 hard failures in batch 1 was fully eliminated up front by the SMA-45 pre-flight + the Phase 3.6/3.7 curation. The SMA-46 runtime catch never had to fire.

| Stage | Count |
|---|---|
| Perenual catalog fetched (Strategy A) | 500 |
| Curated collision-free (pre-flight + curation) | 473 |
| Inserted by bulk-create | 465 (8 skipped = already in DB) |
| GBIF-resolved (taxon key) | 452 |
| Fully enriched (Gbif+Trefle+Perenual) | 395 |

## Pipeline

| Phase | What | Artifact / PR |
|---|---|---|
| 1. Fetch | Paginate Perenual species-list, Strategy A (drop cultivar/variety/hybrid/subspecies non-null, robust null+trim eval), 500 qualified | `Fetch-PerenualCatalog.ps1` — PR #92 (`0f30ec5`) |
| 2. Raw data | `curated-batch2.csv` (500 rows) committed for traceability | PR #93 (`563c3a8`) |
| 3. Pre-flight | GBIF taxon-key overlap detection (ADR-0004 layer b): 51 overlaps flagged (48 intra_batch, 3 db_existing) | `Invoke-BulkImportPreflight.ps1` — SMA-45 |
| 3.6 Curation | Removed 27 collisions; most-canonical binomial per resolved key | — |
| 3.7 Resolution | GBIF accepted-name override for 2 sibling-species merges: **`Bergenia crassifolia`** kept over `cordifolia`, **`Abelia chinensis`** kept over `grandiflora` | — |
| 3.7 Verify | Single-chunk pre-flight (`-ChunkSize 500`, 473 candidates) → **0 overlap**, proving collision-free incl. the cross-chunk blind spot of the original 2×250 run | — |
| 4a. Clean data | `curated-batch2-clean.csv` (473 rows) | PR #94 (`7bb4810`) |
| 4. Bulk-create | `POST /api/admin/bulk-import`, `category → PlantType` 1:1 | PR #80 endpoint |
| 5. Smoke | 5 plants × 3 sources, per-plant endpoints | — |
| 6. Full run | `Enrich-AllSources.ps1 -Limit 50 -ThrottleSeconds 2`, GBIF → Trefle → Perenual | PR 2a-2 driver |
| 7. Cleanup | Retry the 1 Perenual failure (see Real errors) | — |

## Bulk-create

`POST /api/admin/bulk-import`, `category → PlantType` mapped at the call site (no schema change):

| CSV `category` | mapped `PlantType` | rows |
|---|---|---|
| Ornamental | Ornamental | 450 |
| Vegetable | Vegetable | 18 |
| Fruit | Fruit | 3 |
| Herb | Herb | 2 |

| Total | Created | Skipped | Failed |
|---|---|---|---|
| 473 | 465 | 8 | 0 |

8 skipped = 8 rows whose `ScientificName` already existed in the DB (seed/batch-1): `Ficus carica`, `Laurus nobilis`, `Allium cepa`, `Allium schoenoprasum`, `Aloe vera`, `Anethum graveolens`, `Artemisia dracunculus`, `Asparagus officinalis`. These are exact-name matches, which the pre-flight does not flag (it only flags *different* names colliding on a key); bulk-create dedups them on `ScientificName` (case-insensitive, PR #81 functional `LOWER` index). Additive, existing rows untouched. 465 new rows staged with `EnrichmentStatus = Manual` (=1), `GbifTaxonKey = NULL`.

## Driver run summary

`Enrich-AllSources.ps1 -Limit 50 -ThrottleSeconds 2`. Keyset (seek) pagination, GBIF → Trefle → Perenual. Wall time **21.8 min** (Trefle-bound).

| Phase | Processed | Matched | NotMatched | **Skipped** | Failed |
|---|---|---|---|---|---|
| GBIF | 460 | 452 | 8 | **0** | 0 |
| Trefle | 468 | 327 | 141 | **0** | 0 |
| Perenual | 470 | 459 | 10 | **0** | 1 |

Processed counts > 460 on Trefle/Perenual = the driver also mopped up batch-1 plants that lacked those flags (8 missing Trefle, 10 missing Perenual) — correct idempotent behaviour.

## Final counts (all 545 plants in DB: batch-2 + batch-1 + seed)

```sql
SELECT "EnrichmentStatus", COUNT(*) FROM "Plants" GROUP BY "EnrichmentStatus";
```

| EnrichmentStatus | Bits | Count | Meaning |
|---:|---|---:|---|
| 15 | Manual\|Gbif\|Trefle\|Perenual | **395** | fully enriched |
| 11 | Manual\|Gbif\|Perenual | **131** | identity + care data, Trefle NoMatch |
| 9 | Manual\|Perenual | **8** | GBIF NoMatch (trade-names), Perenual only |
| 7 | Manual\|Gbif\|Trefle | **9** | Perenual NoMatch/failed |
| 3 | Manual\|Gbif | **2** | GBIF only |
| 1 | Manual only | **0** | no total failures |

`with GbifTaxonKey = 537 / NULL = 8`. Every plant carries at least one external source (no row stuck at Manual-only).

## Proof-point: 0 DuplicateTaxonKey

This is the result the whole curation pipeline was built to produce. `Skipped = 0` across **all 30 chunks of all 3 phases**, and **zero** `[Skipped/DuplicateTaxonKey]` log lines. The chain that guarantees it:

1. **Pre-flight** (SMA-45) resolved every candidate against GBIF and flagged 51 key collisions before any write.
2. **Curation** (Phase 3.6/3.7) removed all 51, keeping one canonical name per resolved key; a global single-chunk re-check proved 0 residual overlap.
3. **Bulk-create** inserted with `GbifTaxonKey = NULL` (partial unique index `WHERE GbifTaxonKey IS NOT NULL` lets the NULLs coexist).
4. **Enrichment** resolved keys per-plant; because the batch was collision-free, the SMA-46 23505 catch on `IX_Plants_GbifTaxonKey` never triggered.

**Contrast with batch 1**, which used GBIF-accepted names without a pre-flight and hit **2 unhandled `IX_Plants_GbifTaxonKey` 23505 failures** (`Rosmarinus officinalis`/`Salvia rosmarinus`, `Allium ampeloprasum` vs seed). Batch 2 paid the curation cost up front and shipped clean.

## Data-limited outcomes (not bugs)

| Bucket | Count | Why |
|---|---|---|
| Trefle NoMatch (status 11) | 131 | Ornamental trees/shrubs — Trefle's catalogue is thin for this segment. These plants have GBIF identity + Perenual care data; they lack only Trefle images/common-names/synonyms. |
| GBIF NoMatch (status 9) | 8 | Cultivar **trade-names** GBIF has no backbone taxon for: `Agastache KUDOS RED`, `Agastache SUMMER GLOW`, `Alocasia LOW RIDER`, `Amaranthus tricolor (vegetable group)`, `Azara serrata ANDEAN GOLD`, `Begonia FUNKY PINK`, `Bergenia DRAGONFLY ANGEL KISS`, `Bergenia DRAGONFLY SAKURA`. The trade name sits in `ScientificName` (not Perenual's cultivar field), so Strategy A did not filter them. They still received Perenual data. → SMA-53. |

## Real errors (1)

### Perenual — `23514` `CK_Plants_Height_Range` violation (×1)

| Plant Id | ScientificName | GBIF key |
|---|---|---|
| `50011b3e-fd76-4d2a-8b1e-470bac5a4f4d` | Anemone nemorosa | 3033263 |

The driver counted this as "failed (transient)", but a targeted retry confirmed it is **deterministic**: Perenual's payload for this plant carries height values that violate `CK_Plants_Height_Range` (`MinHeightCm <= MaxHeightCm`, both ≥ 0) on the final `SaveChangesAsync`. The transaction rolls back cleanly (heights stay NULL, no corruption), so the plant remains GBIF-identified (status 3). Distinct from batch 1's Perenual failure, which was a `22001` varchar overflow (fixed by the SunlightPreferences/PruningMonths → text widenings). Needs a min/max clamp or swap guard at the Perenual resolver before persisting height — schema/resolver fix, separate ticket.

## Spot-checks

| Plant | Sources | Status | Note |
|---|---|---|---|
| Achillea millefolium | GBIF + Trefle + Perenual | 15 | xData (`XWateringQualityJson`) populated |
| Acer palmatum | GBIF + Perenual | 11 | Trefle NoMatch (ornamental gap); xData populated |
| Bergenia crassifolia | GBIF + Trefle + Perenual | 15 | key 5567694 — the Phase 3.7 swap winner, resolves EXACT and enriches clean |
| Abelia chinensis | GBIF + Trefle + Perenual | 15 | key 5599251 — Phase 3.7 sibling, resolves EXACT |

The two Phase 3.7 GBIF accepted-name overrides both enrich cleanly, closing the curation decision loop.

## Remaining work

- **8 trade-name cultivars** (status 9) — no GBIF identity; product decision whether to keep (Perenual data only), prune, or refine Strategy A to detect CAPS trade-names in `ScientificName`. Tracked under **SMA-53**.
- **`Anemone nemorosa`** — `CK_Plants_Height_Range` violation on Perenual height payload; needs a resolver-side clamp/guard. **No ticket yet** — recommend opening one.
- **131 Trefle NoMatch + 9 Perenual NoMatch** — data-limited, no action; would be re-attempted automatically on any future enrich run if upstream coverage improves.

## Notes

- Auth: throwaway local users (`sma13-*+<ts>@localhost.dev`) registered via `POST /api/auth/register`; the JWT cookie was lifted into `$env:SMARTCROPS_TOKEN` per run. Credentials live only in-session, never committed.
- Docker volume preserved throughout (`up --build -d` to refresh the API image to `7bb4810`; no `down -v`).
- Perenual quota: not surfaced in responses; estimated ~940 calls (~1% of the 100k/day Supreme budget), no rate-limit errors. GBIF free. Trefle 468 calls with no 429 — chunk pacing respected the 120 req/min budget.
- One false start: the first background launch failed because the Bash shell mangled the Windows backslash script path; pwsh never ran and the DB was untouched. Relaunched via PowerShell (native path) for the clean run recorded here.
