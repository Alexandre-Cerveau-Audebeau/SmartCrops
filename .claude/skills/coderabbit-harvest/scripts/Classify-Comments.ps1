#requires -Version 7.0

<#
.SYNOPSIS
    Classify CodeRabbit review comments into LGTM / NITPICK / MAJOR / REVIEW_NEEDED buckets.

.DESCRIPTION
    Reads CodeRabbit comments from the VS Code Extension JSON workspace storage and from
    the GitHub API in parallel. Applies rule-based classification (see
    references/classification-rules.md). Comments that don't match any deterministic rule
    are flagged REVIEW_NEEDED — Claude Code finishes the classification in conversational
    context, where the LLM's judgment is the right tool for ambiguous cases.

    Output is a JSON object on stdout, intended for piping into Write-Report.ps1.

.PARAMETER ReviewsFile
    Path to the Extension JSON workspace storage file.

.PARAMETER GitHubPrNumber
    PR number to fetch from GitHub via gh CLI.

.PARAMETER CommitSha
    Target commit SHA. Filters which Extension review object to read.

.PARAMETER PreviousJsonPath
    Optional path to a previous harvest's JSON output. If provided, enables comparison
    mode: each comment is tagged with a transition label (NEW/PERSISTED/MODIFIED/RESOLVED).

.PARAMETER Help
    Print the parent SKILL.md content and exit.

.EXAMPLE
    .\Classify-Comments.ps1 -ReviewsFile "C:\...\<sha>.json" -GitHubPrNumber 45 -CommitSha 3a8968d394cf2e1fbcd7f791aea63f2278b8a1a7

.EXAMPLE
    .\Classify-Comments.ps1 -Help

.NOTES
    PowerShell 7+ required (null-coalescing, ternary).
    Windows-only by design — see ADR rationale and .coderabbit.yaml path_instructions.
    Exit codes: 0 = OK, 1 = invalid input, 2 = data not found, 3 = parse/API error.
#>

[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Run')]
    [string]$ReviewsFile,

    [Parameter(Mandatory = $true, ParameterSetName = 'Run')]
    [int]$GitHubPrNumber,

    [Parameter(Mandatory = $true, ParameterSetName = 'Run')]
    [string]$CommitSha,

    [Parameter(Mandatory = $false, ParameterSetName = 'Run')]
    [string]$PreviousJsonPath,

    [Parameter(Mandatory = $false, ParameterSetName = 'Run')]
    [switch]$NoOutput,

    [Parameter(Mandatory = $true, ParameterSetName = 'Help')]
    [switch]$Help
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# Help mode — print parent SKILL.md and exit
# ---------------------------------------------------------------------------

if ($Help) {
    $skillMdPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'SKILL.md'
    if (Test-Path $skillMdPath) {
        Get-Content $skillMdPath -Raw
    } else {
        Write-Error "SKILL.md not found at: $skillMdPath"
        exit 2
    }
    exit 0
}

# ---------------------------------------------------------------------------
# Classification rule definitions
# ---------------------------------------------------------------------------

$Script:LgtmExactMatches = @(
    'LGTM!'
    'LGTM'
    'Looks good!'
    'Looks good to me!'
    'No issues found.'
    'Approved.'
)

$Script:LgtmStartingPrefixes = @(
    'Excellent'
    'Great'
    'Nice'
    'Well done'
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Test-IsLgtmBody {
    [CmdletBinding()]
    param([string]$Body)

    if ([string]::IsNullOrWhiteSpace($Body)) { return $false }

    $normalized = $Body.Trim()

    foreach ($exact in $Script:LgtmExactMatches) {
        if ($normalized -ieq $exact) { return $true }
    }

    if ($normalized.Length -le 200) {
        foreach ($prefix in $Script:LgtmStartingPrefixes) {
            if ($normalized.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                return $true
            }
        }
    }

    return $false
}

function Get-CommentClassification {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)] [PSCustomObject]$Comment)

    $type = ($Comment.PSObject.Properties['type'] ? ($Comment.type ?? '') : '').ToString()
    $severity = ($Comment.PSObject.Properties['severity'] ? ($Comment.severity ?? '') : '').ToString().ToLowerInvariant()
    $body = ($Comment.PSObject.Properties['comment'] ? ($Comment.comment ?? '') : '').ToString()
    $analysisType = if ($Comment.PSObject.Properties['analysis'] -and $Comment.analysis) {
        ($Comment.analysis.PSObject.Properties['type'] ? ($Comment.analysis.type ?? '') : '').ToString()
    } else { '' }

    # Rule 1: CodeRabbit self-invalidation
    if ($analysisType -in @('incorrect_review_comment', 'off_topic', 'invalid')) {
        return 'LGTM'
    }

    # Rule 2: LGTM/compliment body
    if (Test-IsLgtmBody -Body $body) { return 'LGTM' }

    # Rules 3-5: actionable
    if ($type -eq 'actionable') {
        switch ($severity) {
            'major' { return 'MAJOR' }
            'critical' { return 'MAJOR' }
            'minor' { return 'NITPICK' }
            'nitpick' { return 'NITPICK' }
            'low' { return 'NITPICK' }
            default { return 'REVIEW_NEEDED' }
        }
    }

    # Rules 6-7: assertive
    if ($type -eq 'assertive') {
        switch ($severity) {
            'major' { return 'MAJOR' }
            'critical' { return 'MAJOR' }
            { $_ -in @('', 'none', 'low', 'minor') } { return 'NITPICK' }
            default { return 'REVIEW_NEEDED' }
        }
    }

    # Rule 8: additional comments (CodeRabbit's compliments / observations)
    # — LGTM no-op when severity is benign, otherwise needs review.
    if ($type -eq 'additional') {
        switch ($severity) {
            'major' { return 'MAJOR' }
            'critical' { return 'MAJOR' }
            { $_ -in @('', 'none', 'low', 'minor') } { return 'LGTM' }
            default { return 'REVIEW_NEEDED' }
        }
    }

    # Rules 9-10
    if ($type -eq 'outsideDiffRange') { return 'REVIEW_NEEDED' }
    if ($type -eq 'duplicate') { return 'LGTM' }

    # Rule 11: catch-all
    return 'REVIEW_NEEDED'
}

