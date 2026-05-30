<#
.SYNOPSIS
    Paginate the Perenual catalog via the SmartCrops admin endpoint, apply
    Strategy A (drop cultivar/variety/hybrid/subspecies), and emit a curated
    CSV ready for bulk-import (SMA-13 batch 2 / batch 3 scale-up).

.DESCRIPTION
    Calls GET /api/admin/perenual/species-list?page=N through the local
    SmartCrops backend (the backend holds the Perenual API key - this script
    never touches Perenual directly). Applies Strategy A client-side: keep
    only entries where cultivar, variety, hybrid AND subspecies are all null.

    Strategy A justification (SMA-13 Phase 0 recon, 90-entry sample):
    cultivar field carries 60% of the rejection signal; variety/hybrid/
    subspecies add belt-and-braces coverage for taxonomic edge cases. Sample
    showed Strategy A keeps 40% (36/90), implying ~42 pages fetched to reach
    500 qualified entries - negligible on the Perenual Supreme 100k/day quota.

    Output CSV schema (matches scripts/bulk-import/curated-batch1.csv):
        scientificName,commonNameFr,commonNameEn,category

    Category is a coarse client-side heuristic - refined post-merge by the
    Trefle/Perenual enrichment pipeline (IsVegetable, IsCulinary, etc.).

    AUTH: passes the bearer token through to the backend (the endpoint is
    [Authorize]). NEVER hardcode the token; use $env:SMARTCROPS_TOKEN.

.PARAMETER TargetCount
    Stop pagination once this many qualified entries are accumulated.
    Default 500 (SMA-13 batch 2). Set lower for smoke runs.

.PARAMETER OutputPath
    Where to write the curated CSV. Default
    scripts/bulk-import/curated-batch2.csv (NOT auto-committed - separate
    data-only commit, mirror of PR #84 pattern).

.PARAMETER MaxPages
    Safety cap on pagination. Default 100 (3000 raw candidates at 30/page,
    enough headroom over the 42-page Strategy A expectation).

.PARAMETER StartPage
    Page number to start fetching from. Default 1. Note: this script
    overwrites OutputPath on each run; it does not append to or resume an
    existing CSV. To split a large fetch, run separate page ranges into
    separate OutputPath files and concatenate the CSVs afterwards.

.PARAMETER BaseUrl
    Backend root. Defaults to http://localhost:5000 (matches the convention
    used by Enrich-AllSources.ps1 and Invoke-BulkImportPreflight.ps1).

.PARAMETER Cookie
    Auth bearer token (JWT). Falls back to $env:SMARTCROPS_TOKEN. Required.

    Acquire via the SmartCrops auth endpoints - the JWT lives in a
    Set-Cookie 'smartcrops_token' on register/login. Smoke pattern:

        # Register a throwaway admin user (or use POST /api/auth/login with
        # existing credentials).
        $body = @{ email='you+ts@localhost.dev'; password='TestPass123!';
                   firstName='X'; lastName='Y' } | ConvertTo-Json
        $reg = Invoke-WebRequest -Method Post `
            -Uri http://localhost:5000/api/auth/register `
            -Body $body -ContentType "application/json" -SessionVariable sv
        $env:SMARTCROPS_TOKEN = (
            $sv.Cookies.GetAllCookies() |
            Where-Object { $_.Name -eq 'smartcrops_token' }
        ).Value

    Never hardcode the token in the script or commit it. Same pattern used
    by Invoke-BulkImportPreflight.ps1 and Enrich-AllSources.ps1.

.PARAMETER ThrottleSeconds
    Sleep between successful pages. Default 1s - polite even though Perenual
    quota (100k/day, Supreme tier) is comfortable for the ~42 pages expected.

.PARAMETER MaxRetries
    Per-page retry budget for transient HTTP failures (502/503/504, gateway
    or timeout flaps from Perenual upstream). Default 3 with exponential
    backoff (1s, 2s, 4s); the script aborts the run after the budget is
    exhausted. 400/401/403/404 are NOT retried - they signal a request
    bug, not a transient flap.

.EXAMPLE
    $env:SMARTCROPS_TOKEN = "<jwt>"
    .\Fetch-PerenualCatalog.ps1 -TargetCount 500

.EXAMPLE
    # Smoke run: 30 qualified entries, capped at 5 pages.
    .\Fetch-PerenualCatalog.ps1 -TargetCount 30 -MaxPages 5 -OutputPath /tmp/curated-batch2-smoke.csv
#>

#Requires -Version 7.0

