#requires -Version 7.0

<#
.SYNOPSIS
    Classify CodeRabbit review comments into LGTM / NITPICK / MAJOR / REVIEW_NEEDED buckets.

.DESCRIPTION
    Reads CodeRabbit comments from the VS Code Extension JSON workspace storage and from
    the GitHub API in parallel. Applies rule-based classification (see
    references/classification-rules.md). Comments that don't match any deterministic rule
    are flagged REVIEW_NEEDED - Claude Code finishes the classification in conversational
    context, where the LLM's judgment is the right tool for ambiguous cases.

    Output is a JSON object on stdout, intended for piping into Write-Report.ps1.

.PARAMETER ReviewEntryPath
    Optional path to a file holding the located Extension review entry (JSON),
    as written from Locate-Review.ps1's stdout. Omit (or pass a missing/empty
    path) to harvest the GitHub surfaces alone when no completed Extension review
    exists for the commit (unreviewed or legitimately skipped - SMA-54 M2).

.PARAMETER GitHubPrNumber
    PR number to fetch from GitHub via gh CLI.

.PARAMETER CommitSha
    Target commit SHA, recorded in the output (the Extension entry is already
    selected by Locate-Review.ps1; this no longer drives Extension file reading).

.PARAMETER PreviousJsonPath
    Optional path to a previous harvest's JSON output. If provided, enables comparison
    mode: each comment is tagged with a transition label (NEW/PERSISTED/MODIFIED/RESOLVED).

.PARAMETER Help
    Print the parent SKILL.md content and exit.

.EXAMPLE
    .\Classify-Comments.ps1 -ReviewEntryPath "/tmp/cr-entry-3a89683.json" -GitHubPrNumber 45 -CommitSha 3a8968d394cf2e1fbcd7f791aea63f2278b8a1a7

.EXAMPLE
    .\Classify-Comments.ps1 -Help

.NOTES
    PowerShell 7+ required (null-coalescing, ternary).
    Windows-only by design - see ADR rationale and .coderabbit.yaml path_instructions.
    Exit codes: 0 = OK, 1 = invalid input, 2 = data not found, 3 = parse/API error.
    Error reporting: error paths use the Write-Stderr helper, not Write-Error.
    Necessary because $ErrorActionPreference='Stop' makes Write-Error terminating,
    which would short-circuit before any explicit `exit N` line could run and
    collapse the documented exit codes to a uniform 1. See issue #50.
#>

