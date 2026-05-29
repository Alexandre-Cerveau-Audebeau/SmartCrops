#requires -Version 7.0

<#
.SYNOPSIS
    Locate the CodeRabbit Extension review entry for a target commit by scanning
    the VS Code workspace storage and matching on the headCommitId stored INSIDE
    each JSON file - never on the file name.

.DESCRIPTION
    The CodeRabbit VS Code Extension writes one content-hashed JSON file per
    branch under %APPDATA%\Code\User\workspaceStorage\<ws>\coderabbit.coderabbit-vscode\.
    The file NAME is an opaque content hash and does NOT correspond to any
    derivable key (the prior SHA256("<repo>-<branch>-reviews") scheme never
    matched - see SMA-54 M1). Each file holds either a single review object or an
    ARRAY of review entries accumulated over the branch's life; the only reliable
    locator is the `headCommitId` field inside each entry.

    This script enumerates every candidate file, normalizes single-object and
    array shapes to a flat entry list, keeps only entries whose `headCommitId`
    matches the target commit AND whose `status` is `completed` (cancelled /
    in_progress / failed are excluded - SMA-54 M3), sorts by `endedAt` descending,
    and emits the newest match as JSON on stdout with an added `_sourceFile`.

    There is intentionally NO file-mtime freshness gate (the old 5-min check -
    SMA-54 M4): a per-branch file's mtime reflects the latest write for ANY commit
    on that branch, which is unrelated to whether THIS commit's review is done.
    `status == 'completed'` is the correct readiness signal.

.PARAMETER CommitSha
    Target commit SHA (full or prefix). Matched with `-like "$CommitSha*"`.

.PARAMETER WorkspaceStorageRoot
    Root of VS Code workspace storage. Defaults to
    %APPDATA%\Code\User\workspaceStorage.

.PARAMETER ExpectedRepoPath
    Optional. When supplied, prefer the workspace whose sibling `workspace.json`
    `folder` URI matches this path; falls back to scanning all workspaces if no
    match is found (so a missing/renamed workspace.json never hard-fails).

.NOTES
    PowerShell 7+ required. Windows-only by design (see .coderabbit.yaml
    path_instructions - do NOT port to bash/linux).
    Exit codes: 0 = entry found (emitted on stdout), 1 = invalid input/environment
    (includes a blank/whitespace CommitSha and a missing workspace storage root),
    3 = no completed review entry for this commit (NOT a hard error - the commit
    may be unreviewed, still in progress, or legitimately skipped; the caller
    treats 3 as the GitHub-only fallback and STOPs on 1).
    Error reporting uses Write-Stderr (issue #50): $ErrorActionPreference='Stop'
    makes Write-Error terminating, which would collapse the documented exit codes.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [ValidateNotNullOrEmpty()] [string]$CommitSha,
    [Parameter(Mandatory = $false)] [string]$WorkspaceStorageRoot = (Join-Path $env:APPDATA 'Code\User\workspaceStorage'),
    [Parameter(Mandatory = $false)] [string]$ExpectedRepoPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Duplicated from Classify-Comments.ps1 to keep this script independently
# runnable - the established pattern in this skill (Write-Report.ps1 does the
# same). See issue #50: Write-Error is terminating under EAP='Stop', so the
# explicit `exit N` lines below would never run without this helper.
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

# Parse a date-ish string into a sortable DateTime; unparseable values sort
# oldest (DateTime.MinValue) so a malformed endedAt never wins the "newest".
function ConvertTo-SortableDate {
    [CmdletBinding()]
    [OutputType([datetime])]
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return [datetime]::MinValue }
    [datetime]$parsed = [datetime]::MinValue
    if ([datetime]::TryParse($Value, [ref]$parsed)) { return $parsed }
    return [datetime]::MinValue
}

# Mandatory rejects $null and '' but NOT whitespace-only ("   "), which would
# make "$CommitSha*" degenerate to "*" and match an unrelated completed entry.
# Close that hole explicitly (CR PR #97). Exit 1 = invalid input, NOT 3: a blank
# CommitSha is bad input, not a legitimate "no review for this commit". The
# SKILL.md branching treats exit 3 as the GitHub-only fallback and only STOPs on
# other codes; returning 3 here would silently degrade to a GitHub-only harvest
# on bad input instead of stopping. Exit 1 -> STOP (CR PR #97 round 2, critical).
if ([string]::IsNullOrWhiteSpace($CommitSha)) {
    Write-Stderr -Message "CommitSha is blank/whitespace - invalid input, refusing to match (would wildcard to '*')." -ExitCode 1
}

