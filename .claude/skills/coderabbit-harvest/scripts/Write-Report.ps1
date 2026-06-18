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
    Optional: classified JSON as a string. Lowest input precedence (see -InputPath).

.PARAMETER InputPath
    Optional: path to a file holding the classified JSON (UTF-8). Input precedence
    is -InputPath > -InputJson > stdin: when -InputPath is given it is used and the
    other two sources are ignored. The orchestrator bridges stages through this file
    because a cross-process `pwsh -File` does not bind stdin to a ValueFromPipeline
    parameter.

.NOTES
    PowerShell 7+ required.
    Exit codes: 0 = OK, 1 = invalid input.
    Error reporting: error paths use the Write-Stderr helper, not Write-Error.
    Necessary because $ErrorActionPreference='Stop' makes Write-Error terminating,
    which would short-circuit before any explicit `exit N` line could run. See issue #50.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [Parameter(Mandatory = $false, ValueFromPipeline = $true)]
    [string]$InputJson,

    [Parameter(Mandatory = $false)]
    [string]$InputPath
)

begin {
    $ErrorActionPreference = 'Stop'
    Set-StrictMode -Version Latest
    $inputLines = [System.Collections.Generic.List[string]]::new()

    # Duplicated from Classify-Comments.ps1 (parity with Get-SafeProp) to keep
    # this script independently runnable. See issue #50 for the rationale -
    # Write-Error becomes terminating under strict mode, so the explicit
    # `exit N` lines below would never run without this workaround.
    function Write-Stderr {
        [CmdletBinding()]
        [OutputType([void])]
        param(
            [Parameter(Mandatory = $true)] [string]$Message,
            [Parameter(Mandatory = $true)] [int]$ExitCode
        )
        [Console]::Error.WriteLine($Message)
        exit $ExitCode
    }
}

process {
    if ($InputJson) { $inputLines.Add($InputJson) | Out-Null }
}

