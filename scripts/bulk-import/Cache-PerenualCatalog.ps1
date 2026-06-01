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

    # DelayMs / Limit are intentionally operator-tunable knobs (NOT hardcoded
    # literals, by design): the SMA-93 one-shot aspiration runs against a live
    # quota days before the Perenual cancel, so the operator must be able to slow
    # pacing if Perenual rate-limits and shrink the chunk if a run is interrupted.
    # Both are forwarded verbatim to the backend cache-catalog endpoint
    # (PerenualRawCacheController.CacheCatalog), which uses Limit as the per-chunk
    # bound; the client-side ValidateRange here is fail-fast UX only.

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
    [int]$MaxRetries = 3,

    # SMA-100 stall guard: abort a phase if it makes no progress (processed=0 AND an
    # unchanged nextCursor) for this many consecutive chunks. A persistent upstream
    # fault (5xx / 429) — or any future server-side resume bug — would otherwise loop
    # forever (cf. the 404-as-transient infinite loop this PR fixes). The run stays
    # fully resumable: re-launch once the upstream recovers and it picks up the gap.
    [ValidateRange(2, 100)]
    [int]$MaxStallChunks = 5
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
            # -TimeoutSec generous: worst case is $Limit resources each paced by
            # $DelayMs plus the per-call fetch + redaction. Default 200 * 700ms =
            # 140s of pacing alone; 600s leaves ample margin for the slow/large
            # Perenual details payloads (cf. the 180s backend resilience ceiling on
            # PerenualClient in Program.cs).
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
    $prevCursor = $null   # nextCursor of the previous chunk (stall detection)
    $stall = 0            # consecutive no-progress chunks at an unchanged cursor

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

        # SMA-100 stall guard. A chunk that fetched nothing new (processed=0) AND
        # returns the SAME nextCursor as the previous chunk is stuck re-trying the
        # same blocked ids — a persistent upstream fault (5xx/429) the server keeps
        # (correctly) classifying transient, so the cursor never advances. Abort the
        # phase after $MaxStallChunks such chunks rather than loop forever, naming the
        # blocked ids from the server's failedIds. A fully-cached re-visit is NOT a
        # stall: its nextCursor advances (maxId), so this only trips on a true pin.
        if ([int]$resp.processed -eq 0 -and -not [string]::IsNullOrEmpty($resp.nextCursor) -and $resp.nextCursor -eq $prevCursor) {
            $stall++
            # Surface the climbing stall to an operator watching the console (this runs
            # against a live quota days before the cancel) so a forming 5xx/429 storm is
            # visible as it builds, not only at the hard abort. Control flow unchanged.
            Write-Host ("  [{0}] no progress at cursor={1} (stall {2}/{3})" -f `
                $Phase, $resp.nextCursor, $stall, $MaxStallChunks) -ForegroundColor Yellow
            if ($stall -ge $MaxStallChunks) {
                $blocked = if ($resp.failedIds) { $resp.failedIds -join ', ' } else { '(none reported)' }
                throw ("[{0}] STALLED: no progress for {1} consecutive chunks at cursor={2}. Blocked ids: {3}. Aborting phase — resumable once the upstream recovers (re-run this script)." -f `
                    $Phase, $stall, $resp.nextCursor, $blocked)
            }
        }
        else {
            $stall = 0
        }
        $prevCursor = $resp.nextCursor

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