[CmdletBinding()]
param(
    [ValidateRange(1, [int]::MaxValue)]
    [int]$TargetCount = 500,

    [string]$OutputPath,

    [ValidateRange(1, 500)]
    [int]$MaxPages = 100,

    [ValidateRange(1, [int]::MaxValue)]
    [int]$StartPage = 1,

    [string]$BaseUrl = "http://localhost:5000",

    [string]$Cookie = $env:SMARTCROPS_TOKEN,

    [ValidateRange(0, 60)]
    [int]$ThrottleSeconds = 1,

    [ValidateRange(0, 10)]
    [int]$MaxRetries = 3
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Cookie)) {
    throw "No auth token. Set `$env:SMARTCROPS_TOKEN or pass -Cookie. The catalog endpoint is [Authorize]."
}

# $PSScriptRoot resolves to the directory of this script even under
# dot-sourcing - robustness lesson from CR R5 on PR #89.
$scriptDir = $PSScriptRoot
if (-not $OutputPath) {
    $OutputPath = Join-Path $scriptDir "curated-batch2.csv"
}

$headers = @{
    "Authorization" = "Bearer $Cookie"
    "Accept"        = "application/json"
}

# Category heuristic - coarse client-side signal. The Trefle/Perenual
# enrichment pipeline refines this post-bulk-create via PlantGrowthHabit,
# IsVegetable, IsCulinary, etc. Cooking-keyword and family lookups are
# case-insensitive; the keyword sets are intentionally small (false negatives
# default to Ornamental, which is also the safest default for an unknown).
$VegetableKeywords = @('tomato','basil','lettuce','pepper','onion','garlic','cucumber','carrot','potato','spinach','cabbage','bean','pea','beet','radish','pumpkin','squash','asparagus','artichoke','leek')
$FruitKeywords     = @('berry','strawberry','raspberry','blueberry','currant','grape','apple','cherry','fig','olive','pear','plum')
$HerbKeywords      = @('mint','basil','thyme','sage','parsley','coriander','rosemary','oregano','chives','dill','bay','fennel','tarragon','lemon balm')
$HerbFamilies      = @('lamiaceae','apiaceae')
$FruitFamilies     = @('rosaceae','grossulariaceae','vitaceae','oleaceae','moraceae','ericaceae')

function Get-Category {
    param([string]$CommonName, [string]$Family)
    # Word-boundary matching, not substring: "European Silver Fir" must not
    # match "pea" inside "European". Split on non-letter chars and check
    # exact membership against the keyword sets.
    $cn = ($CommonName ?? '').ToLowerInvariant()
    $fam = ($Family ?? '').ToLowerInvariant()
    $words = $cn -split '[^a-z]+' | Where-Object { $_ }

    foreach ($w in $words) { if ($VegetableKeywords -contains $w) { return 'Vegetable' } }
    if ($HerbFamilies -contains $fam) {
        foreach ($w in $words) { if ($HerbKeywords -contains $w) { return 'Herb' } }
    }
    if ($FruitFamilies -contains $fam) {
        foreach ($w in $words) { if ($FruitKeywords -contains $w) { return 'Fruit' } }
    }
    return 'Ornamental'
}

function Get-InfraspecificMatch {
    # Strategy A v2 lexical pre-filter (SMA-53). Detects an infra-specific rank
    # suffix or a cultivar marker embedded IN the scientificName string itself.
    # This catches "type 1" ambiguity that Perenual's cultivar/variety/hybrid/
    # subspecies fields leave NULL - e.g. "Abies nordmanniana subsp. equi-trojani",
    # "Actaea simplex (Atropurpurea Group)", "Rosa 'Iceberg'", "Salix x sepulcralis".
    # It does NOT catch "type 2" sibling-species GBIF synonymisation (pure binomials
    # collapsing to one GbifTaxonKey, e.g. Abelia chinensis vs grandiflora -> 5599251);
    # that is the GBIF pre-flight's job (Invoke-BulkImportPreflight.ps1, SMA-45).
    # Returns the matched token (for the drop log) or $null when the name is clean.
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return $null }

    # Alpha rank tokens, case-insensitive. The leading space + trailing dot make
    # them word-boundary safe: " f." cannot match inside "officinalis".
    foreach ($t in @(' subsp.', ' ssp.', ' var.', ' f.', ' cv.')) {
        if ($Name -imatch [regex]::Escape($t)) { return $t.Trim() }
    }
    # Cultivar group / parenthetical, e.g. "(Atropurpurea Group)".
    if ($Name.Contains('(')) { return '(' }
    # Hybrid multiplication sign U+00D7 (kept as a codepoint so this file stays
    # ASCII), or a space-delimited lowercase x ("Genus x species"). The spaces
    # avoid false positives on epithets that merely contain an x (e.g. "baccata").
    if ($Name.Contains([char]0x00D7)) { return 'multiplication-sign' }
    if ($Name.Contains(' x ')) { return 'space-x-space' }
    # Cultivar apostrophe, e.g. "Rosa 'Iceberg'". Aggressive by design - the GBIF
    # pre-flight rescues the rare false positive.
    if ($Name.Contains([char]0x27)) { return 'apostrophe' }

    return $null
}

