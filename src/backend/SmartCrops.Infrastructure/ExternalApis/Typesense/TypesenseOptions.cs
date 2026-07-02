using System.ComponentModel.DataAnnotations;

namespace SmartCrops.Infrastructure.ExternalApis.Typesense;

/// <summary>
/// Connection settings for the Typesense search engine (SMA-255). Non-secret
/// defaults target the docker-compose service (<c>typesense:8108</c>, plain
/// http on the internal compose network). <see cref="ApiKey"/> is deliberately
/// empty in source and in appsettings — it must come from the environment
/// (<c>Typesense__ApiKey</c>, supplied by the gitignored
/// docker-compose.override.yml), mirroring the Perenual/Trefle secret pattern.
/// </summary>
public class TypesenseOptions
{
    public const string SectionName = "Typesense";

    [Required]
    public string Host { get; set; } = "typesense";

    [Range(1, 65535)]
    public int Port { get; set; } = 8108;

    [Required]
    public string Protocol { get; set; } = "http";

    [Required]
    public string ApiKey { get; set; } = string.Empty;
}
