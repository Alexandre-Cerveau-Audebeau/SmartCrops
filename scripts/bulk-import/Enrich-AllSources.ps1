<#
.SYNOPSIS
    Bulk-enrich every Plant row across GBIF, Trefle, and Perenual.

.DESCRIPTION
    Driver script for PR 2a-2. Walks the three /enrich-all endpoints with
    keyset (seek) pagination: each phase chunks through the !XxxEnriched set
    ordered by Id, advancing -afterId chunk by chunk until the cursor reaches
    the tail. Termination is a short or empty chunk; there is no stalled
    guard, because the cursor guarantees forward progress regardless of how
    many plants the upstream source matches.

    Resumability is implicit: the SQL filter (EnrichmentStatus & XxxEnriched)
    == 0 IS the state. Re-running picks up exactly where the previous run
    stopped. Plants the upstream source could not match (NoMatch) stay in
    the !flagged set and will be retried on the next run.

    Phase order is GBIF -> Trefle -> Perenual and is NON-NEGOTIABLE. GBIF
    writes plant.Genus; Perenual's genus gate reads it. Running Perenual
    before GBIF silently downgrades Perenual writes to "row + audit only"
    because the gate fires conservative-skip on null/empty Genus.

    The driver only paces between chunks (-ThrottleSeconds). Per-request
    rate limiting is the backend's responsibility; the chunk size is sized
    so even Trefle's tightest 120 req/min budget is respected with margin.

.PARAMETER BaseUrl
    Backend root. Defaults to http://localhost:5000.

.PARAMETER Limit
    Chunk size per phase iteration. Defaults to 50. Must be >= 1.

.PARAMETER ThrottleSeconds
    Sleep between successful chunks (driver-side throttle). Must be >= 0.

.PARAMETER Cookie
    Auth bearer token (admin session). Falls back to $env:SMARTCROPS_TOKEN.
    NO secret is hardcoded in this file.

.EXAMPLE
    $env:SMARTCROPS_TOKEN = "..."
    .\Enrich-AllSources.ps1 -BaseUrl http://localhost:5000 -Limit 50

.EXAMPLE
    .\Enrich-AllSources.ps1 -Cookie "..." -Limit 25 -ThrottleSeconds 5
#>

[CmdletBinding()]
param(
    [string]$BaseUrl = "http://localhost:5000",
    [ValidateRange(1, [int]::MaxValue)]
    [int]$Limit = 50,
    [ValidateRange(0, [int]::MaxValue)]
    [int]$ThrottleSeconds = 2,
    [string]$Cookie = $env:SMARTCROPS_TOKEN
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Cookie)) {
    throw "No auth token. Set `$env:SMARTCROPS_TOKEN or pass -Cookie. The enrich-all endpoints are [Authorize]."
}

$headers = @{
    "Authorization" = "Bearer $Cookie"
    "Accept"        = "application/json"
}

function Invoke-EnrichPhase {
    param(
        [Parameter(Mandatory)] [string]$Source,
        [Parameter(Mandatory)] [string]$Route
    )

    Write-Host ""
    Write-Host "=== Phase: $Source ===" -ForegroundColor Cyan

    $afterId = $null
    $chunkIndex = 0
    $phaseFailed = 0

    do {
        $chunkIndex++
        $uri = "$BaseUrl/$Route" + "?force=false&limit=$Limit"
        if ($afterId) { $uri += "&afterId=$afterId" }

        try {
            $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers
        }
        catch {
            Write-Host ("  [chunk {0}] HTTP error: {1}" -f $chunkIndex, $_.Exception.Message) -ForegroundColor Red
            throw
        }

        # Fail-fast contract validation. The cursor model is unforgiving: a
        # missing 'total' coerced to 0 would terminate the loop early and
        # silently under-enrich; a missing nextAfterId after a full chunk
        # would also stall progression. Throw instead of guessing.
        if ($null -eq $resp) {
            throw "Null response from '$Route' on chunk $chunkIndex."
        }
        if (-not ($resp.PSObject.Properties.Name -contains 'total')) {
            throw "Response missing required field 'total' from '$Route' on chunk $chunkIndex."
        }
        $total = 0
        if (-not [int]::TryParse([string]$resp.total, [ref]$total)) {
            throw "Invalid 'total' value '$($resp.total)' from '$Route' on chunk $chunkIndex (expected integer)."
        }
        if ($total -gt 0 -and -not $resp.nextAfterId) {
            throw "Processed $total rows but 'nextAfterId' is null from '$Route' on chunk $chunkIndex (cursor contract violation)."
        }

        # Observability counters: each chunk MUST report matched/notMatched/
        # skipped/failed as integers. A silent absence would obscure the
        # post-run Failed-count warning below (and hide schema regressions).
        foreach ($field in 'matched', 'notMatched', 'skipped', 'failed') {
            if (-not ($resp.PSObject.Properties.Name -contains $field)) {
                throw "Response missing required field '$field' from '$Route' on chunk $chunkIndex."
            }
            $parsed = 0
            if (-not [int]::TryParse([string]$resp.$field, [ref]$parsed)) {
                throw "Invalid '$field' value '$($resp.$field)' from '$Route' on chunk $chunkIndex (expected integer)."
            }
        }

        $remaining = -1
        if ($resp.PSObject.Properties.Name -contains 'notEnrichedRemaining') {
            if (-not [int]::TryParse([string]$resp.notEnrichedRemaining, [ref]$remaining)) {
                throw "Invalid 'notEnrichedRemaining' value '$($resp.notEnrichedRemaining)' from '$Route' on chunk $chunkIndex."
            }
        }

        Write-Host (
            "  [chunk {0}] Total={1} Matched={2} NotMatched={3} Skipped={4} Failed={5} Remaining={6} NextAfterId={7}" `
                -f $chunkIndex, $total, $resp.matched, $resp.notMatched, $resp.skipped, $resp.failed, $remaining, $resp.nextAfterId
        )

        $phaseFailed += [int]$resp.failed
        $afterId = $resp.nextAfterId

        # A short chunk (fewer rows than $Limit) OR a null cursor means the
        # phase has scanned everything past the starting cursor. No need to
        # poll further.
        $more = ($total -eq $Limit -and $afterId)
        if ($more) {
            Start-Sleep -Seconds $ThrottleSeconds
        }
    } while ($more)

    Write-Host "=== $Source done ($chunkIndex chunk(s), final remaining=$remaining) ===" -ForegroundColor Green

    # A plant that throws during enrichment is counted Failed and stays
    # !XxxEnriched, but the cursor advances PAST it within this run (see
    # README "Failure model"). Surfacing the count here prompts a re-run
    # for mop-up; with no state file, afterId resets to null and the
    # failed plant is re-selected from the head of the remaining set.
    if ($phaseFailed -gt 0) {
        Write-Host (
            "  WARNING: {0} plant(s) failed during {1} (transient errors). They remain unflagged; re-run this script to retry them." `
                -f $phaseFailed, $Source
        ) -ForegroundColor Yellow
    }
}

# ORDER IS NON-NEGOTIABLE -- see header.
Invoke-EnrichPhase -Source "GBIF"     -Route "api/admin/taxonomy/enrich-all"
Invoke-EnrichPhase -Source "Trefle"   -Route "api/admin/trefle/enrich-all"
Invoke-EnrichPhase -Source "Perenual" -Route "api/admin/perenual/enrich-all"

Write-Host ""
Write-Host "All phases complete." -ForegroundColor Green
