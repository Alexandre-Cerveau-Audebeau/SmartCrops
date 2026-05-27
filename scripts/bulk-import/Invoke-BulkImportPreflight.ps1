<#
.SYNOPSIS
    Run the GBIF taxon-key overlap pre-flight against a curated CSV before
    submitting it to POST /api/admin/bulk-import (SMA-45, ADR-0004 layer b).

.DESCRIPTION
    Reads a curated CSV (same shape as scripts/bulk-import/curated-batch1.csv:
    scientificName, commonNameFr, commonNameEn, category), posts the rows in
    chunks to /api/admin/bulk-import/preflight, aggregates the resulting
    overlaps, and writes them to scripts/bulk-import/exports/flagged-overlaps.csv
    for human review.

    Exit code is 1 when at least one overlap is flagged (so the script can gate
    a downstream `POST /api/admin/bulk-import` in a pipeline), 0 otherwise.

    AUTH: the endpoint is [Authorize] (same policy as bulk-import itself); pass
    a bearer token via `-Cookie` or `$env:SMARTCROPS_TOKEN`. NEVER hardcode the
    token in this file, never commit it to the repo, never log it.

    READ-ONLY: the pre-flight endpoint performs no DB writes. Re-running the
    script after editing the curated CSV is the intended iterative loop.

    LIMIT (drift): the pre-flight is blind to GBIF taxonomy drift on rows
    already enriched against an older taxonomy snapshot - those collisions
    only surface at enrichment time. Runtime resilience for that case is
    tracked under SMA-46. See ADR-0004 Consequences.

.PARAMETER CuratedCsv
    Path to the curated CSV. Required. Schema:
      scientificName,commonNameFr,commonNameEn,category
    Only `scientificName` (required) and `category` (optional, echoed) are
    read by the pre-flight; other columns are ignored.

.PARAMETER BaseUrl
    Backend root URL. Defaults to http://localhost:5000 (matches the
    convention used by Enrich-AllSources.ps1).

.PARAMETER ChunkSize
    Candidates per POST. Defaults to 250 (well under the server's per-request
    cap of 500 enforced by BulkImportPreflightRequest.MaxCandidates).

.PARAMETER Cookie
    Auth bearer token (admin session). Falls back to $env:SMARTCROPS_TOKEN.
    NO secret is hardcoded in this file or anywhere in the repo.

.EXAMPLE
    $env:SMARTCROPS_TOKEN = "<jwt>"
    .\Invoke-BulkImportPreflight.ps1 -CuratedCsv .\curated-batch1.csv

.EXAMPLE
    .\Invoke-BulkImportPreflight.ps1 -CuratedCsv .\my-batch.csv -ChunkSize 100
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$CuratedCsv,

    [string]$BaseUrl = "http://localhost:5000",

    # The upper bound 500 mirrors BulkImportPreflightRequest.MaxCandidates in
    # Core (src/backend/SmartCrops.Core/Models/BulkImportPreflightModels.cs).
    # PowerShell can't import a C# const at parse time; if the backend cap
    # changes, update this literal too. Server-side 400 is the authoritative
    # enforcement - this attribute is fail-fast UX.
    [ValidateRange(1, 500)]
    [int]$ChunkSize = 250,

    [string]$Cookie = $env:SMARTCROPS_TOKEN
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CuratedCsv)) {
    throw "Curated CSV not found at path '$CuratedCsv'."
}

if ([string]::IsNullOrWhiteSpace($Cookie)) {
    throw "No auth token. Set `$env:SMARTCROPS_TOKEN or pass -Cookie. The preflight endpoint is [Authorize]."
}

$headers = @{
    "Authorization" = "Bearer $Cookie"
    "Accept"        = "application/json"
}

# Output path lives under exports/ which is gitignored. Resolved relative to
# the script directory so the script works regardless of caller's CWD.
# $PSScriptRoot is the standard automatic variable for this - robust under
# dot-sourced and module contexts where $MyInvocation.MyCommand.Path is null.
$scriptDir   = $PSScriptRoot
$exportsDir  = Join-Path $scriptDir "exports"
$outputCsv   = Join-Path $exportsDir "flagged-overlaps.csv"
if (-not (Test-Path $exportsDir)) {
    New-Item -ItemType Directory -Path $exportsDir | Out-Null
}

