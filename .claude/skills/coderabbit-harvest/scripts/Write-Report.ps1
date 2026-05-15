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

    # Validate critical schema fields before use. Malformed input shouldn't
    # produce a cryptic .Substring() / property-access error; report clearly
    # which field is wrong. (Get-SafeProp duplicated from Classify-Comments.ps1
    # to keep this script independently runnable.)
    function Get-SafeProp {
        [CmdletBinding()]
        param($Object, [Parameter(Mandatory = $true)] [string]$Name, $Default = '')
        if ($Object -and $Object.PSObject.Properties[$Name]) {
            $value = $Object.PSObject.Properties[$Name].Value
            if ($null -ne $value) { return $value }
        }
        return $Default
    }

    $targetCommit = (Get-SafeProp -Object $data -Name 'targetCommit').ToString()
    if ([string]::IsNullOrWhiteSpace($targetCommit) -or $targetCommit.Length -lt 7) {
        Write-Error "Schema validation failed: 'targetCommit' missing or shorter than 7 chars (got '$targetCommit')"
        exit 1
    }

    $prNumber = Get-SafeProp -Object $data -Name 'prNumber' -Default $null
    if ($null -eq $prNumber) {
        Write-Error "Schema validation failed: 'prNumber' missing from input JSON"
        exit 1
    }

    $extensionMeta = Get-SafeProp -Object $data -Name 'extensionMeta' -Default $null
    if ($null -eq $extensionMeta) {
        Write-Error "Schema validation failed: 'extensionMeta' missing from input JSON"
        exit 1
    }

    $commentsRaw = Get-SafeProp -Object $data -Name 'comments' -Default $null
    if ($null -eq $commentsRaw) {
        Write-Error "Schema validation failed: 'comments' missing from input JSON"
        exit 1
    }

    $counts = Get-SafeProp -Object $data -Name 'counts' -Default $null
    if ($null -eq $counts) {
        Write-Error "Schema validation failed: 'counts' missing from input JSON"
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
    $shortSha = $targetCommit.Substring(0, 7)

    [void]$sb.AppendLine("# Harvest report — PR #$prNumber commit $shortSha")
    [void]$sb.AppendLine()

    # Sanity
    [void]$sb.AppendLine("## Sanity")
    [void]$sb.AppendLine("- Commit: $targetCommit")
    [void]$sb.AppendLine("- PR: #$prNumber")
    [void]$sb.AppendLine("- Extension review: $($extensionMeta.title) (status=$($extensionMeta.status))")
    [void]$sb.AppendLine("- Review window: $($extensionMeta.startedAt) → $($extensionMeta.endedAt)")
    if ($data.comparisonMode) {
        [void]$sb.AppendLine("- Comparison mode: ENABLED")
    }
    [void]$sb.AppendLine()

    # Counts
    [void]$sb.AppendLine("## Counts (auto-classified)")
    [void]$sb.AppendLine("- LGTM: $($counts.LGTM)")
    [void]$sb.AppendLine("- NITPICK: $($counts.NITPICK)")
    [void]$sb.AppendLine("- MAJOR: $($counts.MAJOR)")
    [void]$sb.AppendLine("- REVIEW_NEEDED: $($counts.REVIEW_NEEDED) (flagged for Claude's judgment)")
    [void]$sb.AppendLine("- TOTAL: $($counts.total)")
    if ($data.comparisonMode) {
        [void]$sb.AppendLine("- RESOLVED (vs previous): $($counts.resolved)")
    }
    [void]$sb.AppendLine()

    # Cross-source surfaces — the skill does NOT deduplicate Extension vs GitHub
    # (no reliable deterministic key — see classification-rules.md). Counts are
    # reported per-source; the same finding may appear in both.
    # @(...) forces an array so .Count is valid even for 0 matches.
    $extensionCount = @($commentsRaw | Where-Object source -eq 'extension').Count
    $githubCount = @($commentsRaw | Where-Object source -eq 'github').Count
    [void]$sb.AppendLine("## Cross-source surfaces")
    [void]$sb.AppendLine("- Extension: $extensionCount comment(s)")
    [void]$sb.AppendLine("- GitHub: $githubCount comment(s)")
    [void]$sb.AppendLine("- Overlap is not deterministically resolvable; the same finding may appear in both surfaces (see references/classification-rules.md). Counts are per-source.")
    [void]$sb.AppendLine()

    # Substantive comments table (NITPICK / MAJOR / REVIEW_NEEDED + MODIFIED regardless)
    # @(...) forces an array so .Count is valid even for 0 matches.
    $substantive = @($commentsRaw | Where-Object {
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
    if ($data.comparisonMode -and $counts.resolved -gt 0) {
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
    if ($extensionMeta.poem) {
        [void]$sb.AppendLine("## Poem")
        [void]$sb.AppendLine()
        [void]$sb.AppendLine($extensionMeta.poem)
        [void]$sb.AppendLine()
    }

    # Footer
    [void]$sb.AppendLine("---")
    [void]$sb.AppendLine("*Full data: ``$OutputPath``*")

    $sb.ToString()
    exit 0
}
