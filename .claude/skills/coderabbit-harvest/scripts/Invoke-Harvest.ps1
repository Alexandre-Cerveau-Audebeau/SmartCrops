#requires -Version 7.0

<#
.SYNOPSIS
    Single entry point for the CodeRabbit harvest. Runs Locate -> Classify ->
    Write-Report as DIRECT `pwsh -File` subprocesses, bridged by FILES. Invoke
    this with `pwsh -File`; NEVER via `pwsh -Command "<string>"`.

.DESCRIPTION
    Replaces the old SKILL.md inline wrapper that ran
    `pwsh -NoProfile -Command $pipeline`, where $pipeline was a string-built
    `& Classify | & Write-Report`. That pattern was problematic for three reasons:
      (a) it could not pass the multi-KB review blob inline (command-line length);
      (b) its quoting got mangled when the agent ran it from an already-PowerShell
          context (the recurring "pwsh imbriqué a mutilé la commande");
      (c) "a script that loads a dynamically-built command" matches a heuristic
          antivirus signature and was getting blocked.

    This orchestrator keeps ONLY direct `pwsh -File <script> -Param <value>`
    subprocess calls. The stages are bridged through temp FILES, never through an
    inter-process pipe (which does not bind ValueFromPipeline across `pwsh -File`
    processes) and never through a dynamically-built `-Command` string:

      Locate   --stdout-->  cr-entry-<sha>.json        (passed as -ReviewEntryPath)
      Classify --stdout-->  cr-classified-<sha>.json   (passed as -InputPath)
      Write-Report  reads the classified file, writes harvest-<sha>.json, prints md.

    Each stage runs as its own process so its `exit N` cannot terminate this
    orchestrator; the exit code is read from $LASTEXITCODE and branched on
    explicitly (so a real failure STOPs instead of silently degrading).

.PARAMETER Commit
    Target commit SHA (full or prefix). Defaults to HEAD.

.PARAMETER Pr
    PR number. Defaults to the PR matching the current branch (via gh).

.PARAMETER CompareWith
    Optional previous SHA prefix; compares against <OutputDir>/harvest-<prefix>.json
    (adds NEW/PERSISTED/MODIFIED/RESOLVED transition labels).

.PARAMETER OutputDir
    Where the harvest JSON + temp bridge files land. Defaults to /tmp.

.PARAMETER Help
    Print the SKILL.md content and exit.

.NOTES
    PowerShell 7+ required. Windows-only by design.
    Exit codes: 0 = OK; 2 = no open PR / contract violation; otherwise the failing
    stage's exit code (STOP, do not silently degrade).
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)] [string]$Commit,
    [Parameter(Mandatory = $false)] [int]$Pr,
    [Parameter(Mandatory = $false)] [string]$CompareWith,
    [Parameter(Mandatory = $false)] [string]$OutputDir = '/tmp',
    [Parameter(Mandatory = $false)] [switch]$Help
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# PS 7.3+ can make a native command's non-zero exit terminating under EAP='Stop'
# ($PSNativeCommandUseErrorActionPreference defaults to $true on 7.4+). That would
# throw on Locate's legitimate `exit 3` BEFORE we can read $LASTEXITCODE and fall
# back to GitHub-only. Force it off so subprocess exit codes are ours to branch on.
$PSNativeCommandUseErrorActionPreference = $false

# Best-effort UTF-8 for THIS orchestrator's own stdout (Write-Report's emoji
# summary). The bridge files don't depend on it — each stage writes its JSON
# with explicit UTF-8 via -OutputPath — but it keeps the printed summary clean.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$scriptDir = $PSScriptRoot

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

# -- --help: print SKILL.md and exit ----------------------------------------
if ($Help) {
    $skillMd = Join-Path $scriptDir '..\SKILL.md'
    if (Test-Path $skillMd) { Get-Content $skillMd -Raw } else { "SKILL.md not found next to scripts/." }
    exit 0
}

# -- Resolve commit + PR -----------------------------------------------------
if (-not $Commit) {
    # Preflight: a missing git CLI must hit the stop/report path, not throw a raw
    # command-not-found before $LASTEXITCODE can be inspected.
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Stderr -Message "The 'git' CLI is required to auto-resolve -Commit. Install git or pass -Commit explicitly - STOPPING." -ExitCode 2
    }
    $Commit = (git rev-parse HEAD)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($Commit)) {
        Write-Stderr -Message "Could not resolve HEAD via git (not a repo?) - STOPPING." -ExitCode 2
    }
    $Commit = $Commit.Trim()
}

