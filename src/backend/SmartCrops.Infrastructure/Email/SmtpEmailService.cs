using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using SmartCrops.Core.Interfaces;

namespace SmartCrops.Infrastructure.Email;

/// <summary>
/// MailKit-backed <see cref="IEmailService"/> for the OVH MX Plan relay
/// (SMA-30). OVH documents implicit TLS on port 465 only (no STARTTLS), which
/// the BCL SmtpClient cannot speak — hence MailKit. One connection per send:
/// the volume is tiny (contact form today, SMA-31 account emails tomorrow) and
/// a pooled connection would just go stale between sends. From is ALWAYS the
/// service identity; a visitor address only ever rides in Reply-To.
/// </summary>
public class SmtpEmailService(
    IOptions<SmtpOptions> options,
    ILogger<SmtpEmailService> logger) : IEmailService
{
    public async Task SendAsync(
        string toAddress,
        string subject,
        string textBody,
        string? replyToAddress = null,
        string? replyToName = null,
        CancellationToken ct = default)
    {
        var smtp = options.Value;

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(smtp.FromName, smtp.FromAddress));
        message.To.Add(MailboxAddress.Parse(toAddress));
        if (!string.IsNullOrWhiteSpace(replyToAddress))
            message.ReplyTo.Add(new MailboxAddress(replyToName, replyToAddress));
        message.Subject = subject;
        message.Body = new TextPart("plain") { Text = textBody };

        // 10s hard cap so a wedged relay surfaces as a fast 502 upstream
        // instead of pinning the request until Kestrel gives up.
        using var client = new SmtpClient { Timeout = 10000 };
        await client.ConnectAsync(smtp.Host, smtp.Port, SecureSocketOptions.SslOnConnect, ct);
        await client.AuthenticateAsync(smtp.User, smtp.Password, ct);
        await client.SendAsync(message, ct);
        try
        {
            await client.DisconnectAsync(true, CancellationToken.None);
        }
        catch (Exception ex)
        {
            // The relay already accepted the message: a failed QUIT must never
            // bubble up as a 502 and invite a duplicate resend. Best-effort only.
            logger.LogWarning(ex, "SMTP disconnect after successful send failed — ignored");
        }
    }
}
