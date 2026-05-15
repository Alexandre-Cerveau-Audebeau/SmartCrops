---
name: coderabbit-harvest
description: Harvest CodeRabbit review comments from a commit or PR — reads both the VS Code Extension JSON workspace storage and GitHub API in parallel, classifies comments (LGTM/nitpick/major/REVIEW_NEEDED), and produces a JSON file plus markdown summary. Use this skill whenever Alexandre asks to "harvest the last commit", "check CodeRabbit", "récupérer les commentaires CodeRabbit", or any phrasing involving CodeRabbit review extraction. Also use proactively after any `git push` to a branch with an open PR.
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

1. **Locate** — Compute the workspace JSON path from the SmartCrops repo path and current branch using SHA256 hashing. Verify the file exists and is fresh (post-push, within 5 minutes).
2. **Read** — Parse the workspace JSON to extract the review object matching the target commit. In parallel, call `gh api /repos/<owner>/<repo>/pulls/<n>/reviews` and `/repos/<owner>/<repo>/pulls/<n>/comments` to get the GitHub-side view.
3. **Classify** — Run rule-based classification on each comment to produce one of: `LGTM`, `NITPICK`, `MAJOR`, or `REVIEW_NEEDED`. See `references/classification-rules.md` for the rule set.
4. **Report** — Write a JSON file at `/tmp/harvest-<sha-prefix>.json` (gitignored) containing the full raw data. Print a markdown summary inline.

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

# Locate the Extension JSON for the current branch
$repoPath = (Get-Location).Path
$currentBranch = git branch --show-current
$key = "$repoPath-$currentBranch-reviews"
$sha = (Get-FileHash -Algorithm SHA256 -InputStream `
    ([System.IO.MemoryStream]::new(
        [System.Text.Encoding]::UTF8.GetBytes($key)
    ))).Hash.ToLower()

$workspaceStorage = "$env:APPDATA\Code\User\workspaceStorage"
$crFolder = Get-ChildItem -Path $workspaceStorage -Directory -Force |
    ForEach-Object {
        $candidate = Join-Path $_.FullName "coderabbit.coderabbit-vscode"
        if (Test-Path (Join-Path $candidate "$sha.json")) { $candidate }
    } | Select-Object -First 1

if (-not $crFolder) {
    Write-Error "Extension JSON not found — STOPPING (workspace hash drift?)"
    exit 2
}

$reviewsFile = Join-Path $crFolder "$sha.json"

# Run classification + reporting in ONE pwsh 7 session. `pwsh -File A | pwsh -File B`
# does NOT work: cross-process, A's stdout lands on B's raw process stdin, which a
# `-File`-invoked script does not bind to a ValueFromPipeline parameter. Both
# scripts must share a single session so the pipeline binds normally.
$skillRoot = ".claude\skills\coderabbit-harvest"
$shortSha = $targetCommit.Substring(0, 7)
$outputPath = "/tmp/harvest-$shortSha.json"

$pipeline = "& '$skillRoot\scripts\Classify-Comments.ps1' " +
    "-ReviewsFile '$reviewsFile' -GitHubPrNumber $prNumber -CommitSha '$targetCommit' " +
    "| & '$skillRoot\scripts\Write-Report.ps1' -OutputPath '$outputPath'"
pwsh -NoProfile -Command $pipeline
```

For comparison mode, add `-PreviousJsonPath '/tmp/harvest-<previous-sha-prefix>.json'` to the `Classify-Comments.ps1` call inside `$pipeline`.

For `--help`, just print this SKILL.md content. The `Classify-Comments.ps1` script handles this via `-Help` switch (reads `..\SKILL.md` relative to `$PSScriptRoot`).

## Edge cases (strict mode — STOP and report)

The skill STOPs and reports without producing output if any of these happens:

- Extension JSON workspace file not found, or last written more than 5 minutes ago (configurable in `Classify-Comments.ps1` via the `$freshnessLimitMinutes` local). Stale data is treated as a STOP condition because the most likely cause is the Extension hasn't synced after the latest push — silently using stale data would produce a misleading harvest.
- Review object for target commit absent from JSON
- `gh` CLI not authenticated or rate-limited (exit codes from `gh api`)
- Target PR closed/merged at harvest time (the harvest is for an in-progress PR; closed PRs should be queried via the JSON file from a prior harvest)
- Target commit not part of any open PR (when not explicitly passed `--pr`)
- `--compare-with <sha>` provided but `/tmp/harvest-<sha-prefix>.json` doesn't exist
- PowerShell version < 7.0 (the script's `#requires` directive will block execution)

Do not silently produce partial output. Report the edge case clearly with a non-zero exit code, and let the user decide whether to retry or work around.

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
