using SmartCrops.Core.Enums;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

/// <summary>
/// Plant disease, pest, or pathogen record sourced primarily from Perenual.
/// Schema only in PR #57 — ETL ingestion lands in a later session and will follow
/// the dual-write rule established by ADR-0003.
/// </summary>
public class PlantPest : IHasUpdatedAt
{
    public int Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    /// <summary>Pest or disease name (e.g. "Aphids", "Powdery Mildew").</summary>
    public required string Name { get; set; }

    /// <summary>Classification (Disease / Insect / Fungus / Bacteria / etc.).</summary>
    public PlantPestType Type { get; set; }

    /// <summary>Short free-form description.</summary>
    public string? Description { get; set; }

    /// <summary>
    /// Observable symptoms. Perenual emits a numbered, newline-delimited list
    /// (e.g. <c>"1. Yellowing leaves\n2. Wilting"</c>); preserve the format verbatim
    /// so the UI can render it as a list without further parsing. Candidate for
    /// migration to a structured JSON schema once the ETL produces a stable shape.
    /// </summary>
    public string? Symptoms { get; set; }

    /// <summary>
    /// Suggested mitigations. Perenual splits this into "Cultural:" and "Chemical:"
    /// sections (newline-delimited, section header on its own line). Preserved
    /// verbatim for the same reason as <see cref="Symptoms"/>.
    /// </summary>
    public string? Solutions { get; set; }

    /// <summary>Illustrative image URL.</summary>
    public string? ImageUrl { get; set; }

    /// <summary>Source system identifier (e.g. "perenual").</summary>
    public required string Source { get; set; }

    /// <summary>
    /// External identifier from the source system (Perenual pest/disease id, etc.).
    /// Combined with <see cref="Source"/> in a partial unique index for ETL dedup.
    /// </summary>
    public string? SourceExternalId { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