Write-Host "Reading curated CSV: $CuratedCsv" -ForegroundColor Cyan
$rows = Import-Csv -Path $CuratedCsv
$candidates = @($rows | ForEach-Object {
    # Defensive: silently skip rows with no scientificName. The server-side
    # service does the same, but filtering here saves the round-trip.
    if (-not [string]::IsNullOrWhiteSpace($_.scientificName)) {
        [pscustomobject]@{
            scientificName = $_.scientificName.Trim()
            category       = $_.category
        }
    }
})

if ($candidates.Count -eq 0) {
    throw "Curated CSV contains zero usable rows (need at least one non-blank scientificName)."
}

Write-Host ("Submitting {0} candidate(s) in chunks of {1}..." -f $candidates.Count, $ChunkSize) -ForegroundColor Cyan

$allOverlaps  = @()
$totalNoMatch = 0
$totalChecked = 0
$chunkIndex   = 0

for ($i = 0; $i -lt $candidates.Count; $i += $ChunkSize) {
    $chunkIndex++
    $slice = $candidates[$i..([math]::Min($i + $ChunkSize - 1, $candidates.Count - 1))]
    $body  = @{
        candidates = @($slice | ForEach-Object {
            @{
                scientificName = $_.scientificName
                category       = $_.category
            }
        })
    } | ConvertTo-Json -Depth 5

    $uri = "$BaseUrl/api/admin/bulk-import/preflight"
    try {
        # -TimeoutSec 120 caps the wait at 2 minutes per chunk; a stalled
        # backend would otherwise pin the script indefinitely.
        $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body -ContentType "application/json" -TimeoutSec 120
    }
    catch {
        Write-Host ("  [chunk {0}] HTTP error: {1}" -f $chunkIndex, $_.Exception.Message) -ForegroundColor Red
        throw
    }

    $overlapCount = if ($null -eq $resp.overlaps) { 0 } else { @($resp.overlaps).Count }
    Write-Host (
        "  [chunk {0}] CandidateCount={1} NoMatchCount={2} OverlapCount={3}" `
            -f $chunkIndex, $resp.candidateCount, $resp.noMatchCount, $overlapCount
    )

    $totalChecked += [int]$resp.candidateCount
    $totalNoMatch += [int]$resp.noMatchCount
    if ($overlapCount -gt 0) {
        $allOverlaps += @($resp.overlaps)
    }
}

# Always write the CSV (even when empty) so the file's presence + row count is
# the unambiguous signal: 0 rows = batch clean, >0 rows = curator review needed.
$exportRows = @($allOverlaps | ForEach-Object {
    [pscustomobject]@{
        candidate_scientific_name = $_.candidateScientificName
        candidate_category        = $_.candidateCategory
        resolved_accepted_key     = $_.resolvedAcceptedKey
        resolved_match_type       = $_.resolvedMatchType
        conflict_type             = $_.conflictType
        conflicting_partner       = $_.conflictingPartner
        suggested_action          = $_.suggestedAction
    }
})

if ($exportRows.Count -eq 0) {
    # Import-Csv on an empty file yields nothing; emit the header alone so the
    # reader knows the run produced the canonical schema with zero rows.
    "candidate_scientific_name,candidate_category,resolved_accepted_key,resolved_match_type,conflict_type,conflicting_partner,suggested_action" `
        | Set-Content -Path $outputCsv -Encoding UTF8
}
else {
    $exportRows | Export-Csv -Path $outputCsv -NoTypeInformation -Encoding UTF8
}

Write-Host ""
Write-Host ("=== Pre-flight summary ===") -ForegroundColor Cyan
Write-Host ("Candidates checked: {0}" -f $totalChecked)
Write-Host ("NoMatch (GBIF):     {0}" -f $totalNoMatch)
Write-Host ("Overlaps flagged:   {0}" -f $allOverlaps.Count)
Write-Host ("Output CSV:         {0}" -f $outputCsv)

if ($allOverlaps.Count -gt 0) {
    Write-Host ""
    Write-Host "Overlaps detected - review flagged-overlaps.csv before posting to /bulk-import." -ForegroundColor Yellow
    $exitCode = 1
}
else {
    Write-Host ""
    Write-Host "No overlaps - batch is safe to submit to POST /api/admin/bulk-import." -ForegroundColor Green
    $exitCode = 0
}

# Dot-source-safe terminator: bare `exit` terminates the host process, which
# is destructive when the script is dot-sourced (e.g. for testing or
# composition). Set $LASTEXITCODE so downstream $? / chained checks still see
# the result, then `return` under dot-sourcing or `exit` on direct invocation.
$global:LASTEXITCODE = $exitCode
if ($MyInvocation.InvocationName -eq '.') {
    return $exitCode
}
exit $exitCode