end {
    if ($InputPath) {
        if (-not (Test-Path $InputPath)) {
            Write-Stderr -Message "Input JSON file not found: $InputPath" -ExitCode 1
        }
        # Read the classified bridge file with explicit UTF-8 so multi-byte CR
        # content (emoji) decodes correctly, independent of the console codepage.
        # Wrap the read so a permission / lock / disk error surfaces a clear stop
        # instead of a raw .NET exception collapsing the documented exit codes.
        try {
            $joined = [System.IO.File]::ReadAllText($InputPath, [System.Text.UTF8Encoding]::new($false))
        } catch {
            Write-Stderr -Message "Failed to read input JSON from '$InputPath': $($_.Exception.Message)" -ExitCode 1
        }
    } else {
        $joined = $inputLines -join "`n"
    }
    if (-not $joined) {
        Write-Stderr -Message "No JSON input received (expected from stdin, -InputJson, or -InputPath)" -ExitCode 1
    }

    try {
        $data = $joined | ConvertFrom-Json -Depth 100
    } catch {
        Write-Stderr -Message "Failed to parse input JSON: $_" -ExitCode 1
    }

    # Validate critical schema fields before use. Malformed input shouldn't
    # produce a cryptic .Substring() / property-access error; report clearly
    # which field is wrong. (Get-SafeProp duplicated from Classify-Comments.ps1
    # to keep this script independently runnable.)
    function Get-SafeProp {
        [CmdletBinding()]
        [OutputType([object])]
        param($Object, [Parameter(Mandatory = $true)] [string]$Name, $Default = '')
        if ($Object -and $Object.PSObject.Properties[$Name]) {
            $value = $Object.PSObject.Properties[$Name].Value
            if ($null -ne $value) { return $value }
        }
        return $Default
    }

    $targetCommit = (Get-SafeProp -Object $data -Name 'targetCommit').ToString()
    if ([string]::IsNullOrWhiteSpace($targetCommit) -or $targetCommit.Length -lt 7) {
        Write-Stderr -Message "Schema validation failed: 'targetCommit' missing or shorter than 7 chars (got '$targetCommit')" -ExitCode 1
    }

    $prNumber = Get-SafeProp -Object $data -Name 'prNumber' -Default $null
    if ($null -eq $prNumber) {
        Write-Stderr -Message "Schema validation failed: 'prNumber' missing from input JSON" -ExitCode 1
    }

    $extensionMeta = Get-SafeProp -Object $data -Name 'extensionMeta' -Default $null
    if ($null -eq $extensionMeta) {
        Write-Stderr -Message "Schema validation failed: 'extensionMeta' missing from input JSON" -ExitCode 1
    }

    $commentsRaw = Get-SafeProp -Object $data -Name 'comments' -Default $null
    if ($null -eq $commentsRaw) {
        Write-Stderr -Message "Schema validation failed: 'comments' missing from input JSON" -ExitCode 1
    }

    $counts = Get-SafeProp -Object $data -Name 'counts' -Default $null
    if ($null -eq $counts) {
        Write-Stderr -Message "Schema validation failed: 'counts' missing from input JSON" -ExitCode 1
    }

    # Write raw JSON to OutputPath (ensure parent dir exists). Guard the write so
    # an I/O failure (permission / lock / disk full) hits the standardized
    # Write-Stderr stop path instead of a raw terminating error — matching the
    # intermediate bridge writes. Encoding is explicit utf8NoBOM by design.
    $outputDir = Split-Path $OutputPath -Parent
    if ($outputDir -and -not (Test-Path $outputDir)) {
        try {
            New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
        } catch {
            Write-Stderr -Message "Failed to create output directory '$outputDir': $($_.Exception.Message)" -ExitCode 1
        }
    }
    try {
        $joined | Set-Content -Path $OutputPath -Encoding utf8NoBOM
    } catch {
        Write-Stderr -Message "Failed to write harvest JSON to '$OutputPath': $($_.Exception.Message)" -ExitCode 1
    }

    # Build markdown summary
    $sb = [System.Text.StringBuilder]::new()
    $shortSha = $targetCommit.Substring(0, 7)

    [void]$sb.AppendLine("# Harvest report - PR #$prNumber commit $shortSha")
    [void]$sb.AppendLine()

    # Sanity
    [void]$sb.AppendLine("## Sanity")
    [void]$sb.AppendLine("- Commit: $targetCommit")
    [void]$sb.AppendLine("- PR: #$prNumber")
    [void]$sb.AppendLine("- Extension review: $($extensionMeta.title) (status=$($extensionMeta.status))")
    [void]$sb.AppendLine("- Review window: $($extensionMeta.startedAt) -> $($extensionMeta.endedAt)")
    # Surface-state flags (SMA-54 M2/M5). Get-SafeProp keeps older harvest JSONs
    # (pre-these-fields) rendering cleanly with sensible defaults.
    $extensionFound = Get-SafeProp -Object $data -Name 'extensionFound' -Default $null
    if ($null -ne $extensionFound) {
        [void]$sb.AppendLine("- Extension entry located: $extensionFound")
    }
    if (Get-SafeProp -Object $data -Name 'reviewSkipped' -Default $false) {
        [void]$sb.AppendLine("- [!] CodeRabbit review SKIPPED (path filters) - legitimate skip, nothing to harvest from the Extension.")
    }
    if (Get-SafeProp -Object $data -Name 'githubPartialData' -Default $false) {
        $fetchStatus = Get-SafeProp -Object $data -Name 'githubSurfaceFetchStatus' -Default $null
        $failedNames = if ($fetchStatus) {
            @($fetchStatus.PSObject.Properties | Where-Object { $_.Value -ne 'ok' } | ForEach-Object { $_.Name })
        } else { @() }
        if ($failedNames.Count -gt 0) {
            [void]$sb.AppendLine("- [!] PARTIAL HARVEST - GitHub surface(s) failed to fetch: $($failedNames -join ', '). Findings below may be INCOMPLETE (this is a degraded fetch, not a clean 'no comments').")
        } else {
            # partialData flagged but no surface marked failed: data inconsistency
            # (should be impossible - both fields derive from the same status map).
            # Report the anomaly explicitly rather than printing "failed to fetch: ".
            [void]$sb.AppendLine("- [!] PARTIAL HARVEST flagged but no failed surface recorded - data inconsistency in githubSurfaceFetchStatus; treat findings as possibly INCOMPLETE.")
        }
    }
    $marker = Get-SafeProp -Object $data -Name 'actionableMarker' -Default $null
    if ($null -ne $marker) {
        [void]$sb.AppendLine("- Marker: ""Actionable comments posted: $marker""")
    }
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

    # Cross-source surfaces - the skill does NOT deduplicate Extension vs GitHub
    # (no reliable deterministic key - see classification-rules.md). Counts are
    # reported per-source; the same finding may appear in both.
    # @(...) forces an array so .Count is valid even for 0 matches.
    # Per-surface counts (SMA-54 M5 - GitHub now has three distinct sub-sources).
    $extensionCount = @($commentsRaw | Where-Object source -eq 'extension').Count
    $ghInlineCount = @($commentsRaw | Where-Object source -eq 'github-inline').Count
    $ghReviewCount = @($commentsRaw | Where-Object source -eq 'github-review').Count
    $ghWalkCount = @($commentsRaw | Where-Object source -eq 'github-walkthrough').Count
    [void]$sb.AppendLine("## Cross-source surfaces")
    [void]$sb.AppendLine("- Extension: $extensionCount comment(s)")
    [void]$sb.AppendLine("- GitHub inline: $ghInlineCount comment(s)")
    [void]$sb.AppendLine("- GitHub review body: $ghReviewCount comment(s)")
    [void]$sb.AppendLine("- GitHub walkthrough: $ghWalkCount comment(s)")
    [void]$sb.AppendLine("- Surfaces are NOT deduplicated against each other; the same finding may appear on more than one (see references/classification-rules.md). Counts are per-surface.")
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
            [void]$sb.AppendLine("### $loc - $($c.classification)")
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
        [void]$sb.AppendLine("None - all comments classified as LGTM no-ops.")
        [void]$sb.AppendLine()
    }

    # Resolved section (only in comparison mode)
    if ($data.comparisonMode -and $counts.resolved -gt 0) {
        [void]$sb.AppendLine("## Resolved comments (vs previous harvest)")
        [void]$sb.AppendLine()
        foreach ($r in $data.resolved) {
            $loc = if ($r.path) { "$($r.path):$($r.startLine)" } else { '(no path)' }
            $title = if ($r.title) { $r.title } else { '(no title)' }
            [void]$sb.AppendLine("- $loc - $title")
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
