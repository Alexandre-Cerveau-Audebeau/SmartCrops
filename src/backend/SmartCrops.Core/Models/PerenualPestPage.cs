namespace SmartCrops.Core.Models;

/// <summary>
/// One page of the global Perenual pest/disease catalogue, mapped off the
/// Infrastructure binding so the API layer stays on Core (mirrors
/// <see cref="PerenualCatalogPage"/>). Returned by
/// <see cref="Interfaces.IPerenualPestCatalogService.GetPageAsync"/>; the service
/// returns <c>null</c> when the upstream page fails. <see cref="LastPage"/> drives
/// the harvest pagination loop.
/// </summary>
public record PerenualPestPage(
    int LastPage,
    IReadOnlyList<PerenualPestCatalogEntry> Items);

/// <summary>
/// A single pest/disease entry within a page. <see cref="LiteralJson"/> is the
/// verbatim, API-key-redacted upstream object (the loss-proof capture);
/// <see cref="PerenualPestId"/> is the natural upsert key.
/// </summary>
public record PerenualPestCatalogEntry(
    int PerenualPestId,
    string? CommonName,
    string? ScientificName,
    string LiteralJson);
