# Classification rules

This document specifies how the `coderabbit-harvest` skill classifies each CodeRabbit review comment into one of four buckets: **LGTM**, **NITPICK**, **MAJOR**, or **REVIEW_NEEDED**.

The implementation lives in `scripts/Classify-Comments.ps1` (function `Get-CommentClassification`). This document is the **specification** that script must match. If the two ever drift, this document is the source of truth — fix the script, not the doc.

## Why four buckets

The four buckets correspond to four distinct workflow actions:

| Bucket | What it means | Action |
|---|---|---|
| **LGTM** | CodeRabbit approves; no change requested | Counted, never detailed in markdown summary (token-saving) |
| **NITPICK** | Low-severity actionable: style, naming, micro-refactor | Detailed in markdown; user decides ACCEPT/DEFER on each |
| **MAJOR** | High-severity actionable: real bug, security, design flaw | Detailed in markdown; user almost always ACCEPTs |
| **REVIEW_NEEDED** | Doesn't fit any deterministic rule | Detailed in markdown; Claude Code classifies in conversational context |

The fourth bucket exists to keep the deterministic rules conservative. Anything ambiguous flows to **REVIEW_NEEDED** rather than getting silently miscategorized.

## The classification rules (applied in order — first match wins)

### Rule 1 — Self-invalidated by CodeRabbit → **LGTM**

If the comment has an `analysis.type` in `{incorrect_review_comment, off_topic, invalid}`, CodeRabbit has retracted its own comment. Counted as no-op.

Example: PR #41 commit `bdd970e` had a comment with body about ReDoS safety but `analysis.type = incorrect_review_comment`.

### Rule 2a — Body is an exact LGTM marker → **LGTM**

The body, after trimming whitespace, exactly matches one of (case-insensitive): `LGTM!`, `LGTM`, `Looks good!`, `Looks good to me!`, `No issues found.`, `Approved.`

These strings are unambiguous LGTM by construction, so this check runs at the **top** of the rule chain — there is no risk of it masking an actionable finding.

Compliment *prefixes* (`Excellent`/`Great`/etc.) are handled separately by **Rule 10a**, deliberately placed *after* the type-driven rules — see below.

### Rule 3 — `type='actionable'` AND `severity='major'` (or `critical`) → **MAJOR**

CodeRabbit's prominent concerns. Almost always worth addressing in the same PR.

### Rule 4 — `type='actionable'` AND `severity` in `{minor, nitpick, low, trivial}` → **NITPICK**