function Invoke-CatalogPage {
    # Retry wrapper around Invoke-RestMethod for the species-list endpoint.
    # Retries on transient HTTP failures (502/503/504, gateway/timeout flaps
    # from Perenual upstream) with exponential backoff (1s, 2s, 4s, ...).
    # 4xx-non-429 client errors are NOT retried - they signal a request bug.
    # 429 is treated as transient (rate-limit, will clear on retry).
    # Returns the parsed response; throws if the retry budget is exhausted.
    # CR PR #92 R1 Angle A.
    param(
        [Parameter(Mandatory)] [string]$Uri,
        [Parameter(Mandatory)] [hashtable]$Headers,
        [Parameter(Mandatory)] [int]$Page,
        [int]$Retries = 3
    )
    $attempt = 0
    while ($true) {
        try {
            return Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers -TimeoutSec 120
        }
        catch {
            $status = $null
            if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
            $isTransient = (-not $status) -or ($status -ge 500) -or ($status -eq 429)

            if (-not $isTransient -or $attempt -ge $Retries) {
                Write-Host ("  [page {0}] HTTP error (status={1}, attempt={2}/{3}): {4}" -f $Page, ($status ?? '(none)'), ($attempt + 1), ($Retries + 1), $_.Exception.Message) -ForegroundColor Red
                throw
            }

            $backoff = [Math]::Pow(2, $attempt)
            Write-Host ("  [page {0}] transient error (status={1}, attempt={2}/{3}), retrying in {4}s: {5}" -f $Page, ($status ?? '(none)'), ($attempt + 1), ($Retries + 1), $backoff, $_.Exception.Message) -ForegroundColor Yellow
            Start-Sleep -Seconds $backoff
            $attempt++
        }
    }
}

Write-Host ("Fetching Perenual catalog: target={0} qualified, max={1} pages, start=page {2}" -f $TargetCount, $MaxPages, $StartPage) -ForegroundColor Cyan
Write-Host ("Backend: {0}" -f $BaseUrl) -ForegroundColor Cyan
Write-Host ""

# List<T> for O(1) amortized Add() instead of array += which is O(n^2).
# CR PR #92 R1 N4. Trivial at TargetCount=500 (~125K copy ops) but batch 3
# will run with TargetCount in the low thousands.
$qualified = [System.Collections.Generic.List[pscustomobject]]::new()
$rawCount = 0
$rejectedByCultivar = 0
$rejectedByVariety = 0
$rejectedByHybrid = 0
$rejectedBySubspecies = 0
# Strategy A v2 (SMA-53): lexical pre-filter on scientificName. Count + log every
# drop (name + matched token) for traceability of what the pre-filter removed.
$rejectedByLexical = 0
$lexicalDrops = [System.Collections.Generic.List[pscustomobject]]::new()
$pagesFetched = 0
$lastPageSeen = $null