[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
    # Path to a file holding the located Extension review entry (JSON), as
    # written from Locate-Review.ps1's stdout. OPTIONAL: when Locate finds no
    # completed entry (commit unreviewed or legitimately skipped - SMA-54 M2),
    # the caller passes nothing (or a missing/empty path) and we harvest the
    # GitHub surfaces alone. File-based (not an inline string) so SKILL.md's
    # string-pipeline doesn't have to embed a multi-KB JSON blob. Replaces the
    # old -ReviewsFile + in-script headCommitId/mtime selection (M1/M3/M4 now
    # live in Locate-Review.ps1).
    [Parameter(Mandatory = $false, ParameterSetName = 'Run')]
    [string]$ReviewEntryPath,

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
# Error reporting helper - see issue #50
# ---------------------------------------------------------------------------

function Write-Stderr {
    <#
    .SYNOPSIS
    Write a message to stderr and exit with a specific code.

    .DESCRIPTION
    Workaround for $ErrorActionPreference='Stop' making Write-Error terminating
    (which short-circuits before any explicit `exit N` line is reached). Uses
    [Console]::Error.WriteLine - writes to stderr without raising a terminating
    error, so the documented exit codes (0/1/2/3) are actually reachable.
    See issue #50 for the original analysis.

    .PARAMETER Message
    The error message to write to stderr.

    .PARAMETER ExitCode
    The exit code: 1 = invalid input, 2 = data not found, 3 = parse/API error.
    #>
    [CmdletBinding()]
    [OutputType([void])]
    param(
        [Parameter(Mandatory = $true)] [string]$Message,
        [Parameter(Mandatory = $true)] [int]$ExitCode
    )
    [Console]::Error.WriteLine($Message)
    exit $ExitCode
}

# ---------------------------------------------------------------------------
# Help mode - print parent SKILL.md and exit
# ---------------------------------------------------------------------------

if ($Help) {
    $skillMdPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'SKILL.md'
    if (Test-Path $skillMdPath) {
        Get-Content $skillMdPath -Raw
    } else {
        Write-Stderr -Message "SKILL.md not found at: $skillMdPath" -ExitCode 2
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

function Test-IsExactLgtmBody {
    [CmdletBinding()]
    [OutputType([bool])]
    param([string]$Body)

    # Rule 2a - body (trimmed) exactly matches an unambiguous LGTM marker.
    # Safe to consult before the type-driven rules: these strings are pure
    # LGTM by construction, with no risk of masking an actionable finding.
    if ([string]::IsNullOrWhiteSpace($Body)) { return $false }

    $normalized = $Body.Trim()
    foreach ($exact in $Script:LgtmExactMatches) {
        if ($normalized -ieq $exact) { return $true }
    }
    return $false
}

function Test-IsComplimentPrefixBody {
    [CmdletBinding()]
    [OutputType([bool])]
    param([string]$Body)

    # Rule 10a - short body opening with a complimentary word (Excellent/Great/
    # Nice/Well done), capped at 200 chars. This is a weaker heuristic than the
    # exact-match list, so Get-CommentClassification consults it only AFTER the
    # type/severity rules - a major actionable finding that happens to start
    # with "Excellent" must not be silently downgraded to LGTM.
    if ([string]::IsNullOrWhiteSpace($Body)) { return $false }

    $normalized = $Body.Trim()
    if ($normalized.Length -gt 200) { return $false }

    foreach ($prefix in $Script:LgtmStartingPrefixes) {
        if ($normalized.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }
    return $false
}

function Get-CommentClassification {
    [CmdletBinding()]
    [OutputType([string])]
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

    # Rule 2a: body exactly matches an unambiguous LGTM marker. Safe at the top
    # of the chain - these are pure LGTM by construction.
    if (Test-IsExactLgtmBody -Body $body) { return 'LGTM' }

    # Rules 3-5: actionable
    if ($type -eq 'actionable') {
        switch ($severity) {
            'major' { return 'MAJOR' }
            'critical' { return 'MAJOR' }
            'minor' { return 'NITPICK' }
            'nitpick' { return 'NITPICK' }
            'low' { return 'NITPICK' }
            'trivial' { return 'NITPICK' }
            default { return 'REVIEW_NEEDED' }
        }
    }

    # Rules 6-7: assertive
    if ($type -eq 'assertive') {
        switch ($severity) {
            'major' { return 'MAJOR' }
            'critical' { return 'MAJOR' }
            { $_ -in @('', 'none', 'low', 'minor', 'nitpick', 'trivial') } { return 'NITPICK' }
            default { return 'REVIEW_NEEDED' }
        }
    }

    # Rule 8: additional comments (CodeRabbit's compliments / observations)
    # - LGTM no-op when severity is benign, otherwise needs review.
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

    # Rule 10a: compliment-prefix LGTM (Excellent/Great/Nice/Well done, <=200 chars).
    # Deliberately AFTER the type-driven rules so a major/critical actionable
    # comment that happens to start with a complimentary word is not silently
    # downgraded to LGTM.
    if (Test-IsComplimentPrefixBody -Body $body) { return 'LGTM' }

    # Rule 11: catch-all
    return 'REVIEW_NEEDED'
}

function Get-SafeProp {
    [CmdletBinding()]
    [OutputType([object])]
    param(
        $Object,
        [Parameter(Mandatory = $true)] [string]$Name,
        $Default = ''
    )

    # Strict-mode-safe property access: returns $Default when the property is
    # absent or null, rather than throwing under Set-StrictMode -Version Latest.
    # CodeRabbit comment objects are not uniformly shaped - not every comment
    # carries every field - so direct `$obj.prop` access is unsafe here.
    if ($Object -and $Object.PSObject.Properties[$Name]) {
        $value = $Object.PSObject.Properties[$Name].Value
        if ($null -ne $value) { return $value }
    }
    return $Default
}

function ConvertTo-NormalizedComment {
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter(Mandatory = $true)] [PSCustomObject]$RawComment,
        # Sub-source granularity (SMA-54 M5): the GitHub side has three distinct
        # surfaces that previously collapsed to one. 'github-inline' = line-anchored
        # PR review comments (pulls/{n}/comments); 'github-review' = the review
        # body that GROUPS nitpicks + the "Actionable comments posted: N" marker
        # (pulls/{n}/reviews[].body - the surface the old skill never read, where
        # PR #95's only nitpick lived); 'github-walkthrough' = the issue-comment
        # summary / "Review skipped" notice (issues/{n}/comments).
        [Parameter(Mandatory = $true)] [ValidateSet('extension', 'github-inline', 'github-review', 'github-walkthrough')] [string]$Source
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
        # and not every comment carries every field - access defensively.
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
    elseif ($Source -eq 'github-inline') {
        $normalized.id        = Get-SafeProp -Object $RawComment -Name 'id' -Default $null
        $normalized.path      = (Get-SafeProp -Object $RawComment -Name 'path').ToString()
        $startLine = Get-SafeProp -Object $RawComment -Name 'start_line' -Default $null
        if ($null -eq $startLine) { $startLine = Get-SafeProp -Object $RawComment -Name 'line' -Default 0 }
        $normalized.startLine = [int]$startLine
        $normalized.endLine   = [int](Get-SafeProp -Object $RawComment -Name 'line' -Default 0)
        $normalized.body      = (Get-SafeProp -Object $RawComment -Name 'body').ToString()
        $normalized.type      = 'actionable'  # GitHub doesn't expose CR internal type
        $normalized.severity  = ''            # unknown -> flows to REVIEW_NEEDED
    }
    else {
        # github-review and github-walkthrough are prose blocks, not line-anchored.
        # Carry the whole body; classification falls to the body heuristics
        # (exact-LGTM / compliment-prefix -> LGTM, else REVIEW_NEEDED) so a grouped
        # nitpick body surfaces as REVIEW_NEEDED for a human read instead of being
        # silently dropped. 'title' records which surface for the report.
        $normalized.id        = Get-SafeProp -Object $RawComment -Name 'id' -Default $null
        $normalized.body      = (Get-SafeProp -Object $RawComment -Name 'body').ToString()
        $normalized.title     = if ($Source -eq 'github-review') { 'CodeRabbit review body' } else { 'CodeRabbit walkthrough' }
        $normalized.type      = ''
        $normalized.severity  = ''
    }

    return $normalized
}

function Get-TransitionLabel {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)] [PSCustomObject]$CurrentComment,
        [Parameter(Mandatory = $true)] [object[]]$PreviousComments
    )

    # Match by id first (most reliable)
    $byId = $PreviousComments | Where-Object {
        $_.id -and $CurrentComment.id -and $_.id -eq $CurrentComment.id
    } | Select-Object -First 1
    if ($byId) {
        if ($byId.body -eq $CurrentComment.body) { return 'PERSISTED' }
        return 'MODIFIED'
    }

    # Fallback: match by source + path + startLine + endLine.
    # Restricting to the same source avoids cross-source false matches - the
    # same finding may appear on both Extension and GitHub with very different
    # rendered bodies, and must NOT be reported as MODIFIED across sources.
    $sameLocation = $PreviousComments | Where-Object {
        $_.source -eq $CurrentComment.source -and
        $_.path -eq $CurrentComment.path -and
        $_.startLine -eq $CurrentComment.startLine -and
        $_.endLine -eq $CurrentComment.endLine
    }

    # Prefer an exact body match among same-location, same-source candidates.
    $exactMatch = $sameLocation | Where-Object {
        $_.body -eq $CurrentComment.body
    } | Select-Object -First 1
    if ($exactMatch) { return 'PERSISTED' }

    if ($sameLocation) { return 'MODIFIED' }

    return 'NEW'
}

