using System.Net;
using System.Net.Http.Json;

namespace SmartCrops.Api.Tests.Integration.Endpoints;

/// <summary>
/// SMA-30 — <c>POST /api/contact</c> relays the message to the configured
/// recipient through the stubbed <c>IEmailService</c>: the visitor's address
/// must land in Reply-To (never in From), the frozen Reason contract is
/// enforced server-side, and a relay failure maps to an opaque 502. The
/// collection fixture pins the "contact" rate-limit high (PermitLimit 100) so
/// these functional tests never trip it — the 429 proof lives in
/// <c>ContactRateLimitTests</c> with its own factory.
/// </summary>
public class ContactControllerTests : IntegrationTestBase
{
    public ContactControllerTests(PostgresFixture fixture) : base(fixture) { }

    private static object ValidPayload(string? subject = "Seed swap?") => new
    {
        name = "Alex Gardener",
        email = "alex@example.com",
        reason = "plant-data",
        subject,
        message = "Hello — the Rosa canina sheet lists the wrong sowing window.",
    };

    [Fact]
    public async Task Post_ValidPayload_Returns204AndRelaysEmail()
    {
        var response = await Client.PostAsJsonAsync("/api/contact", ValidPayload());

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var sent = Assert.Single(Fixture.EmailStub.Sent);
        Assert.Equal("contact@smartcrops.fr", sent.To);
        Assert.Equal("alex@example.com", sent.ReplyToAddress);
        Assert.Equal("Alex Gardener", sent.ReplyToName);
        Assert.Contains("plant-data", sent.Subject);
        Assert.Contains("Seed swap?", sent.Subject);
        Assert.Contains("Alex Gardener", sent.TextBody);
        Assert.Contains("alex@example.com", sent.TextBody);
        Assert.Contains("wrong sowing window", sent.TextBody);
    }

    [Fact]
    public async Task Post_MissingRequiredFields_Returns400()
    {
        var response = await Client.PostAsJsonAsync("/api/contact", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(Fixture.EmailStub.Sent);
    }

    [Fact]
    public async Task Post_MalformedEmail_Returns400()
    {
        var response = await Client.PostAsJsonAsync("/api/contact", new
        {
            name = "Alex",
            email = "not-an-email",
            reason = "support",
            message = "Hello",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(Fixture.EmailStub.Sent);
    }

    [Fact]
    public async Task Post_EmailPassingAnnotationButNotAddrSpec_Returns400()
    {
        // "[EmailAddress]-valid" but rejected by MimeKit's strict addr-spec
        // ctor (space in the local part) — must map to 400, never 502.
        var response = await Client.PostAsJsonAsync("/api/contact", new
        {
            name = "Alex",
            email = "john smith@example.com",
            reason = "support",
            message = "Hello",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(Fixture.EmailStub.Sent);
    }

    [Fact]
    public async Task Post_ReasonOutsideContract_Returns400()
    {
        var response = await Client.PostAsJsonAsync("/api/contact", new
        {
            name = "Alex",
            email = "alex@example.com",
            reason = "spam",
            message = "Hello",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(Fixture.EmailStub.Sent);
    }

    [Fact]
    public async Task Post_SubjectOmitted_Returns204()
    {
        var response = await Client.PostAsJsonAsync("/api/contact", new
        {
            name = "Alex",
            email = "alex@example.com",
            reason = "other",
            message = "No subject here.",
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var sent = Assert.Single(Fixture.EmailStub.Sent);
        Assert.Contains("(no subject)", sent.Subject);
    }

    [Fact]
    public async Task Post_RelayFailure_Returns502WithOpaqueError()
    {
        Fixture.EmailStub.ThrowOnSend = true;

        var response = await Client.PostAsJsonAsync("/api/contact", ValidPayload());

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Email delivery failed.", body);
        Assert.DoesNotContain("Stub SMTP failure", body);
        Assert.Empty(Fixture.EmailStub.Sent);
    }
}
