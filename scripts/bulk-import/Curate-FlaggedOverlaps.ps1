<#
.SYNOPSIS
    Curate a curated-batch CSV against the GBIF pre-flight's flagged-overlaps
    output: remove taxonomic collisions, keeping one canonical binomial per
    resolved GbifTaxonKey. Strategy A v2 residual-curation step (SMA-53).

.DESCRIPTION
    The lexical pre-filter in Fetch-PerenualCatalog.ps1 (Strategy A v2) removes
    "type 1" ambiguity (infra-specific suffixes IN the scientificName). The GBIF
    pre-flight (Invoke-BulkImportPreflight.ps1, SMA-45) then surfaces "type 2"
    collisions: distinct scientificNames that resolve to the SAME GbifTaxonKey -
    sibling species GBIF synonymises (e.g. Abelia chinensis vs grandiflora ->
    5599251), and candidates colliding with a row already in the DB. This script
    consumes that flagged-overlaps CSV and produces a collision-free CSV.

    Per flagged group (rows sharing a resolved_accepted_key):
      * conflict_type 'db_existing'  -> drop every candidate in it (the key is
        already held by a DB row; keeping any would orphan at enrichment).
      * conflict_type 'intra_batch'  -> keep the most canonical binomial, drop
        the rest. If the key also appears in a db_existing row, drop ALL members.

    Winner selection is DETERMINISTIC (SMA-67 stability lesson): sort by
    (canonicity penalty asc, length asc, scientificName asc). The scientificName
    final key guarantees the same survivor across runs on identical input.

    Note: this heuristic picks the most binomial-pure name; it does NOT consult
    GBIF for the accepted name. When a group is two pure binomials (e.g.
    Bergenia cordifolia vs crassifolia) the curator may prefer the GBIF-accepted
    one - swap manually post-run if it differs from the deterministic pick.

.PARAMETER CuratedCsv
    The full curated list to clean (schema: scientificName, commonNameFr,
    commonNameEn, category). Required.

.PARAMETER FlaggedCsv
    The pre-flight flagged-overlaps CSV (schema: candidate_scientific_name,
    candidate_category, resolved_accepted_key, resolved_match_type, conflict_type,
    conflicting_partner, suggested_action). Required.

.PARAMETER OutputCsv
    Where to write the cleaned CSV. Defaults to the CuratedCsv path with a
    '-clean' suffix (e.g. curated-batch3.csv -> curated-batch3-clean.csv).