# ---------------------------------------------------------------------------
# Surface helpers (SMA-54 M5 / N1)
# ---------------------------------------------------------------------------

function Get-ExtensionFingerprint {
    # N1: a stable key to collapse the SAME Extension finding when it appears in
    # both additionalDetails.*Comments and fileReviewMap[].comments. Prefer the
    # CR-assigned id; fall back to path + line range + a body prefix.
    [CmdletBinding()]
    [OutputType([string])]
    param([Parameter(Mandatory = $true)] [PSCustomObject]$Comment)
    $id = (Get-SafeProp -Object $Comment -Name 'id' -Default '').ToString()
    if ($id) { return "id:$id" }
    $path = (Get-SafeProp -Object $Comment -Name 'filename' -Default (Get-SafeProp -Object $Comment -Name 'path')).ToString()
    $sl = (Get-SafeProp -Object $Comment -Name 'startLine' -Default 0).ToString()
    $el = (Get-SafeProp -Object $Comment -Name 'endLine' -Default 0).ToString()
    $body = (Get-SafeProp -Object $Comment -Name 'comment' -Default '').ToString()
    $prefix = if ($body.Length -gt 60) { $body.Substring(0, 60) } else { $body }
    return "loc:$path|$sl|$el|$prefix"
}

function Get-ActionableMarker {
    # Parse CodeRabbit's "Actionable comments posted: N" marker from a body.
    # Returns the integer N, or $null if the marker is absent. ABSENCE IS NOT
    # ZERO (SMA-54 M5): on a nitpicks-only review the marker can be missing while
    # the body still groups real nitpicks - the caller must read the body either way.
    [CmdletBinding()]
    [OutputType([object])]
    param([string]$Body)
    if ([string]::IsNullOrWhiteSpace($Body)) { return $null }
    $m = [regex]::Match($Body, 'Actionable comments posted:\s*(\d+)')
    if ($m.Success) { return [int]$m.Groups[1].Value }
    return $null
}

