# coderabbit-harvest skill

Repo-level Claude Code skill for harvesting CodeRabbit review comments from SmartCrops PRs. Windows-specific (PowerShell + `%APPDATA%` workspace storage).

## Quick start

After cloning this repo and opening it in Claude Code, the skill is auto-discovered. Trigger it with:

```text
harvest the last commit
```

Or with explicit arguments:

```text
harvest commit 3a8968d
harvest PR 45
harvest --compare-with 86e91ec
```

## What it does

1. Locates the CodeRabbit VS Code Extension review JSON in `%APPDATA%\Code\User\workspaceStorage\<hash>\coderabbit.coderabbit-vscode\<sha256>.json`
2. Fetches the same review data via `gh api /repos/.../pulls/<n>/{reviews,comments}`
3. Compares the two sources (CONVERGENT or DIVERGENT)
4. Classifies each comment: LGTM / NITPICK / MAJOR / REVIEW_NEEDED
5. If `--compare-with <previous-sha>` is passed, diffs against the previous harvest (NEW / PERSISTED / RESOLVED / MODIFIED)
6. Writes `/tmp/harvest-<sha>.json` (gitignored) with raw data
7. Prints a markdown summary inline

## Structure

```text
coderabbit-harvest/
├── SKILL.md                         # Claude Code skill entry point
├── README.md                        # This file
├── scripts/
│   ├── Classify-Comments.ps1       # Rule-based classification
│   └── Write-Report.ps1            # JSON output + markdown summary
└── references/
    ├── classification-rules.md     # Full rule set
    └── output-format.md            # JSON schema doc
```

## Requirements

- Windows + PowerShell 7+
- VS Code with CodeRabbit Extension installed and synced
- `gh` CLI authenticated
- The SmartCrops repo cloned at the workspace path

## Maintenance

This skill is part of a 5-skill plan (see memory entry #26). The other 4 (`coderabbit-classify`, `pre-flight-checks`, `windows-quirks-handler`, `pr-merge-cleanup`) will follow the same `.claude/skills/<name>/` convention established here.

## See also

- `docs/coding-guidelines.md` — SmartCrops workflow including CodeRabbit harvest expectations
- ADR-0001, ADR-0002 — example output format for architectural decisions