for ($page = $StartPage; $page -lt $StartPage + $MaxPages; $page++) {
    $uri = "$BaseUrl/api/admin/perenual/species-list?page=$page"
    $resp = Invoke-CatalogPage -Uri $uri -Headers $headers -Page $page -Retries $MaxRetries

    $pagesFetched++
    $lastPageSeen = $resp.lastPage
    $entries = @($resp.data)
    $rawCount += $entries.Count

    if ($entries.Count -eq 0) {
        Write-Host ("  [page {0}] empty (tail reached)" -f $page) -ForegroundColor Yellow
        break
    }

    # Apply Strategy A: drop entries where ANY of cultivar/variety/hybrid/
    # subspecies is non-null. The cultivar check alone absorbs ~60% on the
    # recon sample; the other three are belt-and-braces.
    #
    # Explicit null + trimmed-empty check (not truthy eval): Perenual MAY
    # ship "" on these discriminators on pages outside the recon sample, and
    # an empty cultivar string would slip through `if ($e.cultivar)` and end
    # up curated. The "$(...)" cast hardens against non-string types too.
    $keptThisPage = 0
    foreach ($e in $entries) {
        if ($null -ne $e.cultivar -and "$($e.cultivar)".Trim() -ne '') { $rejectedByCultivar++; continue }
        if ($null -ne $e.variety -and "$($e.variety)".Trim() -ne '') { $rejectedByVariety++; continue }
        if ($null -ne $e.hybrid -and "$($e.hybrid)".Trim() -ne '') { $rejectedByHybrid++; continue }
        if ($null -ne $e.subspecies -and "$($e.subspecies)".Trim() -ne '') { $rejectedBySubspecies++; continue }

        # scientificName is an array; take the first entry as canonical (the
        # resolver path indexes against any entry case-insensitively, but
        # bulk-create's dedup key is the literal first one).
        $scientificName = if ($e.scientificName -and $e.scientificName.Count -gt 0) { $e.scientificName[0] } else { $null }
        if ([string]::IsNullOrWhiteSpace($scientificName)) { continue }

        # Strategy A v2 lexical pre-filter (SMA-53): drop names carrying an
        # infra-specific suffix / cultivar marker that the Perenual discriminator
        # fields missed (type 1 ambiguity). Logged for traceability.
        $lexToken = Get-InfraspecificMatch -Name $scientificName
        if ($lexToken) {
            $rejectedByLexical++
            $lexicalDrops.Add([pscustomobject]@{ scientificName = $scientificName; token = $lexToken })
            continue
        }

        $qualified.Add([pscustomobject]@{
                scientificName = $scientificName
                commonNameFr   = ''
                commonNameEn   = ($e.commonName ?? '')
                category       = Get-Category -CommonName $e.commonName -Family $e.family
            })
        $keptThisPage++

        if ($qualified.Count -ge $TargetCount) { break }
    }

    Write-Host ("  [page {0}/{1}] raw={2} kept={3} (cumulative qualified={4}/{5})" -f $page, $lastPageSeen, $entries.Count, $keptThisPage, $qualified.Count, $TargetCount)

    if ($qualified.Count -ge $TargetCount) { break }
    if ($lastPageSeen -and $page -ge $lastPageSeen) {
        Write-Host ("  reached last_page={0}" -f $lastPageSeen) -ForegroundColor Yellow
        break
    }

    if ($ThrottleSeconds -gt 0) { Start-Sleep -Seconds $ThrottleSeconds }
}

# Always write the CSV (even when empty) so file presence + row count is
# the unambiguous signal.
$outputDir = Split-Path -Parent $OutputPath
if ($outputDir -and -not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

if ($qualified.Count -eq 0) {
    "scientificName,commonNameFr,commonNameEn,category" | Set-Content -Path $OutputPath -Encoding UTF8
}
else {
    $qualified | Export-Csv -Path $OutputPath -NoTypeInformation -Encoding UTF8
}

Write-Host ""
Write-Host "=== Fetch summary ===" -ForegroundColor Cyan
Write-Host ("Pages fetched:           {0}" -f $pagesFetched)
Write-Host ("Last page seen:          {0}" -f $lastPageSeen)
Write-Host ("Raw entries:             {0}" -f $rawCount)
Write-Host ("Qualified entries:       {0}" -f $qualified.Count)
Write-Host ("Rejected by cultivar:    {0}" -f $rejectedByCultivar)
Write-Host ("Rejected by variety:     {0}" -f $rejectedByVariety)
Write-Host ("Rejected by hybrid:      {0}" -f $rejectedByHybrid)
Write-Host ("Rejected by subspecies:  {0}" -f $rejectedBySubspecies)
Write-Host ("Rejected by lexical:     {0}  (Strategy A v2, SMA-53)" -f $rejectedByLexical)
Write-Host ("Output CSV:              {0}" -f $OutputPath)

# Full traceability of the lexical pre-filter: list every dropped name + the
# token that matched, so a curator can audit what Strategy A v2 removed.
if ($lexicalDrops.Count -gt 0) {
    Write-Host ""
    Write-Host ("--- Lexical pre-filter drops ({0}) ---" -f $lexicalDrops.Count) -ForegroundColor Yellow
    foreach ($d in $lexicalDrops) {
        Write-Host ("  [{0,-20}] {1}" -f $d.token, $d.scientificName)
    }
}

# Dot-source-safe terminator (R4 lesson on PR #89): bare `exit` would kill
# a dot-sourcing host. Set $LASTEXITCODE then `return` if dot-sourced or
# `exit` on direct invocation. Exit code is 1 when we stopped before the
# target (under-fetched) and 0 on success.
$exitCode = if ($qualified.Count -lt $TargetCount -and (-not $lastPageSeen -or $page -lt $lastPageSeen)) { 1 } else { 0 }
$global:LASTEXITCODE = $exitCode
if ($MyInvocation.InvocationName -eq '.') {
    return $exitCode
}
exit $exitCode
