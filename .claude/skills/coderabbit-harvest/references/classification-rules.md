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

## The 11 rules (applied in order — first match wins)

### Rule 1 — Self-invalidated by CodeRabbit → **LGTM**

If the comment has an `analysis.type` in `{incorrect_review_comment, off_topic, invalid}`, CodeRabbit has retracted its own comment. Counted as no-op.

Example: PR #41 commit `bdd970e` had a comment with body about ReDoS safety but `analysis.type = incorrect_review_comment`.

### Rule 2 — Body is a pure compliment → **LGTM**

The body, after trimming whitespace, matches one of:

- Exact (case-insensitive): `LGTM!`, `LGTM`, `Looks good!`, `Looks good to me!`, `No issues found.`, `Approved.`
- Starts with (and total length ≤ 200 chars): `Excellent`, `Great`, `Nice`, `Well done`

The 200-character cap prevents misclassification of "Great catch but here's a real issue..." comments. The list is intentionally conservative; false negatives flow to REVIEW_NEEDED, which is safe.

### Rule 3 — `type='actionable'` AND `severity='major'` (or `critical`) → **MAJOR**

CodeRabbit's prominent concerns. Almost always worth addressing in the same PR.

### Rule 4 — `type='actionable'` AND `severity` in `{minor, nitpick, low}` → **NITPICK**

Bread-and-butter style suggestions, naming improvements, small refactors.

### Rule 5 — `type='actionable'` AND `severity` unknown → **REVIEW_NEEDED**

Actionable without a clear severity label. Flag for Claude's judgment.

### Rule 6 — `type='assertive'` AND `severity='major'` (or `critical`) → **MAJOR**

Assertive comments with major severity signal real concerns.

### Rule 7 — `type='assertive'` AND `severity` in `{'', none, low, minor}` → **NITPICK**

The most common case for assertive: lightweight architectural commentary worth reading but rarely action-required.

### Rule 8 — `type='additional'` → severity-based

`additional` is CodeRabbit's bucket for non-actionable supplementary remarks — compliments, `LGTM!` bodies, and short observations. Empirically every `additional` comment observed across PRs #41 and #45 was a no-op. Classified symmetrically to `assertive`:

- `severity` in `{major, critical}` → **MAJOR**
- `severity` in `{'', none, low, minor}` → **LGTM** (the common case — no-op)
- otherwise → **REVIEW_NEEDED**

The LGTM mapping for benign severity is what makes long, markdown-bolded compliment bodies (e.g. `**Excellent architectural traceability.**…`, which is >200 chars so Rule 2's prefix branch can't catch it) classify correctly as no-ops rather than falling through to the catch-all.

### Rule 9 — `type='outsideDiffRange'` → **REVIEW_NEEDED**

Comments about code outside the current diff. Context is unclear without reading the surrounding file.

### Rule 10 — `type='duplicate'` → **LGTM**

CodeRabbit's deduplication marker. No-op.

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

### GitHub API

Does not expose CodeRabbit's internal `type`/`severity`. Simplified classification:

- Body matches LGTM rule → **LGTM**
- Otherwise → **REVIEW_NEEDED**

## Comparison mode (`--compare-with`)

When invoked with a previous harvest's JSON, each comment gets a **transition label**:

| Transition | Meaning |
|---|---|
| **NEW** | Comment exists in current harvest, absent from previous |
| **PERSISTED** | Comment exists in both, body unchanged |
| **MODIFIED** | Comment id exists in both, but body differs |
| **RESOLVED** | Comment exists in previous, absent from current |

Matching priority:
1. By `id` (stable across CodeRabbit re-reviews)
2. Fallback: `path + startLine + endLine`

MODIFIED comments are always detailed in the markdown summary regardless of their classification bucket — body changes signal CodeRabbit's analysis evolved.

## Known limitations

1. **Body-based LGTM detection is heuristic.** "LGTM, but please consider X" would be misclassified by Rule 2. Not observed in PRs #37/#41/#45.
2. **GitHub-side comments are under-classified.** Lack of internal type/severity means non-LGTM GitHub comments flow to REVIEW_NEEDED. Acceptable: Extension is the more comprehensive source.
3. **Self-invalidated comments count toward total.** They're LGTM (no-op) for action purposes but appear in counts.
4. **No multi-language detection.** All rules assume English CodeRabbit output.

## When to update these rules

Update this document (and the script) when:

- A new CodeRabbit type or analysis verdict appears
- Empirical observation shows consistent misclassification
- The skill's output structure changes

Each update is a single `refactor(tooling): adjust classification rule for X` commit.
