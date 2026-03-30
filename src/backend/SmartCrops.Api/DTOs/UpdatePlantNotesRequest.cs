using System.ComponentModel.DataAnnotations;

namespace SmartCrops.Api.DTOs;

public record UpdatePlantNotesRequest([MaxLength(500)] string? Notes);
