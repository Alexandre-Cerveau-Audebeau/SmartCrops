namespace SmartCrops.Api.DTOs;

/// <summary>
/// SMA-414 — page envelope for offset-paged listings. <see cref="Page"/> is
/// 1-based; <see cref="Total"/> is the unfiltered row count so the client can
/// derive the page count. Introduced with the admin users listing — the first
/// locally paged endpoint in the API.
/// </summary>
public record PagedResponse<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int Total);
