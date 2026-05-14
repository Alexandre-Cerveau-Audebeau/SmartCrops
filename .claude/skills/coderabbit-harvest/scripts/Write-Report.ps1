#requires -Version 7.0

<#
.SYNOPSIS
    Write a JSON harvest file and emit a markdown summary from classified comments.

.DESCRIPTION
    Accepts classified comment JSON (from Classify-Comments.ps1) via stdin or -InputJson.
    Writes the raw JSON to OutputPath. Emits a token-efficient markdown summary on stdout
    that details NITPICK / MAJOR / REVIEW_NEEDED comments, lists MODIFIED comments
    regardless of bucket, and tallies LGTM in counts only.

.PARAMETER OutputPath
    Where to write the persistent JSON file. Typically /tmp/harvest-<sha-prefix>.json.

.PARAMETER InputJson
    Optional: classified JSON as a string. If not provided, reads from stdin.

.NOTES
    PowerShell 7+ required.
    Exit codes: 0 = OK, 1 = invalid input.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [Parameter(Mandatory = $false, ValueFromPipeline = $true)]
    [string]$InputJson
)

begin {
    $ErrorActionPreference = 'Stop'
    Set-StrictMode -Version Latest
    $inputLines = [System.Collections.Generic.List[string]]::new()
}

process {
    if ($InputJson) { $inputLines.Add($InputJson) | Out-Null }
}

