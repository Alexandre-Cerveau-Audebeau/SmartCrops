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

    SMA-103 skip-and-revisit: a forward id-based phase no longer pins its cursor on a
    transient failure (which re-hammered a throttled cluster and never completed).
    Instead the failed id is queued server-side (PerenualRevisitQueue) and the cursor
    advances. After each forward phase this driver runs K=3 spaced revisit passes
    (phase=revisit-details / revisit-careguide) with 30s / 2m / 10m inter-pass backoff,
    draining the queue one id at a time. Ids still unresolved after the passes stay in
    the queue (retried for free on a future run) and are listed in the docs/runs report.

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

    # SMA-103 runaway net (replaces the SMA-100 stall-pin guard, now unreachable
    # because the server cursor always advances). Abort a phase after this many
    # CONSECUTIVE chunks that are ENTIRELY transient — fetches >= 1 but processed = 0
    # AND htmlSkipped = 0 (every fetch failed). At limit=200 a local throttled cluster
    # still leaves the chunk full of successes, so the streak resets and never trips on
    # it (that cluster now flows into the revisit queue instead); only a globally-down
    # upstream (mass 429/5xx, transport down) yields a 100%-transient chunk. 3 chunks
    # (~600 calls) is a clear, bounded signal — kept low to spare the Supreme quota.
    # The run stays fully resumable: re-launch once the upstream recovers.
    [ValidateRange(2, 100)]
    [int]$MaxAllTransientChunks = 3
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
    $transientStreak = 0  # consecutive ENTIRELY-transient chunks (SMA-103 runaway net)

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

        # SMA-103 runaway net. Count CONSECUTIVE chunks that are ENTIRELY transient:
        # fetches (processed + htmlSkipped + failures; Cached excluded — an idempotent
        # skip is not a fetch) >= 1, yet processed = 0 AND htmlSkipped = 0 (every id the
        # chunk fetched failed). That is the signature of a globally-down upstream, not a
        # local throttled cluster — at limit=200 a cluster still leaves the chunk full of
        # successes (streak resets) and now flows into PerenualRevisitQueue instead. A
        # chunk with >=1 success OR >=1 htmlSkipped resets the streak; an all-cached /
        # empty chunk (fetches = 0) leaves it UNCHANGED. Abort after
        # $MaxAllTransientChunks rather than hammer a dead upstream — fully resumable.
        $fetches = [int]$resp.processed + [int]$resp.htmlSkipped + [int]$resp.failures
        if ($fetches -ge 1 -and [int]$resp.processed -eq 0 -and [int]$resp.htmlSkipped -eq 0) {
            $transientStreak++
            # Surface the climbing streak to an operator watching the console (this runs
            # against a live quota days before the cancel) so a forming 429/5xx storm is
            # visible as it builds, not only at the hard abort.
            Write-Host ("  [{0}] entirely-transient chunk (streak {1}/{2})" -f `
                $Phase, $transientStreak, $MaxAllTransientChunks) -ForegroundColor Yellow
            if ($transientStreak -ge $MaxAllTransientChunks) {
                $blocked = if ($resp.failedIds) { $resp.failedIds -join ', ' } else { '(none reported)' }
                throw ("[{0}] ABORTED: {1} consecutive entirely-transient chunks — upstream appears globally down. Blocked (endpoint={0}) ids: {2}. Queued ids stay in PerenualRevisitQueue; resumable once the upstream recovers (re-run this script)." -f `
                    $Phase, $transientStreak, $blocked)
            }
        }
        elseif ([int]$resp.processed -ge 1 -or [int]$resp.htmlSkipped -ge 1) {
            $transientStreak = 0
        }
        # else: fetches = 0 (all cached / empty chunk) → streak UNCHANGED.

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