Bread-and-butter style suggestions, naming improvements, small refactors. (`trivial` is CodeRabbit's lowest actionable severity — e.g. the assertive-profile "translate this comment to English" note on PR #96; observed and added under SMA-54.)

### Rule 5 — `type='actionable'` AND `severity` unknown → **REVIEW_NEEDED**

Actionable without a clear severity label. Flag for Claude's judgment.

### Rule 6 — `type='assertive'` AND `severity='major'` (or `critical`) → **MAJOR**

Assertive comments with major severity signal real concerns.

### Rule 7 — `type='assertive'` AND `severity` in `{'', none, low, minor, nitpick, trivial}` → **NITPICK**

The most common case for assertive: lightweight architectural commentary worth reading but rarely action-required.

### Rule 8 — `type='additional'` → severity-based (asymmetric with Rule 7)

`additional` is CodeRabbit's bucket for non-actionable supplementary remarks — compliments, `LGTM!` bodies, and short observations. Empirically every `additional` comment observed across PRs #41 and #45 was a no-op.

- `severity` in `{major, critical}` → **MAJOR**
- `severity` in `{'', none, low, minor}` → **LGTM** (the common case — no-op)
- otherwise (including `nitpick`) → **REVIEW_NEEDED**

**Note: this is intentionally asymmetric with Rule 7.** Rule 7 (`assertive`) routes `severity='nitpick'` to NITPICK because an "assertive" finding marked nitpick is a coherent lightweight architectural note. Rule 8 (`additional`) routes `severity='nitpick'` to REVIEW_NEEDED instead, because an "additional/compliment" comment marked nitpick is an internally-conflicting payload (CodeRabbit saying both "this is supplementary" and "this is a nitpick") that warrants a human glance. If empirical evidence shows `additional + nitpick` is a recurring no-op pattern in practice, this rule can be widened.

The LGTM mapping for benign severity is what makes long, markdown-bolded compliment bodies (e.g. `**Excellent architectural traceability.**…`, which is >200 chars so Rule 10a's prefix branch can't catch it) classify correctly as no-ops rather than falling through to the catch-all.

### Rule 9 — `type='outsideDiffRange'` → **REVIEW_NEEDED**

Comments about code outside the current diff. Context is unclear without reading the surrounding file.

### Rule 10 — `type='duplicate'` → **LGTM**

CodeRabbit's deduplication marker. No-op.

### Rule 10a — Compliment-prefix body → **LGTM** (only if no type rule matched)

A short body (≤ 200 chars after trimming) opening with a complimentary word — `Excellent`, `Great`, `Nice`, `Well done` — is treated as a no-op compliment.

This check is **intentionally placed after the type-driven rules** (3–10), not with Rule 2a at the top. The prefix heuristic is weaker than the exact-match list: a genuine `actionable` / `severity=major` finding could open with "Excellent point, but…". Running the prefix check first would silently downgrade such a finding to LGTM. Consulting it only as a near-catch-all means any comment carrying real type/severity metadata is classified by that metadata first; the prefix heuristic is just the fallback before the final `REVIEW_NEEDED`.

The 200-character cap further guards against "Great catch but here's a real issue…" bodies.

### Rule 11 — Catch-all → **REVIEW_NEEDED**

Anything that didn't match the above rules.

## Cross-source handling (no deduplication — by design)

CodeRabbit often surfaces the same finding on **both** the Extension JSON and the GitHub API. The skill **does not** attempt to deduplicate them. It classifies each source independently and reports both transparently, leaving overlap resolution to the human (or downstream Claude) reading the report. This is a deliberate design decision, not an omission.

### Why no deterministic dedup

The same logical finding is rendered very differently across the two sources, and no reliable deterministic key exists:

- **Bodies share no leading text.** CodeRabbit's GitHub rendering enriches the body with severity badges (`⚠️ Potential issue | 🟡 Minor | ⚡ Quick win`) and an embedded AI-agent prompt `<details>` block; the Extension body is terse. Empirically (PR #45's MD040 comment), the Extension and GitHub bodies of the *same* finding diverge at character 0 — body-prefix matching was attempted and proven unworkable.
- **Titles differ.** e.g. Extension *"Specify language identifier for the fenced code block."* vs GitHub *"Add a language tag to the fenced regex block."* for one finding.
- **Line anchors are unreliable.** GitHub nulls an inline comment's `line` once the underlying code is modified (the comment goes "outdated" in GitHub's UI), so it normalizes to `startLine = 0` — common when harvesting a commit that is no longer its PR's HEAD.
- **IDs are in different namespaces.** Extension UUIDs vs GitHub numeric comment IDs — never shared.

`path` is the only reliably shared field, and `path` alone is too coarse (a file can carry multiple findings). Rather than overfit a brittle heuristic, the skill keeps both sources. **The same logical finding may therefore appear twice in a harvest** (once per source). The markdown summary's "Cross-source surfaces" section reports per-source counts so the reader can see the overlap is not deterministically resolvable.

GitHub-source comments lack CodeRabbit's internal `type`/`severity`, so a non-LGTM GitHub comment classifies as `REVIEW_NEEDED` (see the GitHub source-specific note above) — flagged for human/Claude judgment rather than silently bucketed.

## Source-specific notes

### Extension JSON

Rich metadata (`type`, `severity`, `analysis.type`). Rules 1-10 apply directly.

### GitHub API — three distinct surfaces (SMA-54 M5)

GitHub exposes CodeRabbit on three surfaces that the harvester reads separately and tags with a granular `source`. None expose CR's internal `type`/`severity`. The `github-inline` and `github-review` surfaces use the simplified body heuristic below; `github-walkthrough` is the exception — it is informational (summary/poem) and **always forced to LGTM** (see the table), never run through the heuristic.