end {
    $joined = $inputLines -join "`n"
    if (-not $joined) {
        Write-Error "No JSON input received (expected from stdin or -InputJson)"
        exit 1
    }

    try {
        $data = $joined | ConvertFrom-Json -Depth 100
    } catch {
        Write-Error "Failed to parse input JSON: $_"
        exit 1
    }

    # Write raw JSON to OutputPath (ensure parent dir exists)
    $outputDir = Split-Path $OutputPath -Parent
    if ($outputDir -and -not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }
    $joined | Set-Content -Path $OutputPath -Encoding UTF8

    # Build markdown summary
    $sb = [System.Text.StringBuilder]::new()
    $shortSha = $data.targetCommit.Substring(0, 7)

    [void]$sb.AppendLine("# Harvest report — PR #$($data.prNumber) commit $shortSha")
    [void]$sb.AppendLine()

    # Sanity
    [void]$sb.AppendLine("## Sanity")
    [void]$sb.AppendLine("- Commit: $($data.targetCommit)")
    [void]$sb.AppendLine("- PR: #$($data.prNumber)")
    [void]$sb.AppendLine("- Extension review: $($data.extensionMeta.title) (status=$($data.extensionMeta.status))")
    [void]$sb.AppendLine("- Review window: $($data.extensionMeta.startedAt) → $($data.extensionMeta.endedAt)")
    if ($data.comparisonMode) {
        [void]$sb.AppendLine("- Comparison mode: ENABLED")
    }
    [void]$sb.AppendLine()

    # Counts
    [void]$sb.AppendLine("## Counts (auto-classified)")
    [void]$sb.AppendLine("- LGTM: $($data.counts.LGTM)")
    [void]$sb.AppendLine("- NITPICK: $($data.counts.NITPICK)")
    [void]$sb.AppendLine("- MAJOR: $($data.counts.MAJOR)")
    [void]$sb.AppendLine("- REVIEW_NEEDED: $($data.counts.REVIEW_NEEDED) (flagged for Claude's judgment)")
    [void]$sb.AppendLine("- TOTAL: $($data.counts.total)")
    if ($data.comparisonMode) {
        [void]$sb.AppendLine("- RESOLVED (vs previous): $($data.counts.resolved)")
    }
    [void]$sb.AppendLine()

    # Cross-source surfaces — the skill does NOT deduplicate Extension vs GitHub
    # (no reliable deterministic key — see classification-rules.md). Counts are
    # reported per-source; the same finding may appear in both.
    # @(...) forces an array so .Count is valid even for 0 matches.
    $extensionCount = @($data.comments | Where-Object source -eq 'extension').Count
    $githubCount = @($data.comments | Where-Object source -eq 'github').Count
    [void]$sb.AppendLine("## Cross-source surfaces")
    [void]$sb.AppendLine("- Extension: $extensionCount comment(s)")
    [void]$sb.AppendLine("- GitHub: $githubCount comment(s)")
    [void]$sb.AppendLine("- Overlap is not deterministically resolvable; the same finding may appear in both surfaces (see references/classification-rules.md). Counts are per-source.")
    [void]$sb.AppendLine()

    # Substantive comments table (NITPICK / MAJOR / REVIEW_NEEDED + MODIFIED regardless)
    # @(...) forces an array so .Count is valid even for 0 matches.
    $substantive = @($data.comments | Where-Object {
        $_.classification -in @('NITPICK', 'MAJOR', 'REVIEW_NEEDED') -or
        ($data.comparisonMode -and $_.transition -eq 'MODIFIED')
    })

    if ($substantive.Count -gt 0) {
        [void]$sb.AppendLine("## Substantive comments")
        [void]$sb.AppendLine()
        $headerCols = @('file:line', 'type', 'severity', 'classification')
        if ($data.comparisonMode) { $headerCols += 'transition' }
        $headerCols += 'title'
        [void]$sb.AppendLine("| $($headerCols -join ' | ') |")
        [void]$sb.AppendLine("|$('---|' * $headerCols.Count)")
        foreach ($c in $substantive) {
            $loc = if ($c.path) { "$($c.path):$($c.startLine)" } else { '?' }
            $title = if ($c.title) { $c.title.Substring(0, [Math]::Min(80, $c.title.Length)) } else { '(no title)' }
            $row = @($loc, $c.type, $c.severity, $c.classification)
            if ($data.comparisonMode) { $row += ($c.transition ?? 'NEW') }
            $row += $title
            [void]$sb.AppendLine("| $($row -join ' | ') |")
        }
        [void]$sb.AppendLine()

        # Details section
        [void]$sb.AppendLine("## Details")
        [void]$sb.AppendLine()
        foreach ($c in $substantive) {
            $loc = if ($c.path) { "$($c.path):$($c.startLine)-$($c.endLine)" } else { '(no path)' }
            [void]$sb.AppendLine("### $loc — $($c.classification)")
            if ($c.title) { [void]$sb.AppendLine("**$($c.title)**") }
            if ($c.body) {
                [void]$sb.AppendLine()
                [void]$sb.AppendLine($c.body)
            }
            if ($c.codegenInstructions) {
                [void]$sb.AppendLine()
                [void]$sb.AppendLine("**Codegen:** $($c.codegenInstructions)")
            }
            if ($data.comparisonMode -and $c.transition) {
                [void]$sb.AppendLine()
                [void]$sb.AppendLine("**Transition:** $($c.transition)")
            }
            [void]$sb.AppendLine()
            [void]$sb.AppendLine("---")
            [void]$sb.AppendLine()
        }
    } else {
        [void]$sb.AppendLine("## Substantive comments")
        [void]$sb.AppendLine()
        [void]$sb.AppendLine("None — all comments classified as LGTM no-ops.")
        [void]$sb.AppendLine()
    }

    # Resolved section (only in comparison mode)
    if ($data.comparisonMode -and $data.counts.resolved -gt 0) {
        [void]$sb.AppendLine("## Resolved comments (vs previous harvest)")
        [void]$sb.AppendLine()
        foreach ($r in $data.resolved) {
            $loc = if ($r.path) { "$($r.path):$($r.startLine)" } else { '(no path)' }
            $title = if ($r.title) { $r.title } else { '(no title)' }
            [void]$sb.AppendLine("- $loc — $title")
        }
        [void]$sb.AppendLine()
    }

    # Poem
    if ($data.extensionMeta.poem) {
        [void]$sb.AppendLine("## Poem")
        [void]$sb.AppendLine()
        [void]$sb.AppendLine($data.extensionMeta.poem)
        [void]$sb.AppendLine()
    }

    # Footer
    [void]$sb.AppendLine("---")
    [void]$sb.AppendLine("*Full data: ``$OutputPath``*")

    $sb.ToString()
    exit 0
}
