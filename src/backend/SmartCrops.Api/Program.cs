using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SmartCrops.Api.Configuration;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure;
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

// ── Rate limiting (SMA-30) ───────────────────────────────────────────────
// Built-in .NET 8 limiter, opt-in per endpoint via [EnableRateLimiting] — a
// global limiter would also throttle authenticated traffic. The "contact"
// policy shields the public unauthenticated POST /api/contact (and the paid
// SMTP relay behind it) from bursts. The IP partition keys on the direct peer
// (Connection.RemoteIpAddress); behind the future reverse proxy this needs
// UseForwardedHeaders — deliberately deferred to the OVH deployment ticket
// (SMA-41). Limits are config-driven so integration tests can pin them
// deterministically (RateLimiting:Contact:*).
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("contact", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue("RateLimiting:Contact:PermitLimit", 5),
                Window = TimeSpan.FromMinutes(builder.Configuration.GetValue("RateLimiting:Contact:WindowMinutes", 10)),
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

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Validate JWT configuration at startup.
var jwtConfig = app.Configuration.GetSection("Jwt");
var jwtKeyValue = jwtConfig["Key"];
var jwtIssuerValue = jwtConfig["Issuer"];
var jwtAudienceValue = jwtConfig["Audience"];
if (string.IsNullOrWhiteSpace(jwtKeyValue) || string.IsNullOrWhiteSpace(jwtIssuerValue) || string.IsNullOrWhiteSpace(jwtAudienceValue))
    throw new InvalidOperationException("Jwt settings (Key, Issuer, Audience) must all be configured.");
if (Encoding.UTF8.GetByteCount(jwtKeyValue) < 32)
    throw new InvalidOperationException("Jwt:Key must be at least 32 bytes for HS256.");

// Skip DB init when no connection string is configured (e.g. unit test environments)
// or when running under the "Testing" environment (integration tests apply migrations
// themselves via PostgresFixture and skip DataSeeder so the test DB stays deterministic).
if (!app.Environment.IsEnvironment("Testing")
    && !string.IsNullOrEmpty(app.Configuration.GetConnectionString("DefaultConnection")))
    await app.Services.InitialiseDatabaseAsync();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => "ok");
app.MapControllers();

app.Run();

public partial class Program { }