function Get-SafeProp {
    [CmdletBinding()]
    param(
        $Object,
        [Parameter(Mandatory = $true)] [string]$Name,
        $Default = ''
    )

    # Strict-mode-safe property access: returns $Default when the property is
    # absent or null, rather than throwing under Set-StrictMode -Version Latest.
    # CodeRabbit comment objects are not uniformly shaped — not every comment
    # carries every field — so direct `$obj.prop` access is unsafe here.
    if ($Object -and $Object.PSObject.Properties[$Name]) {
        $value = $Object.PSObject.Properties[$Name].Value
        if ($null -ne $value) { return $value }
    }
    return $Default
}

function ConvertTo-NormalizedComment {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [PSCustomObject]$RawComment,
        [Parameter(Mandatory = $true)] [ValidateSet('extension', 'github')] [string]$Source
    )

    $normalized = [PSCustomObject]@{
        id                   = $null
        source               = $Source
        type                 = ''
        severity             = ''
        path                 = ''
        startLine            = 0
        endLine              = 0
        title                = ''
        body                 = ''
        analysisType         = ''
        codegenInstructions  = ''
    }

    if ($Source -eq 'extension') {
        # Extension comment objects key the file path as 'filename' (not 'path'),
        # and not every comment carries every field — access defensively.
        $normalized.id        = Get-SafeProp -Object $RawComment -Name 'id' -Default $null
        $normalized.type      = (Get-SafeProp -Object $RawComment -Name 'type').ToString()
        $normalized.severity  = (Get-SafeProp -Object $RawComment -Name 'severity').ToString()
        $normalized.path      = (Get-SafeProp -Object $RawComment -Name 'filename' -Default (Get-SafeProp -Object $RawComment -Name 'path')).ToString()
        $normalized.startLine = [int](Get-SafeProp -Object $RawComment -Name 'startLine' -Default 0)
        $normalized.endLine   = [int](Get-SafeProp -Object $RawComment -Name 'endLine' -Default 0)
        $normalized.title     = (Get-SafeProp -Object $RawComment -Name 'title').ToString()
        $normalized.body      = (Get-SafeProp -Object $RawComment -Name 'comment').ToString()
        $analysis = Get-SafeProp -Object $RawComment -Name 'analysis' -Default $null
        $normalized.analysisType = if ($analysis) {
            (Get-SafeProp -Object $analysis -Name 'type').ToString()
        } else { '' }
        $normalized.codegenInstructions = (Get-SafeProp -Object $RawComment -Name 'codegenInstructions').ToString()
    }
    else {
        $normalized.id        = Get-SafeProp -Object $RawComment -Name 'id' -Default $null
        $normalized.path      = (Get-SafeProp -Object $RawComment -Name 'path').ToString()
        $startLine = Get-SafeProp -Object $RawComment -Name 'start_line' -Default $null
        if ($null -eq $startLine) { $startLine = Get-SafeProp -Object $RawComment -Name 'line' -Default 0 }
        $normalized.startLine = [int]$startLine
        $normalized.endLine   = [int](Get-SafeProp -Object $RawComment -Name 'line' -Default 0)
        $normalized.body      = (Get-SafeProp -Object $RawComment -Name 'body').ToString()
        $normalized.type      = 'actionable'  # GitHub doesn't expose CR internal type
        $normalized.severity  = ''            # unknown → flows to REVIEW_NEEDED
    }

    return $normalized
}

