using System.ComponentModel.DataAnnotations;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

public class Garden : IHasUpdatedAt
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string UserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public int? LayoutWidth { get; set; }
    public int? LayoutHeight { get; set; }
    public string? CellSize { get; set; }
    public string? CellsJson { get; set; }

    // ── Exposure config (SMA-285 / SMA-17 engraved shadow model) ────────────
    // All nullable with NO database defaults: the app-level defaults
    // (hemisphere null -> 'N', latitudeBand null -> 'mid') are applied at READ
    // time by the future exposure engine (5.3-C), never stored.

    /// <summary>Canonical EN letter N|E|S|W (FR 'O' is UI-only).</summary>
    [StringLength(1)]
    public string? Orientation { get; set; }

    /// <summary>balcony | terrace | inground | greenhouse | indoor.</summary>
    [StringLength(20)]
    public string? GardenType { get; set; }

    /// <summary>JSON array of {start,end} "HH:mm" slots — indoor only.</summary>
    public string? LightScheduleJson { get; set; }

    /// <summary>N | S.</summary>
    [StringLength(1)]
    public string? Hemisphere { get; set; }

    /// <summary>low | mid | high.</summary>
    [StringLength(10)]
    public string? LatitudeBand { get; set; }

    public ICollection<GardenPlacement> Placements { get; set; } = [];
}
