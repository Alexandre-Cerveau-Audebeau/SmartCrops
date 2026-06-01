<#
.SYNOPSIS
    SMA-93 — drives the PerenualRawCache aspiration: fills the shape-agnostic raw
    cache of the Perenual API (species-list pages, then per-species details, then
    care guides) ahead of the Supreme subscription cancel.

.DESCRIPTION
    Calls the local admin endpoint POST /api/admin/perenual/cache-catalog in three
    phases, advancing the server's keyset cursor (nextCursor) until each phase is
    exhausted:

        1. phase=list      — caches every species-list page (key = page).
        2. phase=details   — caches /species/details/{id} for the REAL ids parsed
                             from the cached list pages (key = id).
        3. phase=careguide — caches the care guide for those same ids.

    DECOUPLED capture: this creates no Plant and touches neither GBIF nor Trefle.
    The endpoint is idempotent — an already-cached resource is skipped unless
    -Force is passed. Every captured body is API-key-redacted server-side and
    asserted redacted before it is stored. This driver NEVER receives or prints a
    Perenual key (the endpoint returns counts only).

    Mirrors the resilience of Fetch-PerenualCatalog.ps1: transient HTTP failures
    (5xx / 429 / transport) are retried with exponential backoff; 4xx-non-429 are
    surfaced immediately. The auth token (SMARTCROPS_TOKEN) is never echoed.

.EXAMPLE
    $env:SMARTCROPS_TOKEN = "<admin-jwt>"
    ./Cache-PerenualCatalog.ps1

.EXAMPLE
    ./Cache-PerenualCatalog.ps1 -DelayMs 1000 -Limit 100 -Force
#>

#Requires -Version 7.0

[CmdletBinding()]
param(
    [string]$BaseUrl = "http://localhost:5000",

    [string]$Token = $env:SMARTCROPS_TOKEN,

    # Server-side pacing between Perenual calls (ms). Forwarded to the endpoint.
    [ValidateRange(0, 60000)]
    [int]$DelayMs = 700,

    # Resources processed per server chunk. The driver loops chunks until a phase
    # reports no nextCursor, so this only bounds a single request's work.
    [ValidateRange(1, 1000)]
    [int]$Limit = 200,

    # Re-fetch and overwrite already-cached resources instead of skipping them.
    [switch]$Force,

    # Client-side retry budget for transient HTTP failures.
    [ValidateRange(0, 10)]
    [int]$MaxRetries = 3
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Token)) {
    throw "No auth token. Set `$env:SMARTCROPS_TOKEN or pass -Token. cache-catalog is [Authorize(Roles=Admin)]."
}

$headers = @{
    "Authorization" = "Bearer $Token"
    "Accept"        = "application/json"
}

function Invoke-CacheChunk {
    # Retry wrapper around the cache-catalog POST. Transient HTTP failures
    # (5xx / 429 / transport flaps from the upstream Perenual quota) retry with
    # exponential backoff (1s, 2s, 4s, ...); 4xx-non-429 signal a request bug and
    # are NOT retried. Returns the parsed counts-only response. Pattern: the
    # Invoke-CatalogPage wrapper in Fetch-PerenualCatalog.ps1 (CR PR #92 R1 A).
    param(
        [Parameter(Mandatory)] [string]$Uri,
        [Parameter(Mandatory)] [hashtable]$Headers,
        [Parameter(Mandatory)] [string]$Label,
        [int]$Retries = 3
    )
    $attempt = 0
    while ($true) {
        try {
            # -TimeoutSec generous: a chunk may make up to $Limit paced API calls.
            return Invoke-RestMethod -Method Post -Uri $Uri -Headers $Headers -TimeoutSec 600
        }
        catch {
            $status = $null
            if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
            $isTransient = (-not $status) -or ($status -ge 500) -or ($status -eq 429)

            if (-not $isTransient -or $attempt -ge $Retries) {
                Write-Host ("  [{0}] HTTP error (status={1}, attempt={2}/{3}): {4}" -f $Label, ($status ?? '(none)'), ($attempt + 1), ($Retries + 1), $_.Exception.Message) -ForegroundColor Red
                throw
            }

            $backoff = [Math]::Pow(2, $attempt)
            Write-Host ("  [{0}] transient error (status={1}, attempt={2}/{3}), retrying in {4}s: {5}" -f $Label, ($status ?? '(none)'), ($attempt + 1), ($Retries + 1), $backoff, $_.Exception.Message) -ForegroundColor Yellow
            Start-Sleep -Seconds $backoff
            $attempt++
        }
    }
}

function Invoke-Phase {
    # Loop cache-catalog chunks for one phase, advancing afterId=nextCursor until
    # the server reports no nextCursor (phase exhausted). Accumulates the
    # counts-only totals and returns them.
    param(
        [Parameter(Mandatory)] [string]$Phase
    )

    $forceFlag = $Force.IsPresent.ToString().ToLowerInvariant()
    $totProcessed = 0; $totCached = 0; $totHtmlSkipped = 0; $totFailures = 0
    $cursor = $null
    $chunk = 0

    Write-Host ("=== phase={0} ===" -f $Phase) -ForegroundColor Cyan

    while ($true) {
        $chunk++
        $uri = "{0}/api/admin/perenual/cache-catalog?phase={1}&limit={2}&delayMs={3}&force={4}" -f `
            $BaseUrl, $Phase, $Limit, $DelayMs, $forceFlag
        if ($null -ne $cursor) {
            $uri += "&afterId=$cursor"
        }

        $resp = Invoke-CacheChunk -Uri $uri -Headers $headers -Label ("{0}#{1}" -f $Phase, $chunk) -Retries $MaxRetries

        $totProcessed   += [int]$resp.processed
        $totCached      += [int]$resp.cached
        $totHtmlSkipped += [int]$resp.htmlSkipped
        $totFailures    += [int]$resp.failures

        Write-Host ("  chunk {0}: processed={1} cached={2} htmlSkipped={3} failures={4} nextCursor={5}" -f `
            $chunk, $resp.processed, $resp.cached, $resp.htmlSkipped, $resp.failures, ($resp.nextCursor ?? '(end)'))

        if ([string]::IsNullOrEmpty($resp.nextCursor)) {
            break
        }
        $cursor = $resp.nextCursor
    }

    Write-Host ("  phase {0} TOTAL: processed={1} cached={2} htmlSkipped={3} failures={4}" -f `
        $Phase, $totProcessed, $totCached, $totHtmlSkipped, $totFailures) -ForegroundColor Green
    Write-Host ""

    return [pscustomobject]@{
        Phase       = $Phase
        Processed   = $totProcessed
        Cached      = $totCached
        HtmlSkipped = $totHtmlSkipped
        Failures    = $totFailures
    }
}

Write-Host ("Perenual raw-cache aspiration — backend={0} limit={1} delayMs={2} force={3}" -f `
    $BaseUrl, $Limit, $DelayMs, $Force.IsPresent) -ForegroundColor Cyan
Write-Host ""

# Order matters: list must be cached first — details/careguide enumerate their
# ids from the cached species-list pages.
$results = @(
    Invoke-Phase -Phase "list"
    Invoke-Phase -Phase "details"
    Invoke-Phase -Phase "careguide"
)

Write-Host "=== GRAND TOTAL ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
$grandFailures = ($results | Measure-Object -Property Failures -Sum).Sum
if ($grandFailures -gt 0) {
    Write-Host ("Completed with {0} failure(s) — re-run to retry (idempotent; cached resources skip)." -f $grandFailures) -ForegroundColor Yellow
}
else {
    Write-Host "Completed with 0 failures." -ForegroundColor Green
}