function Get-TransitionLabel {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [PSCustomObject]$CurrentComment,
        [Parameter(Mandatory = $true)] [object[]]$PreviousComments
    )

    # Match by id first
    $byId = $PreviousComments | Where-Object { $_.id -and $CurrentComment.id -and $_.id -eq $CurrentComment.id } | Select-Object -First 1
    if ($byId) {
        if ($byId.body -eq $CurrentComment.body) { return 'PERSISTED' }
        return 'MODIFIED'
    }

    # Fallback: match by path + startLine + endLine
    $byLocation = $PreviousComments | Where-Object {
        $_.path -eq $CurrentComment.path -and
        $_.startLine -eq $CurrentComment.startLine -and
        $_.endLine -eq $CurrentComment.endLine
    } | Select-Object -First 1
    if ($byLocation) {
        if ($byLocation.body -eq $CurrentComment.body) { return 'PERSISTED' }
        return 'MODIFIED'
    }

    return 'NEW'
}

# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------

# Step 1: read Extension JSON
if (-not (Test-Path $ReviewsFile)) {
    Write-Error "Extension reviews JSON not found at: $ReviewsFile"
    exit 2
}

# Step 1b: freshness check — the Extension JSON should be recently written
# (post-push, post-CodeRabbit-review). If it's stale, we're likely reading
# a previous harvest's data, not the current one. Per SKILL.md, STOP and
# report rather than silently producing stale output.
$fileAge = (Get-Date) - (Get-Item $ReviewsFile).LastWriteTime
$freshnessLimitMinutes = 5
if ($fileAge.TotalMinutes -gt $freshnessLimitMinutes) {
    # Build the format string fully before applying -f: the format operator
    # binds tighter than +, so "a" + "b" -f x would format only "b".
    $staleMsg = "Extension reviews JSON is stale: last written {0:F1} min ago (limit: {1} min). " +
        "Re-trigger the CodeRabbit Extension review, or pass --commit explicitly to harvest a known commit."
    Write-Error ($staleMsg -f $fileAge.TotalMinutes, $freshnessLimitMinutes)
    exit 2
}

$json = Get-Content $ReviewsFile -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 100
$review = $json | Where-Object { $_.headCommitId -like "$CommitSha*" } | Select-Object -Last 1

if (-not $review) {
    Write-Error "No Extension review object found for commit prefix: $CommitSha"
    exit 2
}

# Step 2: collect Extension comments
$extensionComments = [System.Collections.Generic.List[PSCustomObject]]::new()
$ad = $review.additionalDetails

foreach ($cat in @('actionableComments', 'assertiveComments', 'additionalComments', 'outsideDiffRangeComments', 'duplicateComments')) {
    $catVal = $ad.PSObject.Properties[$cat]
    if (-not $catVal -or -not $catVal.Value) { continue }

    $items = $catVal.Value
    if ($items -is [System.Array]) {
        foreach ($c in $items) { $extensionComments.Add($c) | Out-Null }
    } else {
        foreach ($p in $items.PSObject.Properties) {
            foreach ($c in $p.Value) { $extensionComments.Add($c) | Out-Null }
        }
    }
}

if ($review.PSObject.Properties['fileReviewMap'] -and $review.fileReviewMap) {
    foreach ($p in $review.fileReviewMap.PSObject.Properties) {
        $fileComments = Get-SafeProp -Object $p.Value -Name 'comments' -Default @()
        foreach ($c in $fileComments) { $extensionComments.Add($c) | Out-Null }
    }
}

# Step 3: fetch GitHub comments
$ghCommentsRaw = gh api "repos/{owner}/{repo}/pulls/$GitHubPrNumber/comments" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to fetch GitHub comments for PR #$GitHubPrNumber"
    exit 3
}