function Test-IsReviewSkipped {
    # Detect a legitimate CodeRabbit skip (e.g. csv-only PR excluded by path
    # filters) vs a locate/sync failure (SMA-54 M2).
    [CmdletBinding()]
    [OutputType([bool])]
    param([string]$Body)
    if ([string]::IsNullOrWhiteSpace($Body)) { return $false }
    return ($Body -match 'Review skipped' -or $Body -match 'path filters')
}

# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------

# Step 1: parse the located Extension review entry (from Locate-Review.ps1).
# OPTIONAL - when empty, the commit has no completed Extension review (unreviewed
# or legitimately skipped, SMA-54 M2); we proceed with the GitHub surfaces alone.
# The old in-script headCommitId selection (M3), 5-min mtime freshness gate (M4),
# and workspace-hash file resolution (M1) all moved to Locate-Review.ps1.
$review = $null
if (-not [string]::IsNullOrWhiteSpace($ReviewEntryPath) -and (Test-Path $ReviewEntryPath)) {
    $entryRaw = Get-Content $ReviewEntryPath -Raw -Encoding UTF8
    if (-not [string]::IsNullOrWhiteSpace($entryRaw)) {
        try {
            $review = $entryRaw | ConvertFrom-Json -Depth 100
        } catch {
            Write-Stderr -Message "Failed to parse review entry at ${ReviewEntryPath}: $($_.Exception.Message)" -ExitCode 3
        }
    }
}
$extensionFound = [bool]$review

# Step 2: collect Extension comments (only when an entry was located)
$extensionComments = [System.Collections.Generic.List[PSCustomObject]]::new()
if ($review) {
    $rawExtension = [System.Collections.Generic.List[PSCustomObject]]::new()
    # Read additionalDetails defensively - the review shape isn't guaranteed to
    # include it, and under strict mode a missing property throws on direct access.
    $ad = Get-SafeProp -Object $review -Name 'additionalDetails' -Default $null
    if ($ad) {
        foreach ($cat in @('actionableComments', 'assertiveComments', 'additionalComments', 'outsideDiffRangeComments', 'duplicateComments')) {
            $catVal = $ad.PSObject.Properties[$cat]
            if (-not $catVal -or -not $catVal.Value) { continue }
            $items = $catVal.Value
            if ($items -is [System.Array]) {
                foreach ($c in $items) { $rawExtension.Add($c) | Out-Null }
            } else {
                foreach ($p in $items.PSObject.Properties) {
                    foreach ($c in $p.Value) { $rawExtension.Add($c) | Out-Null }
                }
            }
        }
    }
    if ($review.PSObject.Properties['fileReviewMap'] -and $review.fileReviewMap) {
        foreach ($p in $review.fileReviewMap.PSObject.Properties) {
            $fileComments = Get-SafeProp -Object $p.Value -Name 'comments' -Default @()
            foreach ($c in $fileComments) { $rawExtension.Add($c) | Out-Null }
        }
    }
    # N1: dedup INTRA-Extension only. additionalDetails.*Comments and
    # fileReviewMap[].comments can carry the SAME finding twice. Cross-SURFACE
    # dedup (Extension vs GitHub) is intentionally NOT done - see
    # classification-rules.md "Cross-source handling". This collapses only the
    # within-Extension double count.
    $seenExt = [System.Collections.Generic.HashSet[string]]::new()
    foreach ($c in $rawExtension) {
        if ($seenExt.Add((Get-ExtensionFingerprint -Comment $c))) {
            $extensionComments.Add($c) | Out-Null
        }
    }
}

