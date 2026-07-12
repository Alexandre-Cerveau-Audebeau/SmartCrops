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
    /// <summary>
    /// Wall-clock budget for the WHOLE SMTP sequence (Connect+Auth+Send) —
    /// the frontend's 15s abort (contactApi REQUEST_TIMEOUT_MS) is sized
    /// against this contract. MailKit's <c>Timeout</c> property is
    /// per-operation only, so it cannot bound the sequence by itself.
    /// </summary>
    private static readonly TimeSpan SendTimeout = TimeSpan.FromSeconds(10);

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

        // Wall-clock deadline over the whole sequence via a linked CTS; the
        // MailKit Timeout below stays as a per-operation socket guard (belt,
        // the CTS is the suspenders). Controller-side routing: if this
        // internal deadline fires, the caller's ct is NOT canceled, so the
        // OperationCanceledException falls into the generic catch → opaque
        // 502; a genuine client abort hits the existing rethrow filter.
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(SendTimeout);

        using var client = new SmtpClient { Timeout = 10000 };
        await client.ConnectAsync(smtp.Host, smtp.Port, SecureSocketOptions.SslOnConnect, cts.Token);
        await client.AuthenticateAsync(smtp.User, smtp.Password, cts.Token);
        await client.SendAsync(message, cts.Token);
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
