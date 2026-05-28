namespace SmartCrops.Core.Models;

/// <summary>
/// One page of the Perenual species catalog as exposed to admin clients
/// (SMA-13 batch 2 scale-up). Decoupled from the Infrastructure-side binding
/// (<c>PerenualSpeciesListResponse</c>) so the API layer depends only on Core
/// types — the catalog admin endpoint is a thin pass-through, but the project
/// pattern (PR #89 M1) keeps controllers off Infrastructure concrete classes.
///
/// <para>Pagination metadata is nullable to tolerate Perenual omitting fields
/// on edge responses (observed on empty result sets). The catalog fetcher
/// script reads <see cref="CurrentPage"/> + <see cref="LastPage"/> to decide
/// when to stop paginating.</para>
/// </summary>
/// <param name="Data">
/// One <see cref="PerenualCatalogPageEntry"/> per upstream species-list entry,
/// in upstream order. Empty list when the page is past <see cref="LastPage"/>.
/// </param>
public record PerenualCatalogPage(
    IReadOnlyList<PerenualCatalogPageEntry> Data,
    int? CurrentPage,
    int? PerPage,
    int? LastPage,
    int? Total,
    int? From,
    int? To);

/// <summary>
/// One Perenual species-list entry. Field set is the union of what the
/// resolver consumes (<see cref="Id"/>, <see cref="ScientificName"/>,
/// <see cref="CommonName"/>) and what the SMA-13 catalog fetcher needs to
/// apply Strategy A (<see cref="Cultivar"/>, <see cref="Variety"/>,
/// <see cref="Hybrid"/>, <see cref="Subspecies"/>) plus category-heuristic
/// signals (<see cref="Family"/>, <see cref="OtherName"/>).
/// </summary>
/// <param name="ScientificName">
/// Perenual returns this as an array of strings (most species have one entry,
/// cultivars and reclassifications can have multiple). The first entry is the
/// canonical name.
/// </param>
public record PerenualCatalogPageEntry(
    int Id,
    IReadOnlyList<string>? ScientificName,
    string? CommonName,
    IReadOnlyList<string>? OtherName,
    string? Family,
    string? Cultivar,
    string? Variety,
    string? Hybrid,
    string? Subspecies);