if (-not (Test-Path $WorkspaceStorageRoot)) {
    Write-Stderr -Message "Workspace storage root not found: $WorkspaceStorageRoot" -ExitCode 1
}

# -- Discover candidate coderabbit folders ----------------------------------
# Optionally narrow to the workspace whose workspace.json folder URI matches
# ExpectedRepoPath; otherwise scan every workspace's coderabbit folder.
$crFolders = [System.Collections.Generic.List[string]]::new()
$workspaceDirs = Get-ChildItem -Path $WorkspaceStorageRoot -Directory -Force -ErrorAction SilentlyContinue

$matchedByRepo = $false
if ($ExpectedRepoPath) {
    # VS Code stores the folder URI as file:///C:/path with forward slashes.
    $needle = ($ExpectedRepoPath -replace '\\', '/').TrimEnd('/')
    foreach ($wd in $workspaceDirs) {
        $wsJson = Join-Path $wd.FullName 'workspace.json'
        if (-not (Test-Path $wsJson)) { continue }
        try { $ws = Get-Content $wsJson -Raw | ConvertFrom-Json } catch { continue }
        $folder = (Get-SafeProp -Object $ws -Name 'folder').ToString()
        if ($folder -and ($folder -replace '\\', '/') -like "*$needle*") {
            $cr = Join-Path $wd.FullName 'coderabbit.coderabbit-vscode'
            if (Test-Path $cr) { $crFolders.Add($cr); $matchedByRepo = $true }
        }
    }
}
if (-not $matchedByRepo) {
    foreach ($wd in $workspaceDirs) {
        $cr = Join-Path $wd.FullName 'coderabbit.coderabbit-vscode'
        if (Test-Path $cr) { $crFolders.Add($cr) }
    }
}

if ($crFolders.Count -eq 0) {
    Write-Stderr -Message "No coderabbit.coderabbit-vscode folder found under $WorkspaceStorageRoot." -ExitCode 3
}

# -- Enumerate, parse, flatten, filter --------------------------------------
$candidates = [System.Collections.Generic.List[PSCustomObject]]::new()

foreach ($folder in $crFolders) {
    $jsonFiles = Get-ChildItem -Path (Join-Path $folder '*.json') -File -ErrorAction SilentlyContinue
    foreach ($f in $jsonFiles) {
        if ($f.Name -eq 'categories.json') { continue }
        try {
            $parsed = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 100
        } catch { continue }  # not all .json here are review files; skip unparseable

        # Normalize single-object vs array to a flat entry list.
        $entries = if ($parsed -is [System.Array]) { $parsed } else { @($parsed) }
        foreach ($e in $entries) {
            $head = (Get-SafeProp -Object $e -Name 'headCommitId').ToString()
            $status = (Get-SafeProp -Object $e -Name 'status').ToString()
            if (-not $head) { continue }                       # not a review entry
            if ($head -notlike "$CommitSha*") { continue }     # different commit
            if ($status -ne 'completed') { continue }          # exclude cancelled/in_progress/failed (M3)

            $endedAt = (Get-SafeProp -Object $e -Name 'endedAt').ToString()
            $startedAt = (Get-SafeProp -Object $e -Name 'startedAt').ToString()
            $sortKey = ConvertTo-SortableDate -Value $endedAt
            if ($sortKey -eq [datetime]::MinValue) { $sortKey = ConvertTo-SortableDate -Value $startedAt }

            $candidates.Add([PSCustomObject]@{
                Entry      = $e
                SourceFile = $f.FullName
                SortKey    = $sortKey
            }) | Out-Null
        }
    }
}

if ($candidates.Count -eq 0) {
    Write-Stderr -Message "No COMPLETED CodeRabbit review entry found for commit '$CommitSha'. The commit may be unreviewed, still in progress, or legitimately skipped (path filters). Caller should check the GitHub surfaces." -ExitCode 3
}

# Newest completed entry wins (M3 determinism).
$best = $candidates | Sort-Object SortKey -Descending | Select-Object -First 1

# Emit the located entry as JSON, annotated with its source file.
$entryOut = $best.Entry
Add-Member -InputObject $entryOut -NotePropertyName '_sourceFile' -NotePropertyValue $best.SourceFile -Force
$entryOut | ConvertTo-Json -Depth 100

exit 0
