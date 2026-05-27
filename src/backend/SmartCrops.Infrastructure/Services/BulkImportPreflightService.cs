using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SmartCrops.Core.Interfaces;
using SmartCrops.Core.Models;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Infrastructure.Services;

/// <summary>
/// Read-only pre-flight overlap detector for the bulk-import flow. See
/// <see cref="IBulkImportPreflightService"/> for the contract. Implementation
/// notes:
///
/// <list type="number">
///   <item><b>GBIF resolution is delegated to <see cref="IPlantTaxonomyService"/></b>
///   (the same wrapper the runtime enrichment endpoints use). This guarantees
///   that the pre-flight predicts <em>exactly</em> what the runtime resolver
///   would persist — there is one source of truth (<c>GbifDedupResolver</c>)
///   for the EXACT/FUZZY/HIGHERRANK algorithm. The pre-flight cannot drift
///   from the enrichment path because it is the enrichment path's resolver,
///   just called earlier.</item>
///
///   <item><b>The DB cross-check is a single EF query</b> with an
///   <c>IN (…)</c> filter on the resolved keys. ADR-0004's
///   <em>When-to-revisit</em> bullet warns against per-candidate
///   <c>SELECT</c>s — for batches of 1000-3000 candidates a single bulk
///   query is well within bounds.</item>
///
///   <item><b>Case-insensitive name comparison</b> on both cross-checks: two
///   candidates whose <c>ScientificName</c> only differs by case (e.g.
///   <c>"Salvia rosmarinus"</c> vs <c>"salvia rosmarinus"</c>) deduplicate at
///   bulk-create time via the <c>LOWER</c> functional unique index (PR #81);
///   they are not a taxon overlap. Same logic for the DB side — only emit a
///   <c>db_existing</c> overlap when the candidate name and the persisted
///   name truly differ.</item>
///
///   <item><b>Strictly read-only.</b> No entities are tracked, no rows are
///   written, no upstream state is mutated. The only side effect is one GBIF
///   <c>species/match</c> call per non-blank candidate (the existing typed
///   <c>HttpClient</c> carries the standard resilience handler), and the
///   per-batch DB <c>SELECT</c>.</item>
/// </list>
/// </summary>
public class BulkImportPreflightService : IBulkImportPreflightService
{
    private readonly SmartCropsDbContext _db;
    private readonly IPlantTaxonomyService _taxonomy;
    private readonly ILogger<BulkImportPreflightService> _logger;

    public BulkImportPreflightService(
        SmartCropsDbContext db,
        IPlantTaxonomyService taxonomy,
        ILogger<BulkImportPreflightService> logger)
    {
        _db = db;
        _taxonomy = taxonomy;
        _logger = logger;
    }