if (-not $Pr) {
    # Preflight: same stop/report contract for a missing gh CLI.
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Stderr -Message "The 'gh' CLI is required to auto-resolve -Pr. Install gh or pass -Pr explicitly - STOPPING." -ExitCode 2
    }
    $Pr = (gh pr view --json number --jq '.number') -as [int]
    if (-not $Pr) {
        Write-Stderr -Message "No open PR for the current branch (pass -Pr <n> to target one) - STOPPING." -ExitCode 2
    }
}

$shortSha       = $Commit.Substring(0, [Math]::Min(7, $Commit.Length))
$outputPath     = Join-Path $OutputDir "harvest-$shortSha.json"
$entryPath      = Join-Path $OutputDir "cr-entry-$shortSha.json"
$classifiedPath = Join-Path $OutputDir "cr-classified-$shortSha.json"

# -- Stage 1: Locate (own process; its `exit 3` must not kill us) ------------
# Locate writes the entry JSON straight to $entryPath with explicit UTF-8 (its
# -OutputPath), so the multi-byte CR content never round-trips through this
# parent's console codepage (which corrupts emoji under -NoProfile). We branch
# only on the exit code + file presence. Direct `pwsh -File`, no -Command string.
# Clear any stale Stage-1 bridge file FIRST (mirrors Stage 2's pre-clear), so the
# post-Locate file-presence check validates THIS run's output rather than a leftover.
if (Test-Path $entryPath) {
    try {
        Remove-Item $entryPath -Force
    } catch {
        Write-Stderr -Message "Failed to clear stale entry bridge file '$entryPath': $($_.Exception.Message)" -ExitCode 2
    }
}
pwsh -NoProfile -File (Join-Path $scriptDir 'Locate-Review.ps1') -CommitSha $Commit -OutputPath $entryPath
$locateRc = $LASTEXITCODE
if ($locateRc -eq 0 -and (Test-Path $entryPath)) {
    # entry written by Locate
} elseif ($locateRc -eq 0) {
    Write-Stderr -Message "Locate-Review exited 0 but wrote no entry file - STOPPING (contract violation)." -ExitCode 2
} elseif ($locateRc -eq 3) {
    # No completed Extension review for this commit; Classify harvests GitHub alone.
} else {
    Write-Stderr -Message "Locate-Review failed (exit $locateRc) - STOPPING (not a clean no-review case)." -ExitCode $locateRc
}

# -- Stage 2: Classify (own process; stdout -> FILE, not piped to next) -------
# Build the arg list as an ARRAY and splat it to the native command. No string
# concatenation of a command, so nothing to mangle and nothing for the AV
# heuristic to flag.
$classifyArgs = @('-GitHubPrNumber', $Pr, '-CommitSha', $Commit)
if (Test-Path $entryPath) { $classifyArgs += @('-ReviewEntryPath', $entryPath) }
if ($CompareWith) {
    $prevShort = $CompareWith.Substring(0, [Math]::Min(7, $CompareWith.Length))
    $prevPath  = Join-Path $OutputDir "harvest-$prevShort.json"
    if (-not (Test-Path $prevPath)) {
        Write-Stderr -Message "-CompareWith set but baseline not found: $prevPath - STOPPING." -ExitCode 2
    }
    $classifyArgs += @('-PreviousJsonPath', $prevPath)
}

$classifyArgs += @('-OutputPath', $classifiedPath)
# Clear any stale Stage-2 bridge file FIRST (mirrors Stage 1's pre-clear of the
# entry file), so the post-Classify existence check below validates THIS run's
# output rather than a leftover from a previous run.
if (Test-Path $classifiedPath) {
    try {
        Remove-Item $classifiedPath -Force
    } catch {
        Write-Stderr -Message "Failed to clear stale classified bridge file '$classifiedPath': $($_.Exception.Message)" -ExitCode 2
    }
}
pwsh -NoProfile -File (Join-Path $scriptDir 'Classify-Comments.ps1') @classifyArgs
$classifyRc = $LASTEXITCODE
if ($classifyRc -ne 0) {
    Write-Stderr -Message "Classify-Comments failed (exit $classifyRc) - STOPPING." -ExitCode $classifyRc
}
# Contract check symmetric with Stage 1: Classify must have produced the bridge
# file, else Write-Report would fail downstream with a less clear error.
if (-not (Test-Path $classifiedPath)) {
    Write-Stderr -Message "Classify-Comments exited 0 but wrote no classified file - STOPPING (contract violation)." -ExitCode 2
}

# -- Stage 3: Write-Report (own process; reads classified by FILE path) -------
# -InputPath bridges Classify -> Write-Report by file, so the multi-KB JSON never
# rides on the command line and the cross-process ValueFromPipeline issue is moot.
pwsh -NoProfile -File (Join-Path $scriptDir 'Write-Report.ps1') -OutputPath $outputPath -InputPath $classifiedPath
exit $LASTEXITCODE
