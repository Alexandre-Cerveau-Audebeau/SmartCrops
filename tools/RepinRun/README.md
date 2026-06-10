# RepinRun — SMA-135 identity re-pin (one-shot operator tool)

**Status: archived.** Executed once against the live database on 2026-06-10 for SMA-135. Kept for traceability. **Not part of the application** and deliberately excluded from `SmartCrops.sln` — it must not touch the build or CI.

## What it did

Remediated 26 plants whose taxonomic identity was wrong (horticultural cultivars/groups mis-resolved to the wrong GBIF taxon, or duplicates of an already-clean species), via the admin `POST /api/admin/plants/{id}/repin` endpoint:

- **7 species re-pins** — strip the cultivar/group suffix back to the clean binomial, then re-enrich GBIF → Trefle → Perenual (`force=true`).
- **10 genus re-pins** — demote to genus rank (one card per genus), archive the genus GBIF key, flag `IdentityNeedsReview=true` for later genus-level sourcing.
- **9 deletes** — 4 duplicates of an existing clean species + 5 surplus cultivars merged into their genus card.

Net: 545 → 536 plants.

## Safety model

- **Dry-run by default** (`dotnet run --project tools/RepinRun`) — resolves every plant read-only and prints the planned actions; **mutates nothing**. `--apply` performs the run.
- **Collision guards** in the dry-run: duplicate-target detection (two mapping entries aiming at the same name) + out-of-run collision (a target name already held by a plant outside the run).
- **Strict vs tolerant**: `/repin` and `DELETE` abort the run on any non-2xx; the three enrich calls are tolerant (warn + per-source summary) so a missing upstream species never blocks the run.
- **Read-only resolution** via `docker exec … psql` (no ORM, no writes on the read path).
- A **`pg_dump` custom backup** was taken immediately before `--apply`.

## Auth

Mints a short-lived HS256 admin JWT signed with the local-dev key (committed in `docker-compose.yml`, explicitly labelled *Change-In-Production*). The role claim uses the full `ClaimTypes.Role` URI so it authorizes regardless of inbound-claim mapping; no `security_stamp` claim is included, so the API skips the DB user lookup. **Local-dev only.** Override via `REPIN_JWT_KEY` / `REPIN_JWT_ISSUER` / `REPIN_JWT_AUDIENCE` if the stack is reconfigured.

## Run result (2026-06-10)

GBIF 7/7 matched · Trefle 6/7 (Astilbe ×rosea no-match — hybrid) · Perenual 4/7 (Agave geminiflora, Begonia boliviensis, Astilbe ×rosea absent upstream). All no-matches legitimate; identities clean, count 536, health 200.

See SMA-135 for the full mapping, the pre-flight audit, and the run log.
