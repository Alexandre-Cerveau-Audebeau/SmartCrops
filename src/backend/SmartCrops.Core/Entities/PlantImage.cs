using SmartCrops.Core.Enums;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Core.Entities;

/// <summary>
/// A categorized image of a plant with full licensing metadata for attribution.
/// </summary>
public class PlantImage : IHasUpdatedAt
{
    public int Id { get; set; }

    public Guid PlantId { get; set; }
    public Plant Plant { get; set; } = null!;

    /// <summary>Categorization by what part of the plant the image shows.</summary>
    public PlantImageType ImageType { get; set; }

    /// <summary>Full-size image URL. Allowed up to 1000 chars (S3 pre-signed URLs can be long).</summary>
    public required string Url { get; set; }

    /// <summary>Optional thumbnail URL.</summary>
    public string? ThumbnailUrl { get; set; }

    public int? Width { get; set; }
    public int? Height { get; set; }

    /// <summary>License name (e.g. "CC BY-SA 4.0").</summary>
    public string? LicenseName { get; set; }

    /// <summary>URL of the license terms.</summary>
    public string? LicenseUrl { get; set; }

    /// <summary>Photographer / source credit string.</summary>
    public string? Credit { get; set; }

    /// <summary>Origin of this image record.</summary>
    public PlantSourceType Source { get; set; }

    /// <summary>External identifier from the source (e.g. Trefle photo ID).</summary>
    public string? SourceExternalId { get; set; }

    /// <summary>Lower numbers display first.</summary>
    public int DisplayOrder { get; set; }

    /// <summary>True if the image has been flagged for review (inappropriate, broken, etc.).</summary>
    public bool IsFlagged { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
