namespace SmartCrops.Core.Models;

/// <summary>
/// One candidate row submitted to the pre-flight overlap check. Mirrors the
/// minimum information that the curated CSV carries before staging
/// (<c>scientificName</c>, optional <c>category</c>): the pre-flight is run
/// against the same input the caller would feed to <c>POST /api/admin/bulk-import</c>,
/// so the same rows can be re-submitted unchanged once overlaps are resolved.
/// </summary>
/// <param name="ScientificName">
/// The candidate's scientific name — same field used by bulk-create as the
/// dedup key and the GBIF resolution key. Trimmed by the service; blank
/// values are skipped from the overlap checks (the curator gets a count, but
/// no overlap rows for them).
/// </param>
/// <param name="Category">
/// Optional caller-supplied category label (e.g. <c>"vegetable"</c>). Not
/// inspected by the pre-flight; carried through to the response so the
/// curator can correlate overlaps back to the source CSV row. The bulk-create
/// endpoint maps category → <c>PlantType</c> at the call site; the pre-flight
/// does not validate against <c>PlantType</c> because overlap detection is
/// taxonomy-only (DB <c>GbifTaxonKey</c> match) and category-independent.
/// </param>
public record PreflightCandidate(string ScientificName, string? Category);

/// <summary>
/// Pre-flight request envelope: a list of candidates to cross-check against
/// GBIF + the live <c>Plants</c> table for <c>GbifTaxonKey</c> overlaps before
/// they are staged via bulk-create.
/// </summary>
/// <param name="Candidates">
/// One entry per candidate row. Order is preserved when producing
/// <see cref="BulkImportPreflightResponse.Overlaps"/>. The service applies a
/// max-size cap (<see cref="MaxCandidates"/>) to keep the synchronous
/// round-trip bounded — clients chunk batches above the cap.
/// </param>
public record BulkImportPreflightRequest(IReadOnlyList<PreflightCandidate> Candidates)
{
    /// <summary>
    /// Per-request cap on candidate count. Chosen to keep a single synchronous
    /// pre-flight round-trip under the GBIF rate-limit budget and avoid
    /// pathological request payloads. Clients chunk larger batches (the
    /// PowerShell client defaults to chunks of 250). Lives on the request
    /// record (Core) so the API controller can enforce the cap without taking
    /// a dependency on the Infrastructure service class.
    /// </summary>
    public const int MaxCandidates = 500;
}

/// <summary>
/// One detected overlap between a candidate and either an existing
/// <c>Plant</c> row (<c>db_existing</c>) or another candidate in the same
/// batch (<c>intra_batch</c>). Pure diagnostic record; the pre-flight does not
/// mutate anything and the curator decides per row whether to drop the
/// candidate, rename it, accept the collision knowingly, or plan a merge.
/// </summary>
/// <param name="CandidateScientificName">
/// The candidate row's <c>ScientificName</c> as submitted (trimmed). Echoed
/// verbatim so the curator can find the source CSV row.
/// </param>
/// <param name="CandidateCategory">
/// The candidate row's <c>Category</c> as submitted (may be <c>null</c>).
/// </param>
/// <param name="ResolvedAcceptedKey">
/// The GBIF accepted-taxon key the candidate resolves to. Same algorithm as
/// the runtime enrichment path (<c>GbifDedupResolver</c>):
/// <c>EXACT/FUZZY ≥ threshold → AcceptedUsageKey ?? SpeciesKey ?? UsageKey</c>,
/// <c>HIGHERRANK → alternatives[SPECIES].SpeciesKey</c>. Stored on
/// <c>Plant.GbifTaxonKey</c> as <c>int?</c>; non-null here because overlaps
/// are only produced for candidates that resolved.
/// </param>
/// <param name="ResolvedMatchType">
/// GBIF <c>matchType</c> (<c>EXACT</c>, <c>FUZZY</c>, <c>HIGHERRANK</c>) for
/// audit. <c>NONE</c> never appears here — those candidates are counted in
/// <see cref="BulkImportPreflightResponse.NoMatchCount"/> and excluded from
/// the overlap checks.
/// </param>
/// <param name="ConflictType">
/// <c>"db_existing"</c> — the resolved key already lives on a <c>Plant</c>
/// row whose <c>ScientificName</c> differs from the candidate's (case-
/// insensitive). <c>"intra_batch"</c> — at least one other candidate in the
/// same request resolved to the same key.
/// </param>
/// <param name="ConflictingPartner">
/// Human-readable identifier of the other side of the conflict:
/// <c>"Plant[{Id}]={ScientificName}"</c> for <c>db_existing</c>, or a
/// comma-separated list of <c>"Candidate={ScientificName}"</c> entries for
/// <c>intra_batch</c>. Intended for diagnostic surfacing only — clients
/// should not parse this field structurally.
/// </param>
/// <param name="SuggestedAction">
/// Indicative label (<c>drop_candidate</c>, <c>replace_existing_name</c>,
/// <c>keep_and_merge_later</c>, <c>accept_collision</c>). The pre-flight
/// applies no automatic resolution; this is a starting point for the curator's
/// review, not a binding decision.
/// </param>
public record PreflightOverlap(
    string CandidateScientificName,
    string? CandidateCategory,
    int ResolvedAcceptedKey,
    string ResolvedMatchType,
    string ConflictType,
    string ConflictingPartner,
    string SuggestedAction);

/// <summary>
/// Pre-flight response: per-batch counters plus the full list of detected
/// overlaps. An empty <see cref="Overlaps"/> list means the batch is safe to
/// submit to <c>POST /api/admin/bulk-import</c> as far as
/// <c>GbifTaxonKey</c> uniqueness is concerned. A non-empty list means the
/// curator must edit the candidate set (drop / rename / plan a merge) before
/// staging.
/// </summary>
/// <param name="CandidateCount">
/// Number of candidates received (after trimming, before any filtering).
/// Equal to <c>Candidates.Count</c>.
/// </param>
/// <param name="NoMatchCount">
/// Candidates GBIF could not resolve to an accepted key (<c>matchType=NONE</c>
/// or sub-threshold <c>FUZZY</c>). These are excluded from the overlap checks
/// — a NoMatch candidate cannot collide on <c>GbifTaxonKey</c> by definition —
/// but the count is surfaced so the curator can investigate spelling /
/// taxonomy issues before the batch hits enrichment.
/// </param>
/// <param name="Overlaps">
/// One <see cref="PreflightOverlap"/> per (candidate, conflict-source) pair.
/// A candidate participating in both an intra-batch group and a DB-side
/// match yields one row per conflict source.
/// </param>
public record BulkImportPreflightResponse(
    int CandidateCount,
    int NoMatchCount,
    IReadOnlyList<PreflightOverlap> Overlaps);
