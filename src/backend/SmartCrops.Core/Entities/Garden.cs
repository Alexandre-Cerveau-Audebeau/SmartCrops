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

    // ── Location (SMA-336 PR 3a/5) ──────────────────────────────────────────
    // Six nullable columns with NO database defaults, the same doctrine as the
    // exposure block above: NULL everywhere IS the « not located » state. These
    // columns are the garden's OWN location — an override. A garden that has
    // none inherits the account's default (ApplicationUser.Location*) at READ
    // time, through GeoLocation.From(garden) ?? GeoLocation.From(user), and
    // never stores a copy of it (ADR-0006).
    //
    // The time zone is deliberately NOT persisted: the weather provider returns
    // it with every forecast, next to the place's local time, so a stored copy
    // would only ever be read when there is nothing to display anyway. Lengths
    // and the range / pair CHECK constraints live in GardenConfiguration.

    /// <summary>Normalized place name as the geocoder returned it (« Lyon »).</summary>
    public string? LocationName { get; set; }

    /// <summary>Region or state (« Auvergne-Rhône-Alpes »), for disambiguation on screen.</summary>
    public string? LocationRegion { get; set; }

    /// <summary>
    /// Country NAME as the geocoder returned it (« France ») — never an ISO
    /// code: the provider's search endpoint sends none.
    /// </summary>
    public string? LocationCountry { get; set; }

    /// <summary>
    /// Decimal degrees, −90..90 (<c>CK_Gardens_Latitude_Range</c>). Set and
    /// cleared TOGETHER with <see cref="Longitude"/> (<c>CK_Gardens_Location_Pair</c>).
    /// </summary>
    public double? Latitude { get; set; }

    /// <summary>Decimal degrees, −180..180 (<c>CK_Gardens_Longitude_Range</c>).</summary>
    public double? Longitude { get; set; }

    /// <summary>
    /// UTC instant the location was resolved (ADR-0001). Stamped explicitly by
    /// the writer — <c>UpdateTimestampInterceptor</c> only touches
    /// <see cref="UpdatedAt"/>.
    /// </summary>
    public DateTime? LocationResolvedAt { get; set; }

    // ── The Gardens widget's settings (SMA-448, lot F5-a) ───────────────────
    // Two nullable columns with NO database defaults, the doctrine of the two
    // blocks above: NULL IS the « never » state. Neither is ever written by a
    // tracked entity — <c>UpdateTimestampInterceptor</c> stamps <see cref="UpdatedAt"/>
    // on every Modified <see cref="IHasUpdatedAt"/>, and « dernière
    // modification » must stay true — so both are written by set-based SQL
    // (<c>ExecuteUpdateAsync</c>, a raw UPDATE), the way the formula is
    // (<c>FormulasController</c>). Decided by Alexandre on 28/09 (SMA-448,
    // pre-flight F5 § C.1, § C.2, § C.5; contract v3 A-N5, A-N6).

    /// <summary>
    /// UTC instant the planner was last opened on this garden — ONE stamp, no
    /// history (A-N6). Null: never opened since the column exists; the
    /// « Derniers ouverts » sort then falls back on <see cref="UpdatedAt"/>.
    /// Written by <c>POST /api/gardens/{id}/open</c> alone, never by a GET.
    /// Exported with the account's data (art. 20) and deleted with it.
    /// </summary>
    public DateTime? LastOpenedAt { get; set; }

    /// <summary>
    /// The garden's place in the account's CUSTOM order (A-N5), 0-based,
    /// non-negative (<c>CK_Gardens_SortOrder_NonNegative</c>). Null: not yet
    /// ranked — a garden created after the order was set, which the client
    /// puts at the HEAD without any write. Relative, not dense: gaps do not
    /// matter, and a deleted garden leaves with its row. Written by
    /// <c>PUT /api/gardens/order</c> alone, under the account's formula lock.
    /// A property of the garden, not of a formula's layout: it survives a
    /// switch of formula and « Réinitialiser » alike.
    /// </summary>
    public int? SortOrder { get; set; }

    public ICollection<GardenPlacement> Placements { get; set; } = [];
}