Body heuristic (inline and review surfaces only):

- Body matches an exact-LGTM marker or compliment prefix → **LGTM**
- Otherwise → **REVIEW_NEEDED**

| `source` | Endpoint | What it carries |
|---|---|---|
| `github-inline` | `pulls/<n>/comments` | Line-anchored review comments. |
| `github-review` | `pulls/<n>/reviews[].body` | The review body that **groups nitpicks** and carries the `Actionable comments posted: N` marker. This is the surface the pre-SMA-54 skill never read — PR #95's only nitpick lived here and was silently missed. A grouped-nitpick body has no LGTM marker, so it classifies **REVIEW_NEEDED** and surfaces in the report for a human read. |
| `github-walkthrough` | `issues/<n>/comments` | The summary/poem and "Review skipped"/"path filters" notice. Forced to **LGTM** (it is never a finding itself); its marker and skip flag are extracted into the top-level `actionableMarker` / `reviewSkipped` fields instead. |

**The `Actionable comments posted: N` marker** is parsed from the review body and walkthrough into `actionableMarker`. **Its absence is not zero** — a nitpicks-only review omits the marker while still grouping real nitpicks, so the body is always read regardless of the marker.

### Extension JSON — intra-source dedup (SMA-54 N1)

A single Extension review entry can list the SAME finding twice: once under `additionalDetails.*Comments` and once under `fileReviewMap[<file>].comments`. The harvester collects from both, then **collapses duplicates within the Extension source** by fingerprint (CR `id`, else `path|startLine|endLine|body-prefix`). This intra-source dedup is distinct from — and does not violate — the cross-surface no-dedup rule below: Extension-vs-GitHub overlap is still kept (a finding legitimately appearing on two different surfaces is two entries); only the within-Extension double count is removed.

## Comparison mode (`--compare-with`)

When invoked with a previous harvest's JSON, each comment gets a **transition label**:

| Transition | Meaning |
|---|---|
| **NEW** | Comment exists in current harvest, absent from previous |
| **PERSISTED** | Comment exists in both, body unchanged |
| **MODIFIED** | Same comment present in both harvests (matched by id, or by same source + path + line range when ids differ), but body has changed |
| **RESOLVED** | Comment exists in previous, absent from current |

Matching priority:
1. By `id` (stable across CodeRabbit re-reviews).
2. Fallback: **same `source`** + `path` + `startLine` + `endLine`, with an exact-body match preferred (→ PERSISTED) over a location-only match (→ MODIFIED).

The fallback is **source-scoped**: a current Extension comment is only ever matched against previous *Extension* comments (and likewise for GitHub). Cross-source matches are intentionally never made — the same finding renders very differently on the two surfaces (see "Cross-source handling" above), so matching across them would produce spurious MODIFIED transitions. RESOLVED detection uses the same source-scoped location key (`source:path:startLine:endLine:body`).

MODIFIED comments are always detailed in the markdown summary regardless of their classification bucket — body changes signal CodeRabbit's analysis evolved.

## Known limitations

1. **Body-based LGTM detection is heuristic.** A short, type-less body like "Great catch, but here's a real issue…" could be misclassified LGTM by Rule 10a's prefix heuristic. Mitigated by placing Rule 10a *after* the type-driven rules (so anything with real type/severity is classified by metadata first) and by the 200-char cap; residual risk is limited to short, type-less bodies. Not observed in PRs #37/#41/#45.
2. **GitHub-side comments are under-classified.** Lack of internal type/severity means non-LGTM GitHub comments flow to REVIEW_NEEDED. Acceptable: Extension is the more comprehensive source.
3. **Self-invalidated comments count toward total.** They're LGTM (no-op) for action purposes but appear in counts.
4. **No multi-language detection.** All rules assume English CodeRabbit output.

## When to update these rules

Update this document (and the script) when:

- A new CodeRabbit type or analysis verdict appears
- Empirical observation shows consistent misclassification
- The skill's output structure changes

Each update is a single `refactor(tooling): adjust classification rule for X` commit.