function Invoke-RevisitPasses {
    # SMA-103: after a forward id-based phase completes, drain its PerenualRevisitQueue
    # with K spaced passes. Each pass is one POST to phase=revisit-<endpoint>; the
    # backend paces PER ID (>=1500ms floor) while the long inter-pass backoffs
    # (30s / 2m / 10m) live HERE, giving the throttled cluster increasing time to
    # recover — mimicking the spaced one-at-a-time manual probe that succeeds where the
    # rapid forward sweep truncated. Stops early once nothing is pending. Ids still
    # unresolved after the last pass stay in the queue (retried free on a future run).
    param(
        [Parameter(Mandatory)] [string]$RevisitPhase
    )

    $backoffs = @(30, 120, 600)   # seconds to wait before passes 1, 2, 3 (increasing)
    $last = $null

    Write-Host ("=== {0} (revisit, {1} passes) ===" -f $RevisitPhase, $backoffs.Count) -ForegroundColor Cyan

    for ($pass = 1; $pass -le $backoffs.Count; $pass++) {
        $wait = $backoffs[$pass - 1]
        Write-Host ("  pass {0}/{1}: waiting {2}s for the upstream to recover before draining..." -f `
            $pass, $backoffs.Count, $wait)
        Start-Sleep -Seconds $wait

        $uri = "{0}/api/admin/perenual/cache-catalog?phase={1}&limit={2}&delayMs={3}" -f `
            $BaseUrl, $RevisitPhase, $Limit, $DelayMs
        $resp = Invoke-CacheChunk -Uri $uri -Headers $headers -Label ("{0}#pass{1}" -f $RevisitPhase, $pass) -Retries $MaxRetries
        $last = $resp

        $stillPending = [int]$resp.stillPending
        Write-Host ("  pass {0}: drained={1} resolved={2} stillPending={3} failedIds={4}" -f `
            $pass, $resp.drained, $resp.resolved, $stillPending, (($resp.failedIds) -join ', '))

        if ($stillPending -le 0) {
            Write-Host ("  {0}: queue fully drained after pass {1}." -f $RevisitPhase, $pass) -ForegroundColor Green
            break
        }
    }

    $finalPending = if ($last) { [int]$last.stillPending } else { 0 }
    $finalFailed = if ($last -and $last.failedIds) { @($last.failedIds) } else { @() }
    if ($finalPending -gt 0) {
        Write-Host ("  {0}: {1} id(s) STILL pending after {2} passes (left in queue, retried free on a future run): {3}" -f `
            $RevisitPhase, $finalPending, $backoffs.Count, ($finalFailed -join ', ')) -ForegroundColor Yellow
    }
    Write-Host ""

    return [pscustomobject]@{
        Phase        = $RevisitPhase
        StillPending = $finalPending
        FailedIds    = $finalFailed
    }
}

function Write-RunReport {
    # STEP 4: persist a counts-only run report under docs/runs/ so the operator has a
    # durable record of the forward totals and any ids left unresolved in the revisit
    # queue. Never contains a body or key — counts and ids only.
    param(
        [Parameter(Mandatory)] [object[]]$Results,
        [Parameter(Mandatory)] [object[]]$Revisits
    )

    $runsDir = Join-Path $PSScriptRoot "../../docs/runs"
    if (-not (Test-Path $runsDir)) {
        New-Item -ItemType Directory -Path $runsDir -Force | Out-Null
    }
    $reportPath = Join-Path $runsDir ("perenual-aspiration-{0}.md" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add(("# Perenual aspiration run — {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss")))
    $lines.Add("")
    $lines.Add(("Backend ``{0}`` · limit={1} · delayMs={2} · force={3}" -f $BaseUrl, $Limit, $DelayMs, $Force.IsPresent))
    $lines.Add("")
    $lines.Add("## Forward phases")
    $lines.Add("")
    $lines.Add("| phase | processed | cached | htmlSkipped | failures |")
    $lines.Add("|---|---|---|---|---|")
    foreach ($r in $Results) {
        $lines.Add(("| {0} | {1} | {2} | {3} | {4} |" -f $r.Phase, $r.Processed, $r.Cached, $r.HtmlSkipped, $r.Failures))
    }
    $lines.Add("")
    $lines.Add("## Revisit drains")
    $lines.Add("")
    $lines.Add("| phase | stillPending | unresolved ids |")
    $lines.Add("|---|---|---|")
    foreach ($v in $Revisits) {
        $ids = if ($v.FailedIds -and $v.FailedIds.Count -gt 0) { $v.FailedIds -join ', ' } else { '(none)' }
        $lines.Add(("| {0} | {1} | {2} |" -f $v.Phase, $v.StillPending, $ids))
    }
    $lines.Add("")
    $totalPending = ($Revisits | Measure-Object -Property StillPending -Sum).Sum
    if ($totalPending -gt 0) {
        $lines.Add(("> {0} id(s) remain in PerenualRevisitQueue (ResolvedAt IS NULL). No data lost — they are re-fetched for free on the next forward sweep." -f $totalPending))
    }
    else {
        $lines.Add("> Revisit queue fully drained — 0 ids unresolved.")
    }

    Set-Content -Path $reportPath -Value $lines -Encoding utf8
    Write-Host ("Run report written: {0}" -f $reportPath) -ForegroundColor Cyan
}

Write-Host ("Perenual raw-cache aspiration — backend={0} limit={1} delayMs={2} force={3}" -f `
    $BaseUrl, $Limit, $DelayMs, $Force.IsPresent) -ForegroundColor Cyan
Write-Host ""

# Order matters: list must be cached first — details/careguide enumerate their ids
# from the cached species-list pages. Each id-based forward phase is immediately
# followed by spaced revisit passes that drain the transient queue it filled (SMA-103).
$listResult = Invoke-Phase -Phase "list"
$detailsResult = Invoke-Phase -Phase "details"
$detailsRevisit = Invoke-RevisitPasses -RevisitPhase "revisit-details"
$careguideResult = Invoke-Phase -Phase "careguide"
$careguideRevisit = Invoke-RevisitPasses -RevisitPhase "revisit-careguide"

$results = @($listResult, $detailsResult, $careguideResult)
$revisits = @($detailsRevisit, $careguideRevisit)

Write-Host "=== GRAND TOTAL ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
$grandFailures = ($results | Measure-Object -Property Failures -Sum).Sum
$grandPending = ($revisits | Measure-Object -Property StillPending -Sum).Sum

if ($grandPending -gt 0) {
    Write-Host ("{0} id(s) remain unresolved in PerenualRevisitQueue after revisit — retried for free on a future forward sweep (no data lost)." -f $grandPending) -ForegroundColor Yellow
}
if ($grandFailures -gt 0) {
    Write-Host ("Completed with {0} transient failure(s) this run (queued for revisit; idempotent re-run picks up the rest)." -f $grandFailures) -ForegroundColor Yellow
}
else {
    Write-Host "Completed with 0 transient failures." -ForegroundColor Green
}

# STEP 4: durable run report (counts + any unresolved ids) under docs/runs/.
Write-RunReport -Results $results -Revisits $revisits
