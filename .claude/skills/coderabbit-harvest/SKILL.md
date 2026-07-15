---
name: coderabbit-harvest
description: Harvest CodeRabbit review comments across GitHub (inline, review body, walkthrough) and the VS Code Extension, classified by severity. Covers three modes - single commit/PR, FULL-BRANCH (every SHA of the branch), and develop post-merge (Extension-only, no PR). Use when asked to harvest or check CodeRabbit, "récupérer les commentaires CodeRabbit", after pushing to a branch with an open PR, or after a merge (develop post-merge review is an official cycle step).
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
- Asks for a **full-branch harvest** (project standard: Extension harvest covers ALL SHAs of the branch, not just HEAD)
- Asks to harvest the **develop post-merge Extension review** (project standard since Jul 2026: an official cycle step after every merge, before the next workstream)

Do **not** trigger when:

- The user is in pure code-writing flow with no CodeRabbit context needed
- The user asks generic GitHub questions unrelated to review comments
- The user is on a branch with no open PR yet — **unless** the request is the develop post-merge (Extension-only) mode, which has no PR by design

## Requirements

- **PowerShell 7.0+** (install via `winget install Microsoft.PowerShell`). Scripts use null-coalescing (`??`) and ternary (`?:`) operators.
- **VS Code with CodeRabbit Extension** installed, signed in, and synced (workspace JSON freshly written).
- **`gh` CLI** authenticated against the SmartCrops repo (not needed in Extension-only mode).
- **The SmartCrops repo** cloned at the workspace path matching the user's `%APPDATA%` storage hash.

## Inputs

- `--commit <sha>` (optional): target a specific commit SHA. Defaults to HEAD.
- `--pr <number>` (optional): target a specific PR number. Defaults to the PR matching the current branch.
- `--compare-with <previous-sha>` (optional): produce a diff vs a previous harvest's JSON. Looks for `/tmp/harvest-<previous-sha-prefix>.json`. Adds transition labels (NEW/PERSISTED/MODIFIED/RESOLVED) to each comment.
- `--full-branch` (protocol flag, see Harvest modes): iterate Locate-Review over every SHA of the branch.
- `--develop` (protocol flag, see Harvest modes): Extension-only harvest of a develop commit, no PR involved.
- `--help`: print this SKILL.md's content and exit.

If no flag is provided, the skill harvests HEAD on the current branch.

## Harvest modes (project standards, Jul 2026)

### 1. Single commit / PR (default)

The 4-stage flow below, unchanged. Use for mid-cycle rounds on an open PR.

### 2. FULL-BRANCH (project hard rule for pre-merge Extension harvests)

The Extension harvest must cover **every SHA of the branch**, not just HEAD — exit-3 per SHA is reported as-is, never papered over. Invocation pattern:

```powershell
$base = 'develop'
$shas = git rev-list --reverse "$base..HEAD"
foreach ($sha in $shas) {
    $short = $sha.Substring(0, 7)
    pwsh -NoProfile -File "$skillRoot\scripts\Locate-Review.ps1" -CommitSha $sha -OutputPath "/tmp/cr-entry-$short.json"
    "SHA $short -> exit $LASTEXITCODE"   # 0 = completed entry found; 3 = no completed review for this SHA (report as-is)
}
```

Then run the full 4-stage flow (Classify + Report) for each SHA that produced an entry, and list the exit-3 SHAs verbatim in the final report. **Why HEAD closes the branch anyway:** the Extension reviews the branch's CUMULATIVE diff (`reviewedCommitIds`) — a completed run on HEAD covers intermediate commits that were never individually reviewed, so definitive exit-3s on intermediate SHAs are **not coverage holes**. They must still be listed (the orchestrator decides), never silently dropped.

### 3. Develop post-merge (Extension-only, no PR) — official cycle step

After every merge, Alexandre runs an Extension review **on develop**; harvesting it is an official step before the next workstream. There is **no PR** and no GitHub surface for this review. Protocol that works with the current scripts (no .ps1 change needed):

