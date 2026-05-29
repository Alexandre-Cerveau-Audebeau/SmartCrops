---
name: coderabbit-harvest
description: Harvest CodeRabbit review comments for a PR or commit across GitHub (inline, review body, walkthrough) and the VS Code Extension, classified by severity. Use when asked to harvest or check CodeRabbit, "récupérer les commentaires CodeRabbit", or after pushing to a branch with an open PR.
---

# coderabbit-harvest

This skill extracts and analyzes CodeRabbit review comments for the SmartCrops repository. It is Windows-specific tooling (PowerShell 7+ and paths to `%APPDATA%\Code\User\workspaceStorage`) and assumes the standard SmartCrops workflow (git-flow, `develop` base branch, single feature branch per PR).

## When to use this skill

Trigger this skill when the user:

- Asks to harvest CodeRabbit comments on a commit or PR (in any language)
- Has just pushed a commit and the response would benefit from CodeRabbit context
- Asks "what did CodeRabbit say" / "any feedback yet" / "review en cours"
- Asks for help merging a PR (the skill output informs the merge decision)
- Asks to compare Extension vs GitHub review divergence
- Asks to compare current review against a previous one (`--compare-with <sha>`)

Do **not** trigger when:

- The user is in pure code-writing flow with no CodeRabbit context needed
- The user asks generic GitHub questions unrelated to review comments
- The user is on a branch with no open PR yet

## Requirements

- **PowerShell 7.0+** (install via `winget install Microsoft.PowerShell`). Scripts use null-coalescing (`??`) and ternary (`?:`) operators.
- **VS Code with CodeRabbit Extension** installed, signed in, and synced (workspace JSON freshly written).
- **`gh` CLI** authenticated against the SmartCrops repo.
- **The SmartCrops repo** cloned at the workspace path matching the user's `%APPDATA%` storage hash.

## Inputs

- `--commit <sha>` (optional): target a specific commit SHA. Defaults to HEAD.
- `--pr <number>` (optional): target a specific PR number. Defaults to the PR matching the current branch.
- `--compare-with <previous-sha>` (optional): produce a diff vs a previous harvest's JSON. Looks for `/tmp/harvest-<previous-sha-prefix>.json`. Adds transition labels (NEW/PERSISTED/MODIFIED/RESOLVED) to each comment.
- `--help`: print this SKILL.md's content and exit.

If no flag is provided, the skill harvests HEAD on the current branch.

## What this skill does

The skill runs in 4 stages:

1. **Locate** (`Locate-Review.ps1`) — Enumerate every CodeRabbit Extension JSON under `%APPDATA%\Code\User\workspaceStorage\*\coderabbit.coderabbit-vscode\`, parse each (single-object OR array shape), and select the entry whose `headCommitId` matches the target commit AND whose `status` is `completed` (cancelled/in_progress/failed excluded), newest by `endedAt`. The match key is the `headCommitId` field *inside* the JSON — never the file name (the name is an opaque content hash). No file-mtime freshness gate: `status == 'completed'` is the readiness signal. Exit 3 (not a hard error) when no completed entry exists — the commit is unreviewed or legitimately skipped, and the GitHub surfaces are harvested alone.
2. **Read** (`Classify-Comments.ps1`) — Read the located Extension entry (if any) plus **three** GitHub surfaces: `pulls/<n>/comments` (inline), `pulls/<n>/reviews[].body` (grouped nitpicks + the `Actionable comments posted: N` marker), and `issues/<n>/comments` (walkthrough / `Review skipped` notices). Each comment is tagged with its surface: `extension`, `github-inline`, `github-review`, or `github-walkthrough`.
3. **Classify** — Run rule-based classification on each comment to produce one of: `LGTM`, `NITPICK`, `MAJOR`, or `REVIEW_NEEDED`. See `references/classification-rules.md` for the rule set.
4. **Report** (`Write-Report.ps1`) — Write a JSON file at `/tmp/harvest-<sha-prefix>.json` (gitignored) containing the full raw data. Print a markdown summary inline.

If `--compare-with` is set, stage 3 additionally tags each comment with a transition label (NEW/PERSISTED/MODIFIED/RESOLVED) by comparing against the previous harvest's JSON.

## Comparison mode

When invoked with `--compare-with <previous-sha>`, the skill loads `/tmp/harvest-<previous-sha-prefix>.json` and matches comments between the two harvests:

| Transition | Meaning |
|---|---|
| **NEW** | Comment exists in current harvest, absent from previous |
| **PERSISTED** | Comment exists in both, body unchanged |
| **MODIFIED** | Comment id exists in both, but body differs |
| **RESOLVED** | Comment exists in previous, absent from current |

Matching priority: (1) by `id` (stable), (2) fallback to `path + startLine + endLine`. MODIFIED comments are always detailed in the markdown summary regardless of their classification bucket — body changes signal that CodeRabbit's analysis evolved.

If `--compare-with` references a previous SHA but the JSON file doesn't exist, the skill **STOPs** and reports — comparison without a baseline is not silently skipped.

## Output format

### Markdown summary (inline)

```text
# Harvest report — PR #<n> commit <sha>

