using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Sockets;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SmartCrops.Api.Configuration;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure;
using SmartCrops.Infrastructure.Data;
using SmartCrops.Infrastructure.Email;
using SmartCrops.Infrastructure.ExternalApis.Gbif;
using SmartCrops.Infrastructure.ExternalApis.Logging;
using SmartCrops.Infrastructure.ExternalApis.Perenual;
using SmartCrops.Infrastructure.ExternalApis.Trefle;
using SmartCrops.Infrastructure.ExternalApis.SearchIndex;
using Typesense.Setup;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddInfrastructure(builder.Configuration);

var authBuilder = builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"] ?? string.Empty)),
        NameClaimType = JwtRegisteredClaimNames.Sub,
        // SMA-33: make the role claim type explicit so [Authorize(Roles = "Admin")]
        // reads the ClaimTypes.Role claims emitted by GenerateTokenResponse. This is
        // the framework default, but pinned here so a future NameClaimType tweak
        // can't silently break role authorization.
        RoleClaimType = ClaimTypes.Role,
    };
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            if (string.IsNullOrEmpty(context.Token)
                && context.Request.Cookies.TryGetValue("smartcrops_token", out var cookieToken))
            {
                context.Token = cookieToken;
            }
            return Task.CompletedTask;
        },
        OnTokenValidated = async context =>
        {
            var stamp = context.Principal?.FindFirstValue("security_stamp");
            if (stamp == null) return;

            var userId = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId == null) return;

            var um = context.HttpContext.RequestServices.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await um.FindByIdAsync(userId);
            if (user == null || user.SecurityStamp != stamp)
            {
                context.Fail("Security stamp mismatch");
            }
        },
    };
});

var googleClientId = builder.Configuration["Google:ClientId"];
var googleClientSecret = builder.Configuration["Google:ClientSecret"];
if (!string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret))
{
    authBuilder.AddGoogle(options =>
    {
        options.ClientId = googleClientId;
        options.ClientSecret = googleClientSecret;
    });
}

builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:3000", "http://localhost:5173"];
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// ── Rate limiting (SMA-30, SMA-323, SMA-341) ─────────────────────────────
// Built-in .NET 8 limiter, opt-in per endpoint via [EnableRateLimiting] — a
// global limiter would also throttle authenticated traffic. The "contact"
// policy shields the public unauthenticated POST /api/contact (and the paid
// SMTP relay behind it) from bursts. "passwordReset" (SMA-323) is a SISTER
// policy, deliberately NOT a reuse of "contact": a shared budget would let
// contact-form traffic consume a user's reset attempts at the exact moment
// they need them. "account" (SMA-341 R4) is a THIRD sister for the same
// reason, deliberately NOT a reuse of "passwordReset": the partition keys on
// IP + policy NAME, so a reuse would drain one bucket — a user who just
// reset their password has already spent up to three of its five permits
// (forgot + validate + reset) and would meet a 429 on their export. It
// throttles the two account endpoints: the export materializes every garden
// and serializes the whole graph per request (the documented buffering
// ceiling), which a valid session could otherwise drive in a loop; deletion
// is cheaper but a wrong-confirmation loop still pays a user lookup and the
// confirmation comparison per attempt — the transaction begins only once
// the confirmation matches. The IP partition keys on the
// direct peer (Connection.RemoteIpAddress); behind the future reverse proxy
// ALL THREE policies need UseForwardedHeaders — deliberately deferred to the
// OVH deployment ticket (SMA-41). Limits are config-driven so integration
// tests can pin them deterministically (RateLimiting:Contact:*,
// RateLimiting:PasswordReset:*, RateLimiting:Account:*).
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("contact", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            ClientIpPartition.FromContext(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue("RateLimiting:Contact:PermitLimit", 5),
                Window = TimeSpan.FromMinutes(builder.Configuration.GetValue("RateLimiting:Contact:WindowMinutes", 10)),
                QueueLimit = 0,
            }));
    options.AddPolicy("passwordReset", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            ClientIpPartition.FromContext(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue("RateLimiting:PasswordReset:PermitLimit", 5),
                Window = TimeSpan.FromMinutes(builder.Configuration.GetValue("RateLimiting:PasswordReset:WindowMinutes", 15)),
                QueueLimit = 0,
            }));
    // 10/10min: roomy enough that no legitimate journey can hit it (an export
    // or two, a mistyped deletion confirmation, a timeout retry), tight
    // enough that a scripted loop over the buffered export drops from
    // "unbounded" to one heavy serialization per minute sustained.
    options.AddPolicy("account", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            ClientIpPartition.FromContext(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue("RateLimiting:Account:PermitLimit", 10),
                Window = TimeSpan.FromMinutes(builder.Configuration.GetValue("RateLimiting:Account:WindowMinutes", 10)),
                QueueLimit = 0,
            }));
});

