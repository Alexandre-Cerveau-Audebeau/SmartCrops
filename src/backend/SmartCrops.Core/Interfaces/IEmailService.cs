namespace SmartCrops.Core.Interfaces;

/// <summary>
/// Transverse outbound-email contract (SMA-30). Carrier-agnostic; the SMTP
/// implementation lives in Infrastructure. Deliberately not contact-form
/// specific so the future confirmation/reset emails (SMA-31) reuse it.
/// </summary>
public interface IEmailService
{
    /// <summary>
    /// Sends a plain-text email from the configured service identity. The
    /// optional reply-to lets user-facing flows (contact form) route replies
    /// to the visitor without ever putting an external address in From
    /// (SPF/DMARC alignment; prevents spoofing on our own domain).
    /// </summary>
    Task SendAsync(
        string toAddress,
        string subject,
        string textBody,
        string? replyToAddress = null,
        string? replyToName = null,
        CancellationToken ct = default);
}
