# Output format

The `coderabbit-harvest` skill produces two outputs: a persistent JSON file and a markdown summary printed to stdout.

## JSON file (`/tmp/harvest-<sha-prefix>.json`)

The JSON schema captures **all** raw data, including LGTM bodies that are omitted from the markdown summary. This enables re-querying without re-running the harvest.

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | integer | Output schema version (currently `1`). Consumers should default to `1` when absent for backward compatibility with pre-versioned harvests. |
| `targetCommit` | string | Full SHA of the commit harvested |
| `prNumber` | integer | GitHub PR number associated with the branch |
| `extensionFound` | boolean | `true` if a `completed` Extension review entry was located for this commit. `false` ⇒ unreviewed or legitimately skipped; the harvest ran on the GitHub surfaces alone (SMA-54 M2). |
| `reviewSkipped` | boolean | `true` if a GitHub surface carries a "Review skipped" / "path filters" notice (CodeRabbit declined to review, e.g. a data-only PR). |
| `actionableMarker` | integer \| null | The parsed `Actionable comments posted: N` value from the review body / walkthrough. **`null` when the marker is absent — absence is NOT zero** (a nitpicks-only review omits the marker yet still groups real nitpicks in its body, SMA-54 M5). |
| `githubPartialData` | boolean | `true` if any **non-critical** GitHub surface (review body or walkthrough) failed to fetch/parse. Distinguishes a degraded harvest from a clean "no comments" result — without it, a transient fetch failure would look identical to "this surface had nothing" (CR PR #97). |
| `githubSurfaceFetchStatus` | object | Per-surface fetch outcome: `{ "github-inline": "ok\|failed", "github-review": "...", "github-walkthrough": "..." }`. The inline surface is critical (a failure there hard-exits 3 before this is emitted), so it is `ok` whenever output is produced. |
| `extensionMeta` | object | Metadata from the Extension review object (empty strings when `extensionFound` is `false`) |
| `comments` | array | Classified comment array (see schema below) |
| `resolved` | array | Comments present in previous harvest but absent here (comparison mode only) |
| `counts` | object | Tally per classification bucket |
| `comparisonMode` | boolean | `true` if `--PreviousJsonPath` was set |

### `extensionMeta` schema

```json
{
  "startedAt": "ISO 8601 timestamp",
  "endedAt": "ISO 8601 timestamp",
  "status": "completed | in_progress | failed",
  "title": "Title of the review",
  "poem": "Optional CodeRabbit poem"
}
```

### `comments[]` schema

```json
{
  "id": "string | null (CodeRabbit comment UUID)",
  "source": "extension | github-inline | github-review | github-walkthrough",
  "type": "actionable | assertive | additional | outsideDiffRange | duplicate | ''",
  "severity": "major | critical | minor | nitpick | low | '' (lowercase)",
  "path": "string (file path relative to repo root)",
  "startLine": "integer",
  "endLine": "integer",
  "title": "string",
  "body": "string (full comment markdown)",
  "analysisType": "incorrect_review_comment | off_topic | invalid | ''",
  "codegenInstructions": "string",
  "classification": "LGTM | NITPICK | MAJOR | REVIEW_NEEDED",
  "transition": "NEW | PERSISTED | MODIFIED (only present in comparison mode)"
}
```

### `resolved[]` schema

Same as `comments[]`, with `transition` always set to `RESOLVED`.

### `counts` schema

```json
{
  "LGTM": "integer",
  "NITPICK": "integer",
  "MAJOR": "integer",
  "REVIEW_NEEDED": "integer",
  "total": "integer",
  "resolved": "integer (0 if not comparison mode)"
}
```

## Markdown summary (stdout)

The markdown summary is the human-readable rendering. Structure:

1. **Header** — `# Harvest report — PR #N commit SHA`
2. **Sanity** — commit, PR, review title/status, time window, comparison mode flag
3. **Counts** — per-bucket counts and total
4. **Cross-source surfaces** — per-surface counts (Extension, GitHub inline, GitHub review body, GitHub walkthrough); the skill does not deduplicate across surfaces (see `classification-rules.md`)
5. **Substantive comments** — table of NITPICK/MAJOR/REVIEW_NEEDED comments (+ MODIFIED in comparison mode)
6. **Details** — per-comment expanded view: title, body, codegen instructions, transition
7. **Resolved comments** — only in comparison mode, lists items absent vs previous harvest
8. **Poem** — CodeRabbit's signature
9. **Footer** — pointer to the JSON file path

**Token efficiency**: LGTM comments are omitted from the markdown summary entirely. The details section repeats body content of substantive comments — this is the largest contributor to output size and scales with the number of comments worth reading.

## Re-querying the JSON file

To re-read a previous harvest without re-running the skill:

```powershell
$h = Get-Content /tmp/harvest-<sha-prefix>.json -Raw | ConvertFrom-Json -Depth 100

# Counts
$h.counts

# Just the substantive comments
$h.comments | Where-Object classification -in 'NITPICK', 'MAJOR', 'REVIEW_NEEDED'

# A specific comment's full body
$h.comments | Where-Object { $_.path -eq 'docs/adr/0002-...md' -and $_.startLine -eq 12 } | Select-Object -ExpandProperty body
```

## Schema versioning

Output emits an explicit `schemaVersion: 1` at the top level. Future changes will be additive when possible; breaking changes will bump to `2` (etc.). Consumers should branch on `schemaVersion ?? 1` for backward compatibility with pre-versioned harvests.