## Sanity
- Branch, HEAD, CI status, JSON freshness

## Counts (auto-classified)
- LGTM: N
- NITPICK: N
- MAJOR: N
- REVIEW_NEEDED: N (flagged for Claude's judgment)
- TOTAL substantive: N

## Cross-source surfaces
- Extension: N comment(s)
- GitHub: N comment(s)
- (the skill does not deduplicate across sources — the same finding may appear in both)

## Substantive comments
[Table: file:line | type | severity | classification | 1-line title]

## Details (only for NITPICK, MAJOR, REVIEW_NEEDED, and MODIFIED if --compare-with)
[Per comment: full body, codegen instructions, suggestion diff, transition if applicable]

## Poem
<CodeRabbit poem if present>
```

LGTM comments are mentioned only in counts, never detailed.

### JSON file (persistent, `/tmp/harvest-<sha-prefix>.json`)

Schema documented in `references/output-format.md`. Contains all raw data including LGTM bodies for future re-querying without re-running.

## How Claude Code should invoke this skill

Read this SKILL.md, then run the scripts in sequence. Default invocation pattern (target HEAD):

```powershell
# Resolve target commit (default: HEAD)
$targetCommit = git rev-parse HEAD

# Resolve PR number from current branch
$prNumber = (gh pr view --json number --jq '.number') -as [int]
if (-not $prNumber) {
    Write-Error "No open PR for current branch — STOPPING"
    exit 2
}

$skillRoot = ".claude\skills\coderabbit-harvest"
$shortSha = $targetCommit.Substring(0, 7)
$outputPath = "/tmp/harvest-$shortSha.json"

# Locate the Extension review ENTRY by parsing headCommitId inside each workspace
# JSON (SMA-54 M1/M3/M4 — the old SHA256("<repo>-<branch>-reviews") file-name hash
# never matched; the real file names are opaque content hashes). Locate-Review
# runs as a SEPARATE process so its `exit 3` ("no completed review for this
# commit") does not terminate this session — that's the legitimate-skip /
# unreviewed case (M2), where we still harvest the GitHub surfaces alone.
$entryPath = "/tmp/cr-entry-$shortSha.json"
$entryJson = pwsh -NoProfile -File "$skillRoot\scripts\Locate-Review.ps1" -CommitSha $targetCommit
$locateRc = $LASTEXITCODE
# Branch explicitly on Locate's exit code — collapsing all non-zero into
# "GitHub-only" would silently swallow a real failure (exit 1 = invalid
# input/environment) and contradict the skill's STOP policy (CR PR #97).
#   0 + entry  -> use it
#   0 + empty  -> STOP: Locate claimed success but emitted nothing (anomaly)
#   3          -> GitHub-only fallback (unreviewed / legitimately skipped, M2)
#   else (1..) -> STOP, do not silently degrade
if ($locateRc -eq 0 -and $entryJson) {
    $entryJson | Set-Content -Path $entryPath -Encoding UTF8
} elseif ($locateRc -eq 0) {
    # Success exit but no JSON on stdout — a contract violation, not a clean
    # "no review". Do NOT fall through to exit 0 (that would signal success
    # while harvesting nothing). STOP (CR PR #97 round 2).
    Write-Error "Locate-Review.ps1 exited 0 but emitted no entry JSON — STOPPING (anomaly)."
    exit 3
} elseif ($locateRc -eq 3) {
    # Remove any stale file so Classify-Comments sees "no entry" rather than a
    # previous commit's data, then proceed on the GitHub surfaces alone.
    if (Test-Path $entryPath) { Remove-Item $entryPath }
} else {
    Write-Error "Locate-Review.ps1 failed (exit $locateRc) — STOPPING (not a clean no-review case)."
    exit $locateRc
}

# Run classification + reporting in ONE pwsh 7 session. `pwsh -File A | pwsh -File B`
# does NOT work: cross-process, A's stdout lands on B's raw process stdin, which a
# `-File`-invoked script does not bind to a ValueFromPipeline parameter. Both
# scripts must share a single session so the pipeline binds normally. The review
# entry is passed by PATH (not inline) so this string never embeds a multi-KB blob.
$entryArg = if (Test-Path $entryPath) { "-ReviewEntryPath '$entryPath' " } else { "" }
$pipeline = "& '$skillRoot\scripts\Classify-Comments.ps1' " +
    "$entryArg-GitHubPrNumber $prNumber -CommitSha '$targetCommit' " +
    "| & '$skillRoot\scripts\Write-Report.ps1' -OutputPath '$outputPath'"
pwsh -NoProfile -Command $pipeline
```

For comparison mode, add `-PreviousJsonPath '/tmp/harvest-<previous-sha-prefix>.json'` to the `Classify-Comments.ps1` call inside `$pipeline`.

For `--help`, just print this SKILL.md content. The `Classify-Comments.ps1` script handles this via `-Help` switch (reads `..\SKILL.md` relative to `$PSScriptRoot`).

## Edge cases (strict mode — STOP and report)

The skill STOPs and reports without producing output if any of these happens:

- `gh` CLI not installed (precheck via `Get-Command gh`), not authenticated, or rate-limited — the **inline** GitHub surface is critical (exit 3). The review-body and walkthrough surfaces are additive: a transient there warns and continues rather than sinking the harvest.
- Target PR closed/merged at harvest time (the harvest is for an in-progress PR; closed PRs should be queried via the JSON file from a prior harvest)
- Target commit not part of any open PR (when not explicitly passed `--pr`)
- `--compare-with <sha>` provided but `/tmp/harvest-<sha-prefix>.json` doesn't exist
- PowerShell version < 7.0 (the script's `#requires` directive will block execution)

Do not silently produce partial output. Report the edge case clearly with a non-zero exit code, and let the user decide whether to retry or work around.

**Not a STOP (SMA-54 M2):** a target commit with no `completed` Extension review entry (`Locate-Review.ps1` exits 3) is the *unreviewed-or-legitimately-skipped* case — e.g. a CSV/data-only PR excluded by CodeRabbit's path filters — **not** an error. The harvest proceeds on the GitHub surfaces alone, and the report flags `extensionFound: false` (and `reviewSkipped: true` when the walkthrough carries a "Review skipped"/"path filters" notice). The old behavior conflated this with workspace-hash drift and hard-exited; both are now distinguished.

## Memory / state

The skill does not maintain state across invocations. Each harvest is independent. The JSON files at `/tmp/harvest-<sha-prefix>.json` accumulate but are not used by subsequent harvests unless `--compare-with` is explicitly passed.

Clean up: `Remove-Item /tmp/harvest-*.json` (manual, not skill-managed).

## See also

- `references/classification-rules.md` — full classification rule set
- `references/output-format.md` — JSON schema documentation
- `scripts/Classify-Comments.ps1` — classification implementation
- `scripts/Write-Report.ps1` — output writer (JSON file + markdown summary)
- `docs/coding-guidelines.md` — SmartCrops workflow conventions (including CodeRabbit harvest expectations)
- ADR-0001, ADR-0002 — example architectural decisions referenced from review comments