# Step 3: fetch GitHub surfaces (SMA-54 M5 - three distinct surfaces)
# Pre-check that the gh CLI is available. SKILL.md lists it as a requirement;
# if it's missing, fail cleanly via the documented exit 3 path rather than
# letting PowerShell raise an opaque native-command error.
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Stderr -Message "The 'gh' CLI is required but was not found on PATH. Install it via https://cli.github.com/ and authenticate with 'gh auth login'." -ExitCode 3
}

$crLogins = @('coderabbitai', 'coderabbitai[bot]')

# Helper: fetch + slurp + flatten a paginated gh api list endpoint. $Critical
# controls failure handling - the inline surface is primary (hard exit 3 on
# failure, preserving the documented contract); the review/walkthrough surfaces
# are additive (warn + continue so a transient there never sinks the harvest).
# Per-surface fetch status (SMA-54, CR PR #97): a non-critical surface that
# fails to fetch/parse returns @() and warns - but in the JSON output that would
# look identical to "this surface genuinely had no comments". Record the status
# here so a PARTIAL harvest is distinguishable from a complete one. Script scope
# so Get-GhList can flip an entry on failure (mutating the referenced hashtable).
$script:surfaceFetchStatus = [ordered]@{
    'github-inline'      = 'ok'
    'github-review'      = 'ok'
    'github-walkthrough' = 'ok'
}

function Get-GhList {
    [CmdletBinding()]
    [OutputType([object[]])]
    param([string]$Endpoint, [bool]$Critical, [string]$Surface)
    $raw = gh api $Endpoint --paginate --slurp 2>$null
    if ($LASTEXITCODE -ne 0) {
        if ($Critical) { Write-Stderr -Message "Failed to fetch GitHub data: $Endpoint" -ExitCode 3 }
        $script:surfaceFetchStatus[$Surface] = 'failed'
        [Console]::Error.WriteLine("WARN: failed to fetch $Endpoint (non-critical surface, continuing).")
        return @()
    }
    try { $pages = $raw | ConvertFrom-Json -Depth 100 } catch {
        if ($Critical) { Write-Stderr -Message "Failed to parse GitHub data: $Endpoint`n$($_.Exception.Message)" -ExitCode 3 }
        $script:surfaceFetchStatus[$Surface] = 'failed'
        [Console]::Error.WriteLine("WARN: failed to parse $Endpoint (non-critical surface, continuing).")
        return @()
    }
    # --slurp yields [[page1...],[page2...]]; flatten to a single list.
    return @($pages | ForEach-Object { $_ })
}

# Surface 1 - inline review comments (line-anchored). Primary/critical.
$ghInline = @(Get-GhList -Endpoint "repos/{owner}/{repo}/pulls/$GitHubPrNumber/comments" -Critical $true -Surface 'github-inline') |
    Where-Object { $_.user.login -in $crLogins }

# Surface 2 - review bodies (grouped nitpicks + "Actionable comments posted: N").
$ghReviewsAll = @(Get-GhList -Endpoint "repos/{owner}/{repo}/pulls/$GitHubPrNumber/reviews" -Critical $false -Surface 'github-review') |
    Where-Object { $_.user.login -in $crLogins }
# Keep only review bodies with substance (skip empty-body APPROVED/COMMENTED rows).
$ghReviews = @($ghReviewsAll | Where-Object { -not [string]::IsNullOrWhiteSpace((Get-SafeProp -Object $_ -Name 'body')) })

# Surface 3 - issue-comment walkthrough / skip notices.
$ghWalkthrough = @(Get-GhList -Endpoint "repos/{owner}/{repo}/issues/$GitHubPrNumber/comments" -Critical $false -Surface 'github-walkthrough') |
    Where-Object { $_.user.login -in $crLogins }

# Marker + skip detection across the review bodies and the walkthrough.
$actionableMarker = $null
$reviewSkipped = $false
foreach ($r in @($ghReviews) + @($ghWalkthrough)) {
    $b = (Get-SafeProp -Object $r -Name 'body').ToString()
    $mk = Get-ActionableMarker -Body $b
    if ($null -ne $mk) { $actionableMarker = $mk }
    if (Test-IsReviewSkipped -Body $b) { $reviewSkipped = $true }
}