```powershell
$targetCommit = git rev-parse HEAD   # on develop, post-merge
$short = $targetCommit.Substring(0, 7)
$entryPath = "/tmp/cr-entry-develop-$short.json"
pwsh -NoProfile -File "$skillRoot\scripts\Locate-Review.ps1" -CommitSha $targetCommit -OutputPath $entryPath
# exit 0 -> read $entryPath directly (Claude classifies the entry's comments in-session,
#           using references/classification-rules.md as the rule set)
# exit 3 -> no completed develop review for this SHA: report as-is and ask whether the
#           Extension review has actually been run/synced yet
```

Do NOT route this mode through the default invocation (it would exit 2 on "No open PR" — that guard is correct for PR mode only). The historical develop-review backlog is closed without backfill: only harvest develop reviews from the current cycle onward (the net re-detects what matters — proven by SMA-283, re-surfaced by CR on a later PR).

## What this skill does

The skill runs in 4 stages:

1. **Locate** (`Locate-Review.ps1`) — Enumerate every CodeRabbit Extension JSON under `%APPDATA%\Code\User\workspaceStorage\*\coderabbit.coderabbit-vscode\`, parse each (single-object OR array shape), and select the entry whose `headCommitId` matches the target commit AND whose `status` is `completed` (cancelled/in_progress/failed excluded), newest by `endedAt`. The match key is the `headCommitId` field *inside* the JSON — never the file name (the name is an opaque content hash). No file-mtime freshness gate: `status == 'completed'` is the readiness signal. Exit 3 (not a hard error) when no completed entry exists — the commit is unreviewed or legitimately skipped, and the GitHub surfaces are harvested alone.
2. **Read** (`Classify-Comments.ps1`) — Read the located Extension entry (if any) plus **three** GitHub surfaces: `pulls/<n>/comments` (inline), `pulls/<n>/reviews[].body` (grouped nitpicks + the `Actionable comments posted: N` marker), and `issues/<n>/comments` (walkthrough / `Review skipped` notices). Each comment is tagged with its surface: `extension`, `github-inline`, `github-review`, or `github-walkthrough`.
3. **Classify** — Run rule-based classification on each comment to produce one of: `LGTM`, `NITPICK`, `MAJOR`, or `REVIEW_NEEDED`. See `references/classification-rules.md` for the rule set.
4. **Report** (`Write-Report.ps1`) — Write a JSON file at `/tmp/harvest-<sha-prefix>.json` (gitignored) containing the full raw data. Print a markdown summary inline.

If `--compare-with` is set, stage 3 additionally tags each comment with a transition label (NEW/PERSISTED/MODIFIED/RESOLVED) by comparing against the previous harvest's JSON.

## Anti-stale & run-tracking protocol (learned Jun-Jul 2026)

- **Never conclude "0 findings" from a single poll while a run may be in flight.** Incident PR #139/SMA-204: the harvest reported GitHub inline = 0 while CR had posted 10 comments (1 MAJOR) — poll `pulls/<n>/comments` + `pulls/<n>/reviews` until the run has landed. Launch the Extension review in parallel and wait for BOTH surfaces to finish before harvesting.
- **A 0-comment run EDITS the walkthrough** instead of posting a review body. The run ID, reviewed commit range, and "No actionable comments" live in the (edited) walkthrough — extract them from the `github-walkthrough` surface to prove which SHA the latest run covered. Absence of a new review body is NOT absence of a run.
- **A post-fix run covers everything since the LAST reviewed SHA** — a review gap on an intermediate commit resolves itself on the next cycle without a dedicated re-trigger (proven on PR #171). Track the reviewed range per run rather than re-triggering per commit.
- **Dead GitHub review ("Waiting for status" for hours):** the proven remedy is a PR comment `@coderabbitai full review` (standardized after an 8-hour hang on PR #170).
- **Never conclude on one surface alone.** Extension and GitHub diverge in BOTH directions (Extension-only reviews exist; GitHub rounds can fail to propagate). Convergence of the two surfaces on the same finding is a **strong signal the finding is real** (observed 3x independently on PR #165).
- **Orchestrator cross-check:** on the Claude.ai side, `Linear:get_diff_threads` on the PR URL is a faithful GitHub surface (bodies, inline threads, resolved/outdated state, "Addressed in commit X" annotations) — the harvest JSON and that surface should agree.

## Reporting contract (hardened Jul 2026)

- **HARVEST = STOP AND REPORT.** The harvest session ends at the report; fixes/dispositions are a separate, explicitly-instructed step. Never auto-merge, never auto-fix.
- **Disposition equation, mandatory in every per-run report:** `Actionable posted N + outside-diff M = N+M written dispositions`. `N` = the `actionableMarker` (remember: **absence is not zero** — a nitpicks-only review omits the marker); `M` = the count of `type='outsideDiffRange'` comments in the harvest JSON. The harvest is not closed until N+M dispositions (ACCEPT/DEFER/REJECT, each deferred/rejected one carrying its Linear `cr-*` ticket) are written by the orchestrator.
- **Machine-proof outputs:** the markdown summary and the JSON path are the proof; claims about review state without them count as not done.

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
- Disposition equation: Actionable posted N + outside-diff M = N+M dispositions expected

## Cross-source surfaces
- Extension: N comment(s)
- GitHub: N comment(s)
- (the skill does not deduplicate across sources — the same finding may appear in both;
  cross-surface convergence on one finding = strong signal it is real)

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
#   0 + empty  -> STOP with exit 2 (contract violation, distinct from 3)
#   3          -> GitHub-only fallback (unreviewed / legitimately skipped, M2)
#   else (1..) -> STOP, do not silently degrade
if ($locateRc -eq 0 -and $entryJson) {
    $entryJson | Set-Content -Path $entryPath -Encoding UTF8
} elseif ($locateRc -eq 0) {
    # Success exit but no JSON on stdout - a contract violation, not a clean
    # "no review". Exit 2 (NOT 3): 3 is this flow's benign GitHub-only fallback
    # signal, so reusing it here would mis-brand a hard STOP as a fallback. 2 is
    # a distinct "contract violation" code (CR PR #97 round 3).
    Write-Error "Locate-Review.ps1 exited 0 but emitted no entry JSON - STOPPING (contract violation)."
    exit 2
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
- Target PR closed/merged at harvest time (the harvest is for an in-progress PR; closed PRs should be queried via the JSON file from a prior harvest). **Exception:** the develop post-merge mode is by definition after a merge — it is Extension-only and never touches the PR surfaces (see Harvest modes §3).
- Target commit not part of any open PR (when not explicitly passed `--pr`) — **unless** running the develop post-merge (Extension-only) protocol.
- `--compare-with <sha>` provided but `/tmp/harvest-<sha-prefix>.json` doesn't exist
- PowerShell version < 7.0 (the script's `#requires` directive will block execution)