    public async Task<BulkImportPreflightResponse> CheckAsync(
        BulkImportPreflightRequest request,
        CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(request.Candidates);

        var rawCandidates = request.Candidates;
        var candidateCount = rawCandidates.Count;

        // Trim + skip blanks up front. Blank rows are a CSV hygiene issue, not
        // a taxonomy overlap; they are silently filtered from the analysis so
        // the GBIF call budget is not wasted on empty strings. The non-blank
        // count is implicit (CandidateCount minus blanks, derivable by the
        // curator from the response shape — Overlaps + NoMatchCount + clean
        // matches).
        var trimmed = new List<PreflightCandidate>(candidateCount);
        foreach (var c in rawCandidates)
        {
            if (c is null) continue;
            var name = c.ScientificName?.Trim();
            if (string.IsNullOrWhiteSpace(name)) continue;
            trimmed.Add(c with { ScientificName = name });
        }

        // Resolve every non-blank candidate against GBIF in submission order.
        // Sequential is fine at this scale (the typed HttpClient has the
        // standard resilience handler attached at registration time; GBIF
        // itself is the latency floor). Parallelisation can land later if
        // the batch wall-time becomes a bottleneck.
        var resolutions = new List<(PreflightCandidate Candidate, int Key, string MatchType)>(trimmed.Count);
        var noMatchCount = 0;

        foreach (var candidate in trimmed)
        {
            ct.ThrowIfCancellationRequested();
            var result = await _taxonomy.ResolveAsync(candidate.ScientificName, ct);
            if (result.GbifTaxonKey is int key)
            {
                resolutions.Add((candidate, key, result.MatchType));
            }
            else
            {
                noMatchCount++;
            }
        }

        var overlaps = new List<PreflightOverlap>();

        // ── Intra-batch overlaps ──────────────────────────────────────────
        // Group by resolved key; any group of size > 1 with at least two
        // distinct scientific names (case-insensitive) is a taxon collision
        // inside the batch. Pure case variants of the same name are excluded
        // because they deduplicate at bulk-create via the LOWER functional
        // index (PR #81) — not a true overlap.
        var groups = resolutions
            .GroupBy(r => r.Key)
            .Where(g => g.Count() > 1);

        foreach (var group in groups)
        {
            var members = group.ToList();
            var distinctNames = members
                .Select(m => m.Candidate.ScientificName)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (distinctNames.Count < 2) continue; // pure case-variant — bulk-create handles it

            foreach (var member in members)
            {
                var partners = members
                    .Where(m => !ReferenceEquals(m.Candidate, member.Candidate))
                    .Select(m => $"Candidate={m.Candidate.ScientificName}")
                    .ToList();

                overlaps.Add(new PreflightOverlap(
                    CandidateScientificName: member.Candidate.ScientificName,
                    CandidateCategory: member.Candidate.Category,
                    ResolvedAcceptedKey: member.Key,
                    ResolvedMatchType: member.MatchType,
                    ConflictType: "intra_batch",
                    ConflictingPartner: string.Join(", ", partners),
                    SuggestedAction: "drop_candidate"));
            }
        }

        // ── DB-side overlaps ──────────────────────────────────────────────
        // Single bulk query: SELECT Id, ScientificName, GbifTaxonKey FROM
        // Plants WHERE GbifTaxonKey IN (resolvedKeys). The unique partial
        // index IX_Plants_GbifTaxonKey (filter "GbifTaxonKey IS NOT NULL")
        // means each key matches at most one row.
        if (resolutions.Count > 0)
        {
            var keys = resolutions.Select(r => r.Key).Distinct().ToList();
            var existing = await _db.Plants
                .AsNoTracking()
                .Where(p => p.GbifTaxonKey.HasValue && keys.Contains(p.GbifTaxonKey.Value))
                .Select(p => new { p.Id, p.ScientificName, GbifTaxonKey = p.GbifTaxonKey!.Value })
                .ToListAsync(ct);

            var existingByKey = existing.ToDictionary(e => e.GbifTaxonKey);

            foreach (var (candidate, key, matchType) in resolutions)
            {
                if (!existingByKey.TryGetValue(key, out var row)) continue;
                if (string.Equals(row.ScientificName, candidate.ScientificName, StringComparison.OrdinalIgnoreCase))
                {
                    // Same name and same key — that's the bulk-create dedup
                    // case (the row is already in the DB under this exact name).
                    // Not a taxon overlap; ScientificName-level dedup will Skip
                    // it at staging time.
                    continue;
                }

                overlaps.Add(new PreflightOverlap(
                    CandidateScientificName: candidate.ScientificName,
                    CandidateCategory: candidate.Category,
                    ResolvedAcceptedKey: key,
                    ResolvedMatchType: matchType,
                    ConflictType: "db_existing",
                    ConflictingPartner: $"Plant[{row.Id}]={row.ScientificName}",
                    SuggestedAction: "keep_and_merge_later"));
            }
        }

        _logger.LogInformation(
            "Bulk-import pre-flight: CandidateCount={CandidateCount} NoMatchCount={NoMatchCount} OverlapCount={OverlapCount}",
            candidateCount, noMatchCount, overlaps.Count);

        return new BulkImportPreflightResponse(candidateCount, noMatchCount, overlaps);
    }
}