# Step 4: load previous harvest if --PreviousJsonPath
$previousComments = @()
if ($PreviousJsonPath) {
    if (-not (Test-Path $PreviousJsonPath)) {
        Write-Stderr -Message "Previous harvest JSON not found: $PreviousJsonPath" -ExitCode 2
    }
    try {
        $previousJson = Get-Content $PreviousJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 100
    } catch {
        Write-Stderr -Message "Failed to parse previous harvest JSON at: $PreviousJsonPath`n$($_.Exception.Message)" -ExitCode 3
    }
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

# GitHub surfaces carry no CR type/severity, so body heuristics are the only
# signal. github-walkthrough is the summary/poem/skip-notice (informational ->
# LGTM; its marker + skip flag are captured in meta, not as a finding). Inline
# and review bodies classify LGTM only on an exact/compliment marker, otherwise
# REVIEW_NEEDED - so a GROUPED nitpick body (the surface the old skill never
# read, SMA-54 M5) surfaces for a human read instead of being dropped.
$githubSurfaces = @(
    @{ Source = 'github-inline';      Items = $ghInline },
    @{ Source = 'github-review';      Items = $ghReviews },
    @{ Source = 'github-walkthrough'; Items = $ghWalkthrough }
)
foreach ($surface in $githubSurfaces) {
    foreach ($raw in $surface.Items) {
        $norm = ConvertTo-NormalizedComment -RawComment $raw -Source $surface.Source
        $cls = if ($surface.Source -eq 'github-walkthrough') {
            'LGTM'
        } elseif ((Test-IsExactLgtmBody -Body $norm.body) -or (Test-IsComplimentPrefixBody -Body $norm.body)) {
            'LGTM'
        } else {
            'REVIEW_NEEDED'
        }
        Add-Member -InputObject $norm -NotePropertyName classification -NotePropertyValue $cls -Force
        if ($PreviousJsonPath) {
            $transition = Get-TransitionLabel -CurrentComment $norm -PreviousComments $previousComments
            Add-Member -InputObject $norm -NotePropertyName transition -NotePropertyValue $transition -Force
        }
        $classified.Add($norm) | Out-Null
    }
}

# Note: Extension and GitHub comments are intentionally NOT deduplicated across
# SURFACES. The same finding renders with different bodies/titles/anchors per
# surface and shares no reliable deterministic key - see
# references/classification-rules.md ("Cross-source handling"). Each surface is
# classified independently; the same logical finding may appear once per surface.
# (Intra-Extension double-counting IS collapsed earlier - SMA-54 N1.)

# Step 6: detect RESOLVED (in previous but not in current)
$resolvedComments = [System.Collections.Generic.List[PSCustomObject]]::new()
if ($PreviousJsonPath) {
    # Build per-source location keys so a finding resolved on one surface isn't
    # masked by the same finding still present on the other (source is part of
    # the key - cross-source matches are intentionally never treated as the same).
    $currentIds = $classified | ForEach-Object { $_.id }
    $currentLocations = $classified | ForEach-Object {
        "$($_.source):$($_.path):$($_.startLine):$($_.endLine):$($_.body)"
    }

    foreach ($prev in $previousComments) {
        $matched = $false
        if ($prev.id -and $prev.id -in $currentIds) {
            $matched = $true
        }
        else {
            $prevKey = "$($prev.source):$($prev.path):$($prev.startLine):$($prev.endLine):$($prev.body)"
            if ($prevKey -in $currentLocations) { $matched = $true }
        }
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
        schemaVersion = 1
        targetCommit  = $CommitSha
        prNumber      = $GitHubPrNumber
        # SMA-54 M2 surface-state flags: distinguish "Extension review located"
        # from "GitHub review skipped (path filters)" from "desync (GitHub has a
        # review but no Extension entry)". actionableMarker is the parsed
        # "Actionable comments posted: N" (null when absent - absence != zero, M5).
        extensionFound   = $extensionFound
        reviewSkipped    = $reviewSkipped
        actionableMarker = $actionableMarker
        # Partial-harvest observability (CR PR #97): githubPartialData is true when
        # any non-critical GitHub surface failed to fetch/parse, so a degraded
        # harvest is not mistaken for a clean "no comments" result.
        githubPartialData        = @($script:surfaceFetchStatus.Values | Where-Object { $_ -ne 'ok' }).Count -gt 0
        githubSurfaceFetchStatus = $script:surfaceFetchStatus
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
