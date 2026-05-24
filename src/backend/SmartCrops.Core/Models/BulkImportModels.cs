namespace SmartCrops.Core.Models;

/// <summary>
/// Bulk-import request envelope: a list of items to create as minimal
/// <see cref="Entities.Plant"/> rows.
/// </summary>
/// <param name="Items">
/// One entry per plant to create. Order is preserved in the response's
/// <c>FailedReasons</c> for diagnostic purposes, but is not significant for
/// dedup (the dedup check is global against the DB, not within the batch).
/// </param>
public record BulkImportRequest(IReadOnlyList<BulkImportItem> Items);

/// <summary>
/// One bulk-import item. Both fields are required from the caller's perspective:
/// <see cref="ScientificName"/> is the dedup key + EnrichAll resolution key, and
/// <see cref="PlantType"/> is the human-readable label (case-insensitive) looked
/// up against the seeded <c>PlantType</c> rows. No generic default exists for
/// <see cref="PlantType"/>: a null/blank value yields a per-item Failed in the
/// response rather than a silent fallback.
/// </summary>
public record BulkImportItem(string ScientificName, string? PlantType);

/// <summary>
/// Bulk-import result counts + per-item failure reasons. <see cref="Total"/>
/// equals <see cref="Created"/> + <see cref="Skipped"/> + <see cref="Failed"/>.
/// </summary>
/// <param name="Total">Number of items received (always <c>Items.Count</c>).</param>
/// <param name="Created">Items that were successfully inserted.</param>
/// <param name="Skipped">
/// Items whose <c>ScientificName</c> already existed in the DB. The existing
/// row is left untouched — bulk-create is additive, never destructive.
/// </param>
/// <param name="Failed">
/// Items rejected by validation (blank name, missing/unknown plant type) or by
/// an exception during the final <c>SaveChangesAsync</c>. See
/// <see cref="FailedReasons"/> for details, one line per failure.
/// </param>
/// <param name="FailedReasons">
/// One human-readable line per failed item, in the order failures were
/// encountered. Format: <c>"{scientificName}: {reason}"</c>. Empty list when
/// <see cref="Failed"/> is 0.
/// </param>
public record BulkImportResult(
    int Total,
    int Created,
    int Skipped,
    int Failed,
    List<string> FailedReasons);