// ── External taxonomy API: GBIF ──────────────────────────────────────────
// Typed HttpClient with the .NET 8 standard resilience handler (retries +
// circuit breaker + timeout). Resolver is a Singleton — pure logic, no I/O,
// configured once from the bound options. Service is Scoped so it follows
// the EF Core scope per request.
// Public content-exposure policy (SMA-70): gates licensed Perenual source text
// out of the public detail response unless explicitly enabled. No validation
// attributes — a plain bool with a safe default (false).
builder.Services.AddOptions<ContentExposureOptions>()
    .Bind(builder.Configuration.GetSection(ContentExposureOptions.SectionName));

builder.Services.AddOptions<GbifOptions>()
    .Bind(builder.Configuration.GetSection(GbifOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

// SMA-104: the default IHttpClientFactory loggers emit the full request URI
// (incl. Perenual `key=` / Trefle `token=`) at Information level — a secret leak
// into stdout on a public repo. Replace them on every external client with a
// RedactingHttpClientLogger that scrubs the credential from the logged URI while
// keeping method/status/elapsed diagnostics. GBIF carries no secret, but is wired
// too for a single consistent log format and defence-in-depth.
builder.Services.AddSingleton<RedactingHttpClientLogger>();

builder.Services.AddHttpClient<GbifClient>((sp, client) =>
{
    var options = sp.GetRequiredService<IOptions<GbifOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.UserAgent.ParseAdd(options.UserAgent);
})
.RemoveAllLoggers()
.AddLogger<RedactingHttpClientLogger>()
.AddStandardResilienceHandler();

builder.Services.AddSingleton(sp =>
{
    var options = sp.GetRequiredService<IOptions<GbifOptions>>().Value;
    return new GbifDedupResolver(options.FuzzyConfidenceThreshold);
});

builder.Services.AddScoped<IPlantTaxonomyService, GbifPlantTaxonomyService>();

// ── External enrichment API: Trefle ──────────────────────────────────────
// Same shape as the GBIF block above: options validated at startup (a missing
// token fails the host boot, not the first call), typed HttpClient with the
// standard resilience handler, Singleton resolver (pure logic), Scoped
// service following the EF Core request scope.
builder.Services.AddOptions<TrefleOptions>()
    .Bind(builder.Configuration.GetSection(TrefleOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddHttpClient<TrefleClient>((sp, client) =>
{
    var options = sp.GetRequiredService<IOptions<TrefleOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.UserAgent.ParseAdd(options.UserAgent);
})
.RemoveAllLoggers()
.AddLogger<RedactingHttpClientLogger>()
.AddStandardResilienceHandler();

builder.Services.AddSingleton<TrefleResolver>();
builder.Services.AddScoped<IPlantTrefleEnrichmentService, TreflePlantEnrichmentService>();

// ── External enrichment API: Perenual ────────────────────────────────────
// Third external source, same shape as Trefle: options validated at startup
// (missing API key fails the host boot), typed HttpClient with the standard
// resilience handler, Singleton resolver (pure logic), Scoped enrichment
// service following the EF Core request scope. The ApiKey lands in URL
// query strings on every request (Perenual mandates ?key=...); operator
// must scrub HTTP access logs in non-dev environments.
builder.Services.AddOptions<PerenualOptions>()
    .Bind(builder.Configuration.GetSection(PerenualOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddHttpClient<PerenualClient>((sp, client) =>
{
    var options = sp.GetRequiredService<IOptions<PerenualOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.UserAgent.ParseAdd(options.UserAgent);
})
.RemoveAllLoggers()
.AddLogger<RedactingHttpClientLogger>()
// SMA-71: the pest-disease-list catalogue endpoint is slow (page 1 ≈ 6s) and
// large (pages up to ~850KB). The standard handler's defaults (AttemptTimeout
// 10s, TotalRequestTimeout 30s) cut page 1 to null → 502 → empty catalogue.
// Raise the ceilings so the harvest completes; these are upper bounds, not
// fixed waits, so the fast enrichment/search calls are unaffected. Constraints:
// TotalRequestTimeout > AttemptTimeout, and SamplingDuration >= 2×AttemptTimeout
// (else the options validator rejects the config at startup). HttpClient.Timeout
// (PerenualOptions.TimeoutSeconds, now 200s) must exceed TotalRequestTimeout or
// it would re-cut the pipeline early.
.AddStandardResilienceHandler(options =>
{
    options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(60);
    options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(180);
    options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(120);
});

builder.Services.AddSingleton<PerenualResolver>();
builder.Services.AddScoped<IPlantPerenualEnrichmentService, PlantPerenualEnrichmentService>();
builder.Services.AddScoped<IPerenualCatalogService, PerenualCatalogService>();
builder.Services.AddScoped<IPerenualPestCatalogService, PerenualPestCatalogService>();

// ── Search engine: Typesense (SMA-255) ───────────────────────────────────
// Options validated at startup (missing API key fails the host boot), same
// contract as Trefle/Perenual above. AddTypesenseClient consumes its Config at
// registration time and has no IServiceProvider overload, so the section is
// also bound manually here to feed the client; ValidateOnStart still guards
// the final configuration. The client is HTTP-lazy — nothing dials Typesense
// until an admin reindex call — so the API boots fine when the search
// container is down.
builder.Services.AddOptions<TypesenseOptions>()
    .Bind(builder.Configuration.GetSection(TypesenseOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

var typesenseOptions = new TypesenseOptions();
builder.Configuration.GetSection(TypesenseOptions.SectionName).Bind(typesenseOptions);
builder.Services.AddTypesenseClient(config =>
{
    config.ApiKey = typesenseOptions.ApiKey;
    config.Nodes = new List<Node>
    {
        new(typesenseOptions.Host, typesenseOptions.Port.ToString(System.Globalization.CultureInfo.InvariantCulture), typesenseOptions.Protocol),
    };
});

builder.Services.AddScoped<ISearchIndexingService, TypesenseSearchIndexingService>();
builder.Services.AddScoped<IPlantSearchService, TypesensePlantSearchService>();

// ── Transverse email: OVH SMTP via MailKit (SMA-30) ──────────────────────
// Options validated at startup (missing password fails the host boot), same
// contract as Trefle/Perenual/Typesense above. MailKit because OVH MX Plan
// documents implicit TLS on 465 only, which the BCL SmtpClient cannot speak.
// The service connects per send, so the API boots (and stays healthy) with
// the mail relay unreachable; delivery failures surface as 502 on the
// endpoints that send.
builder.Services.AddOptions<SmtpOptions>()
    .Bind(builder.Configuration.GetSection(SmtpOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddScoped<IEmailService, SmtpEmailService>();

// ── Frontend base URL (SMA-31 R2) ────────────────────────────────────────
// Confirmation links depend on it, and the send path wraps its resolution in a
// catch-all — so a missing value outside Development must fail the boot (same
// pattern as SmtpOptions above), not degrade into "delivery failed" log noise.
// Development keeps the localhost fallback in AuthController.ResolveFrontendBaseUrl,
// hence no ValidateOnStart there.
var frontendOptions = builder.Services.AddOptions<FrontendOptions>()
    .Bind(builder.Configuration.GetSection(FrontendOptions.SectionName));
if (!builder.Environment.IsDevelopment())
{
    frontendOptions
        .ValidateDataAnnotations()
        // [Required] alone lets "not-a-url" through, and [Url] is too weak to be
        // worth adding (it admits ftp:// and non-absolute oddities). Emitted links
        // concatenate "{BaseUrl}/confirm-email", so the value must be an absolute
        // http(s) URI carrying no query and no fragment — anything past
        // authority+path would land INSIDE the appended segment and break the
        // link ("https://app/?tenant=1" + "/confirm-email" is not a valid URL,
        // R4). A trailing slash is the one tolerated oddity, trimmed at the
        // consumer (AuthController.ResolveFrontendBaseUrl).
        .Validate(
            o => Uri.TryCreate(o.BaseUrl, UriKind.Absolute, out var uri)
                && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
                && string.IsNullOrEmpty(uri.Query)
                && string.IsNullOrEmpty(uri.Fragment),
            "Frontend:BaseUrl must be an absolute http(s) URL with no query string and no fragment.")
        .ValidateOnStart();
}

// SMA-41 — durable Data Protection ring, config-gated. Without persisted keys
// every redeploy rotates the ring and silently invalidates every confirmation
// and reset token in flight; the application discriminator pins the key
// purpose across container rebuilds. Configured at OPTIONS-RESOLUTION time,
// not eagerly: the test factory delivers configuration after Program.cs's
// inline code has run (minimal-hosting caveat), while production env vars are
// visible either way — the same reason every other config read in this file
// sits inside a lambda. With no path configured (dev, tests) neither option
// is touched and the framework's ephemeral defaults stay exactly as before.
// Lot 2 mounts the named volume and sets the path.
builder.Services.AddOptions<DataProtectionOptions>().Configure<IConfiguration>((options, config) =>
{
    if (!string.IsNullOrWhiteSpace(config["DataProtection:KeysPath"]))
    {
        options.ApplicationDiscriminator = "SmartCrops";
    }
});
builder.Services.AddOptions<KeyManagementOptions>().Configure<IConfiguration, ILoggerFactory>((options, config, loggerFactory) =>
{
    var keysPath = config["DataProtection:KeysPath"];
    if (!string.IsNullOrWhiteSpace(keysPath))
    {
        // These options resolve AT BOOT (forced resolution after the JWT
        // guard), so this probe IS the boot gate: CreateDirectory alone
        // accepts an existing-but-unwritable mounted volume, and Protect can
        // succeed without writing when a valid key already exists — the
        // write/delete probe makes a read-only keys path die at startup, not
        // at the first token write.
        try
        {
            Directory.CreateDirectory(keysPath);
            var probePath = Path.Combine(keysPath, ".write-probe-" + Guid.NewGuid().ToString("N"));
            try
            {
                File.WriteAllText(probePath, "");
            }
            finally
            {
                if (File.Exists(probePath))
                {
                    File.Delete(probePath);
                }
            }
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                $"DataProtection:KeysPath '{keysPath}' is not usable (not creatable or not writable).", ex);
        }

        options.XmlRepository = new FileSystemXmlRepository(new DirectoryInfo(keysPath), loggerFactory);
    }
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Validate JWT configuration at startup.
var jwtConfig = app.Configuration.GetSection("Jwt");
var jwtKeyValue = jwtConfig["Key"];
var jwtIssuerValue = jwtConfig["Issuer"];
var jwtAudienceValue = jwtConfig["Audience"];
if (string.IsNullOrWhiteSpace(jwtKeyValue) || string.IsNullOrWhiteSpace(jwtIssuerValue) || string.IsNullOrWhiteSpace(jwtAudienceValue))
{
    // SMA-355: name each missing member WITH where it lives, so the failure
    // explains itself — Jwt:Key deliberately exists in no tracked file, while
    // Issuer/Audience ship in appsettings.json.
    var missing = new[]
    {
        string.IsNullOrWhiteSpace(jwtKeyValue)
            ? "Jwt:Key (local dev: set Jwt__Key in docker-compose.override.yml, gitignored — the key is intentionally absent from tracked files)"
            : null,
        string.IsNullOrWhiteSpace(jwtIssuerValue)
            ? "Jwt:Issuer (ships in appsettings.json; if an override blanked it, set Jwt__Issuer in the environment)"
            : null,
        string.IsNullOrWhiteSpace(jwtAudienceValue)
            ? "Jwt:Audience (ships in appsettings.json; if an override blanked it, set Jwt__Audience in the environment)"
            : null,
    }.Where(m => m is not null);
    throw new InvalidOperationException(
        $"Missing JWT configuration: {string.Join("; ", missing)}.");
}
if (Encoding.UTF8.GetByteCount(jwtKeyValue) < 32)
    throw new InvalidOperationException("Jwt:Key must be at least 32 bytes for HS256.");

// SMA-328 R1 — force the Data Protection key ring options to materialize AT
// BOOT: an unwritable DataProtection:KeysPath must kill the boot, not the
// first login that needs a protector. Harmless when KeysPath is blank — the
// framework's ephemeral defaults resolve without touching the filesystem.
_ = app.Services.GetRequiredService<IOptions<KeyManagementOptions>>().Value;

// DB init runs when ANY database source is configured — the gate consults the
// SAME predicate as the resolver (SMA-328 R3), so discrete Database:*
// deployments now RUN boot-time migrations (the ratified production path)
// instead of silently skipping them. Absent config keeps the deliberate
// test-host skip (unit test environments boot no database). An INCOMPLETE
// discrete config (Host without User/Password) passes this presence-only gate
// and dies AT BOOT on the resolver's named errors — the fail-fast upgrade
// comes free. "Testing" keeps its explicit skip: integration tests apply
// migrations themselves via PostgresFixture and skip DataSeeder so the test
// DB stays deterministic.
if (!app.Environment.IsEnvironment("Testing")
    && ConnectionStringResolver.IsConfigured(app.Configuration))
    await app.Services.InitialiseDatabaseAsync();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// SMA-328 / SMA-41 — trusted proxy boundary, config-gated, FIRST in the
// pipeline. When any ForwardedHeaders entry is configured, X-Forwarded-For /
// X-Forwarded-Proto from that proxy are honored: after this middleware,
// Connection.RemoteIpAddress holds the REAL client (feeding the rate-limit
// partitions above) and Request.Scheme the real scheme — which also repairs
// the Google OAuth redirect URI and lets auth cookies be Secure behind TLS
// termination. With no entries configured (dev, tests), nothing is registered
// and the direct peer stays authoritative — today's behavior, unchanged.
var forwardedKnownNetworks = app.Configuration.GetSection("ForwardedHeaders:KnownNetworks").Get<string[]>() ?? [];
var forwardedKnownProxies = app.Configuration.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [];
if (forwardedKnownNetworks.Length > 0 || forwardedKnownProxies.Length > 0)
{
    var forwardedOptions = new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
        // ONE trusted hop (the single Traefik in front of the API) — a longer
        // proxy chain must be configured consciously, never inherited.
        ForwardLimit = 1,
    };
    // The framework seeds KnownProxies/KnownNetworks with loopback; an
    // implicit trust anchor is exactly what the deployment gate forbids.
    // Clearing BOTH lists first is the fix, not an oversight: the ONLY
    // trusted sources are the explicitly configured ones.
    forwardedOptions.KnownNetworks.Clear();
    forwardedOptions.KnownProxies.Clear();
    foreach (var cidr in forwardedKnownNetworks)
    {
        var parts = cidr.Split('/');
        // Both TryParse calls succeeding is not enough: "172.28.0.0/999"
        // would die in the IPNetwork ctor as a generic
        // ArgumentOutOfRangeException naming nothing. Bounding the prefix
        // here keeps the failure inside OUR exception, which names the entry.
        if (parts.Length != 2
            || !IPAddress.TryParse(parts[0], out var networkAddress)
            || !int.TryParse(parts[1], out var prefixLength)
            || prefixLength < 0
            || prefixLength > (networkAddress.AddressFamily == AddressFamily.InterNetwork ? 32 : 128))
        {
            // Fail-fast at boot, same philosophy as the JWT guard: a half
            // -trusted proxy boundary is worse than no boot.
            throw new InvalidOperationException(
                $"ForwardedHeaders:KnownNetworks entry '{cidr}' is not a valid CIDR (expected e.g. \"172.28.0.0/16\").");
        }
        forwardedOptions.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(networkAddress, prefixLength));
    }
    foreach (var proxy in forwardedKnownProxies)
    {
        if (!IPAddress.TryParse(proxy, out var proxyAddress))
        {
            throw new InvalidOperationException(
                $"ForwardedHeaders:KnownProxies entry '{proxy}' is not a valid IP address.");
        }
        forwardedOptions.KnownProxies.Add(proxyAddress);
    }
    app.UseForwardedHeaders(forwardedOptions);
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => "ok");
app.MapControllers();

app.Run();

public partial class Program { }
