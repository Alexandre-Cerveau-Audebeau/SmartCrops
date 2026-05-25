<#
.SYNOPSIS
    Bulk-enrich every Plant row across GBIF, Trefle, and Perenual.

.DESCRIPTION
    Driver script for PR 2a-2. Walks the three /enrich-all endpoints in chunks
    of -Limit plants and loops each phase until NotEnrichedRemaining hits 0
    (or stalls — see "stalled guard" below). Resumable with no state file:
    the SQL filter (EnrichmentStatus & XxxEnriched == 0) IS the state.

    Phase order is GBIF -> Trefle -> Perenual and is NON-NEGOTIABLE. GBIF
    writes plant.Genus; Perenual's genus gate reads it. Running Perenual
    before GBIF silently downgrades Perenual writes to "row + audit only"
    because the gate fires conservative-skip on null/empty Genus.

    Stalled guard: a phase stops when NotEnrichedRemaining does NOT decrease
    between two consecutive chunks. That means the chunk processed only
    unmatchable plants (no upstream match found) and the remaining count
    will never reach 0 by retrying.

.PARAMETER BaseUrl
    Backend root. Defaults to http://localhost:5000.

.PARAMETER Limit
    Chunk size per phase iteration. Defaults to 50. Trefle's 120 req/min
    budget is the tightest, so a chunk of 50 at ~500 ms/plant = ~25 s,
    well under quota.

.PARAMETER ThrottleSeconds
    Sleep between successful chunks (driver-side throttle, courtesy to APIs).
    Defaults to 2.

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
    [int]$Limit = 50,
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

    $prevRemaining = [int]::MaxValue
    $remaining = 0
    $chunkIndex = 0

    do {
        $chunkIndex++
        $uri = "$BaseUrl/$Route" + "?force=false&limit=$Limit"

        try {
            $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers
        }
        catch {
            Write-Host ("  [chunk {0}] HTTP error: {1}" -f $chunkIndex, $_.Exception.Message) -ForegroundColor Red
            throw
        }

        $remaining = [int]$resp.notEnrichedRemaining
        Write-Host (
            "  [chunk {0}] Total={1} Matched={2} NotMatched={3} Skipped={4} Failed={5} Remaining={6}" `
                -f $chunkIndex, $resp.total, $resp.matched, $resp.notMatched, $resp.skipped, $resp.failed, $remaining
        )

        # Stalled guard: remaining must strictly decrease, otherwise we're
        # spinning on unmatchable plants that will never get the flag.
        if ($chunkIndex -gt 1 -and $remaining -ge $prevRemaining) {
            Write-Host (
                "  No progress ($remaining stuck >= prev $prevRemaining): unmatchable plants for $Source. Stopping phase."
            ) -ForegroundColor Yellow
            break
        }

        $prevRemaining = $remaining

        if ($remaining -gt 0) {
            Start-Sleep -Seconds $ThrottleSeconds
        }
    } while ($remaining -gt 0)

    Write-Host "=== $Source done (remaining=$remaining after $chunkIndex chunk(s)) ===" -ForegroundColor Green
}

# ORDER IS NON-NEGOTIABLE — see header.
Invoke-EnrichPhase -Source "GBIF"     -Route "api/admin/taxonomy/enrich-all"
Invoke-EnrichPhase -Source "Trefle"   -Route "api/admin/trefle/enrich-all"
Invoke-EnrichPhase -Source "Perenual" -Route "api/admin/perenual/enrich-all"

Write-Host ""
Write-Host "All phases complete." -ForegroundColor Green