$ghComments = ($ghCommentsRaw | ConvertFrom-Json -Depth 100) | Where-Object {
    $_.user.login -in @('coderabbitai', 'coderabbitai[bot]')
}

# Step 4: load previous harvest if --PreviousJsonPath
$previousComments = @()
if ($PreviousJsonPath) {
    if (-not (Test-Path $PreviousJsonPath)) {
        Write-Error "Previous harvest JSON not found: $PreviousJsonPath"
        exit 2
    }
    $previousJson = Get-Content $PreviousJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 100
    $previousComments = $previousJson.comments
}

# Step 5: normalize, classify, optionally tag transition
$classified = [System.Collections.Generic.List[PSCustomObject]]::new()

foreach ($raw in $extensionComments) {
    $norm = ConvertTo-NormalizedComment -RawComment $raw -Source 'extension'
    $cls = Get-CommentClassification -Comment $raw
    Add-Member -InputObject $norm -NotePropertyName classification -NotePropertyValue $cls -Force
    if ($PreviousJsonPath) {
        $transition = Get-TransitionLabel -CurrentComment $norm -PreviousComments $previousComments
        Add-Member -InputObject $norm -NotePropertyName transition -NotePropertyValue $transition -Force
    }
    $classified.Add($norm) | Out-Null
}

foreach ($raw in $ghComments) {
    $norm = ConvertTo-NormalizedComment -RawComment $raw -Source 'github'
    $cls = if (Test-IsLgtmBody -Body $norm.body) { 'LGTM' } else { 'REVIEW_NEEDED' }
    Add-Member -InputObject $norm -NotePropertyName classification -NotePropertyValue $cls -Force
    if ($PreviousJsonPath) {
        $transition = Get-TransitionLabel -CurrentComment $norm -PreviousComments $previousComments
        Add-Member -InputObject $norm -NotePropertyName transition -NotePropertyValue $transition -Force
    }
    $classified.Add($norm) | Out-Null
}

# Note: Extension and GitHub comments are intentionally NOT deduplicated.
# The two sources render the same finding with different bodies, titles, and
# line anchors, and share no reliable deterministic key — see
# references/classification-rules.md ("Cross-source handling"). Each source is
# classified independently; the same logical finding may appear once per source.

# Step 6: detect RESOLVED (in previous but not in current)
$resolvedComments = [System.Collections.Generic.List[PSCustomObject]]::new()
if ($PreviousJsonPath) {
    $currentIds = $classified | ForEach-Object { $_.id }
    $currentLocations = $classified | ForEach-Object { "$($_.path):$($_.startLine):$($_.endLine)" }
    foreach ($prev in $previousComments) {
        $matched = $false
        if ($prev.id -and $prev.id -in $currentIds) { $matched = $true }
        elseif ("$($prev.path):$($prev.startLine):$($prev.endLine)" -in $currentLocations) { $matched = $true }
        if (-not $matched) {
            $resolved = $prev.PSObject.Copy()
            Add-Member -InputObject $resolved -NotePropertyName transition -NotePropertyValue 'RESOLVED' -Force
            $resolvedComments.Add($resolved) | Out-Null
        }
    }
}

# Step 7: emit
if (-not $NoOutput) {
    $output = [PSCustomObject]@{
        targetCommit  = $CommitSha
        prNumber      = $GitHubPrNumber
        extensionMeta = @{
            startedAt = Get-SafeProp -Object $review -Name 'startedAt' -Default ''
            endedAt   = Get-SafeProp -Object $review -Name 'endedAt' -Default ''
            status    = Get-SafeProp -Object $review -Name 'status' -Default ''
            title     = Get-SafeProp -Object $review -Name 'title' -Default ''
            poem      = Get-SafeProp -Object $review -Name 'poem' -Default ''
        }
        comments      = $classified.ToArray()
        resolved      = $resolvedComments.ToArray()
        counts        = @{
            # @(...) forces an array so .Count is valid even for 0 matches
            # (a bare null pipeline result has no .Count under strict mode).
            LGTM           = @($classified | Where-Object classification -eq 'LGTM').Count
            NITPICK        = @($classified | Where-Object classification -eq 'NITPICK').Count
            MAJOR          = @($classified | Where-Object classification -eq 'MAJOR').Count
            REVIEW_NEEDED  = @($classified | Where-Object classification -eq 'REVIEW_NEEDED').Count
            total          = $classified.Count
            resolved       = $resolvedComments.Count
        }
        comparisonMode = [bool]$PreviousJsonPath
    }

    $output | ConvertTo-Json -Depth 20
}

exit 0