Do not silently produce partial output. Report the edge case clearly with a non-zero exit code, and let the user decide whether to retry or work around.

**Not a STOP (SMA-54 M2):** a target commit with no `completed` Extension review entry (`Locate-Review.ps1` exits 3) is the *unreviewed-or-legitimately-skipped* case — e.g. a CSV/data-only PR excluded by CodeRabbit's path filters — **not** an error. The harvest proceeds on the GitHub surfaces alone, and the report flags `extensionFound: false` (and `reviewSkipped: true` when the walkthrough carries a "Review skipped"/"path filters" notice). The old behavior conflated this with workspace-hash drift and hard-exited; both are now distinguished.

## Candidate .ps1 improvements (NOT required — the protocols above work with the current scripts)

Both are small quality-of-life patches. If applied, they MUST be made by **editing the files IN PLACE via Claude Code** — never by reinstalling from a downloaded zip (Mark-of-the-Web makes downloaded .ps1 files unexecutable under the signing policy; graved lesson, Jun 18 2026).

1. `Classify-Comments.ps1`: make `-GitHubPrNumber` optional; when absent, skip the three GitHub surfaces and classify the Extension entry alone → the develop post-merge mode gets the full 4-stage pipeline (classification rules + JSON + markdown) instead of the in-session classification fallback.
2. `Write-Report.ps1`: print the disposition equation line (`Actionable posted N + outside-diff M = N+M dispositions expected`) computed from `actionableMarker` and the `outsideDiffRange` count — today the orchestrator computes it from the JSON.

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