.EXAMPLE
    .\Curate-FlaggedOverlaps.ps1 -CuratedCsv .\curated-batch3.csv `
        -FlaggedCsv .\exports\flagged-overlaps.csv
#>

#Requires -Version 7.0

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$CuratedCsv,

    [Parameter(Mandatory)]
    [string]$FlaggedCsv,

    [string]$OutputCsv
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $CuratedCsv)) { throw "Curated CSV not found: $CuratedCsv" }
if (-not (Test-Path $FlaggedCsv)) { throw "Flagged CSV not found: $FlaggedCsv" }

if ([string]::IsNullOrWhiteSpace($OutputCsv)) {
    $dir = Split-Path -Parent $CuratedCsv
    $base = [System.IO.Path]::GetFileNameWithoutExtension($CuratedCsv)
    $ext = [System.IO.Path]::GetExtension($CuratedCsv)
    $OutputCsv = Join-Path $dir "$base-clean$ext"
}

# Canonicity penalty: how far a name is from a pure "Genus species" binomial.
# Lower = more canonical. A pure binomial scores 0. Mirrors the Strategy A v2
# lexical markers (a name reaching the pre-flight in a v2 world should be clean,
# but the script must rank robustly on whatever it is given).
function Get-CanonicityPenalty {
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return [int]::MaxValue }
    $p = 0
    foreach ($t in @(' subsp.', ' ssp.', ' var.', ' f.', ' cv.')) {
        if ($Name -imatch [regex]::Escape($t)) { $p++ }
    }
    if ($Name.Contains('('))            { $p++ }
    if ($Name.Contains([char]0x00D7))   { $p++ }   # hybrid multiplication sign
    if ($Name.Contains(' x '))          { $p++ }
    if ($Name.Contains([char]0x27))     { $p++ }   # cultivar apostrophe
    return $p
}

$flagged = Import-Csv -Path $FlaggedCsv
$curated = Import-Csv -Path $CuratedCsv

# db_existing: drop every flagged candidate, and remember the keys so an
# intra_batch group sharing such a key is dropped wholesale (cross-bucket).
$dbExisting     = @($flagged | Where-Object { $_.conflict_type -eq 'db_existing' })
$dbExistingKeys = [System.Collections.Generic.HashSet[string]]::new()
foreach ($r in $dbExisting) { [void]$dbExistingKeys.Add($r.resolved_accepted_key) }

$dropSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($r in $dbExisting) { [void]$dropSet.Add($r.candidate_scientific_name) }

$groupReport = [System.Collections.Generic.List[pscustomobject]]::new()

$intraGroups = $flagged | Where-Object { $_.conflict_type -eq 'intra_batch' } |
    Group-Object resolved_accepted_key

foreach ($g in $intraGroups) {
    $key = $g.Name
    $members = @($g.Group | ForEach-Object { $_.candidate_scientific_name })

    if ($dbExistingKeys.Contains($key)) {
        # Key also collides with a DB row -> every member orphans; drop all.
        foreach ($m in $members) { [void]$dropSet.Add($m) }
        $groupReport.Add([pscustomobject]@{
                key = $key; kept = '(none - key also in DB)'
                dropped = ($members -join ', '); reason = 'key collides with DB row -> drop all'
            })
        continue
    }

    # Deterministic winner: canonicity penalty asc, length asc, name asc.
    $ranked = $g.Group | ForEach-Object {
        $n = $_.candidate_scientific_name
        [pscustomobject]@{ name = $n; penalty = (Get-CanonicityPenalty $n); length = $n.Length }
    } | Sort-Object penalty, length, name

    $winner = $ranked[0].name
    $losers = @($ranked | Select-Object -Skip 1 | ForEach-Object { $_.name })
    foreach ($l in $losers) { [void]$dropSet.Add($l) }

    $groupReport.Add([pscustomobject]@{
            key = $key; kept = $winner
            dropped = ($losers -join ', ')
            reason = "canonical pick (penalty=$($ranked[0].penalty), len=$($ranked[0].length))"
        })
}

# Produce the cleaned CSV (preserve original order + schema).
$clean = @($curated | Where-Object { -not $dropSet.Contains($_.scientificName) })
$clean | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8

# Curation log.
Write-Host "=== Curate-FlaggedOverlaps (SMA-53) ===" -ForegroundColor Cyan
Write-Host ("Curated input:   {0} rows  ({1})" -f $curated.Count, $CuratedCsv)
Write-Host ("Flagged input:   {0} rows  ({1})" -f $flagged.Count, $FlaggedCsv)
Write-Host ("db_existing:     {0} dropped" -f $dbExisting.Count)
Write-Host ("intra_batch:     {0} group(s)" -f $intraGroups.Count)
Write-Host ("Total dropped:   {0} (distinct names)" -f $dropSet.Count)
Write-Host ("Clean output:    {0} rows  ({1})" -f $clean.Count, $OutputCsv) -ForegroundColor Green

if ($dbExisting.Count -gt 0) {
    Write-Host ""
    Write-Host "--- db_existing (all dropped) ---" -ForegroundColor Yellow
    foreach ($r in $dbExisting) {
        Write-Host ("  {0,-40} key={1} -> {2}" -f $r.candidate_scientific_name, $r.resolved_accepted_key, $r.conflicting_partner)
    }
}
if ($groupReport.Count -gt 0) {
    Write-Host ""
    Write-Host "--- intra_batch groups ---" -ForegroundColor Yellow
    foreach ($r in ($groupReport | Sort-Object key)) {
        Write-Host ("  key=$($r.key)")
        Write-Host ("    KEPT : $($r.kept)   [$($r.reason)]")
        Write-Host ("    DROP : $($r.dropped)")
    }
}

# Sanity: arithmetic must hold (clean == curated - dropped-that-were-present).
$presentDrops = @($curated | Where-Object { $dropSet.Contains($_.scientificName) }).Count
if ($clean.Count -ne ($curated.Count - $presentDrops)) {
    Write-Host ("WARNING: arithmetic mismatch - clean={0} curated={1} presentDrops={2}" -f $clean.Count, $curated.Count, $presentDrops) -ForegroundColor Red
}
