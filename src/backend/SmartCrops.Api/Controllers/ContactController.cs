using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using MimeKit;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure.Email;

namespace SmartCrops.Api.Controllers;

// The AllowedValues list is the mirror of the frozen frontend contract
// (constants/contactReasons.ts after SMA-161) — the backend list is the wire
// authority. Do NOT rename values.
public record ContactRequest(
    [Required, MaxLength(100)] string Name,
    [Required, EmailAddress, MaxLength(254)] string Email,
    [Required, AllowedValues("plant-data", "support", "partnership", "api", "privacy", "other")] string Reason,
    [MaxLength(200)] string? Subject,
    [Required, MaxLength(5000)] string Message);

/// <summary>
/// SMA-30: public contact-form endpoint. Validates the frozen Reason contract
/// server-side and relays the message to the configured recipient via the
/// transverse <see cref="IEmailService"/>. From is always the service
/// identity; the visitor's address rides in Reply-To (SPF/DMARC alignment +
/// anti-spoofing). Rate-limited per IP ("contact" policy) — the endpoint is
/// anonymous and fronts a paid-for relay.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class ContactController(
    IEmailService emailService,
    IOptions<SmtpOptions> smtpOptions,
    ILogger<ContactController> logger) : ControllerBase
{
    [HttpPost]
    [EnableRateLimiting("contact")]
    public async Task<IActionResult> Send([FromBody] ContactRequest request, CancellationToken ct)
    {
        // [EmailAddress] admits some strings MimeKit's strict addr-spec ctor
        // rejects (e.g. a space in the local part). The service builds the
        // Reply-To with that exact ctor, so pre-flight it here and return the
        // contract's 400 rather than a misleading 502 from inside the send.
        try
        {
            _ = new MailboxAddress(request.Name, request.Email);
        }
        catch (ParseException)
        {
            return BadRequest(new { error = "Invalid email address." });
        }

        var subject = $"[SmartCrops Contact] {request.Reason} — {request.Subject ?? "(no subject)"}";
        var textBody =
            $"Name: {request.Name}\n" +
            $"Email: {request.Email}\n" +
            $"Reason: {request.Reason}\n" +
            $"Subject: {request.Subject ?? "(no subject)"}\n" +
            $"Message:\n{request.Message}\n";

        try
        {
            await emailService.SendAsync(
                smtpOptions.Value.ContactRecipient,
                subject,
                textBody,
                replyToAddress: request.Email,
                replyToName: request.Name,
                ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Client aborted mid-send — not a delivery failure; rethrow so the
            // framework maps it instead of logging a false error + 502.
            throw;
        }
        catch (Exception ex)
        {
            // Delivery failure must not leak SMTP internals to an anonymous
            // caller — log server-side, return an opaque 502.
            logger.LogError(ex, "Contact-form email delivery failed");
            return StatusCode(502, new { error = "Email delivery failed." });
        }

        return NoContent();
    }
}
