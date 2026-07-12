using System.ComponentModel.DataAnnotations;

namespace SmartCrops.Infrastructure.Email;

/// <summary>
/// Connection settings for the transverse SMTP email service (SMA-30; shared
/// with the future confirmation/reset emails — SMA-31). Non-secret defaults
/// target the OVH MX Plan outgoing server (<c>ssl0.ovh.net:465</c>, implicit
/// TLS). <see cref="Password"/> is deliberately empty in source and in
/// appsettings — it must come from the environment (<c>Smtp__Password</c>,
/// supplied by the gitignored docker-compose.override.yml) or
/// <c>dotnet user-secrets</c> (<c>Smtp:Password</c>) locally; an empty value
/// fails the host boot via <c>ValidateOnStart</c>, mirroring the
/// Typesense/Trefle secret pattern.
/// </summary>
public class SmtpOptions
{
    public const string SectionName = "Smtp";

    [Required]
    public string Host { get; set; } = "ssl0.ovh.net";

    [Range(1, 65535)]
    public int Port { get; set; } = 465;

    [Required]
    public string User { get; set; } = "no-reply@smartcrops.fr";

    [Required]
    public string Password { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    public string FromAddress { get; set; } = "no-reply@smartcrops.fr";

    [Required]
    public string FromName { get; set; } = "SmartCrops";

    /// <summary>
    /// App-level recipient of contact-form messages (SMA-30). Kept in the
    /// single email config section rather than a per-feature one so every
    /// mail-related knob lives under <c>Smtp</c>.
    /// </summary>
    [Required]
    [EmailAddress]
    public string ContactRecipient { get; set; } = "contact@smartcrops.fr";
}
