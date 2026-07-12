using SmartCrops.Core.Interfaces;

namespace SmartCrops.Api.Tests.Integration.Stubs;

/// <summary>
/// Deterministic <see cref="IEmailService"/> for integration tests (SMA-30).
/// The integration environment has no SMTP relay — with the production
/// service the contact endpoint would die on a TCP connect and the TestServer
/// would rethrow that into the test. Tests read <see cref="Sent"/> to assert
/// delivery and set <see cref="ThrowOnSend"/> to drive the controller's
/// failure mapping (relay down → 502).
/// </summary>
public class StubEmailService : IEmailService
{
    public sealed record SentEmail(
        string To,
        string Subject,
        string TextBody,
        string? ReplyToAddress,
        string? ReplyToName);

    public List<SentEmail> Sent { get; } = [];

    /// <summary>
    /// When <c>true</c>, <see cref="SendAsync"/> throws instead of capturing —
    /// nothing lands in <see cref="Sent"/>, mirroring a relay that never
    /// accepted the message.
    /// </summary>
    public bool ThrowOnSend { get; set; }

    public Task SendAsync(
        string toAddress,
        string subject,
        string textBody,
        string? replyToAddress = null,
        string? replyToName = null,
        CancellationToken ct = default)
    {
        if (ThrowOnSend)
            throw new InvalidOperationException("Stub SMTP failure");
        Sent.Add(new SentEmail(toAddress, subject, textBody, replyToAddress, replyToName));
        return Task.CompletedTask;
    }

    public void Reset()
    {
        Sent.Clear();
        ThrowOnSend = false;
    }
}
