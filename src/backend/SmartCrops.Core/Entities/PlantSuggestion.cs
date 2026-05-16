using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

public class PlantSuggestion : IHasUpdatedAt
{
    public Guid Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    /// <summary>
    /// Nullable — will be linked to an authenticated user once auth is implemented.
    /// </summary>
    public string? UserId { get; set; }

    /// <summary>
    /// Identifies which field the suggestion targets (e.g. "CommonName", "SunExposure").
    /// Kept as a string rather than an enum so new fields can be suggested without a migration.
    /// </summary>
    public required string FieldName { get; set; }

    /// <summary>
    /// ISO 639-1 / BCP 47 language code. Only relevant when FieldName targets a translated field.
    /// </summary>
    public string? Language { get; set; }

    public string? CurrentValue { get; set; }

    public required string SuggestedValue { get; set; }

    public string? Reason { get; set; }

    /// <summary>
    /// Workflow state: "Pending" | "Approved" | "Rejected".
    /// Stored as a string (not enum) so the UI can display and filter values without
    /// client-side enum synchronisation.
    /// </summary>
    public string Status { get; set; } = "Pending";

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public DateTime? ReviewedAt { get; set; }

    /// <summary>
    /// Identity of the admin who reviewed the suggestion.
    /// Nullable until a review has taken place.
    /// </summary>
    public string? ReviewedBy { get; set; }
}
