using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SmartCrops.Api.Configuration;
using SmartCrops.Core.Entities;
using SmartCrops.Core.Interfaces;
using SmartCrops.Infrastructure;
using SmartCrops.Infrastructure.ExternalApis.Gbif;
using SmartCrops.Infrastructure.ExternalApis.Perenual;
using SmartCrops.Infrastructure.ExternalApis.Trefle;

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

builder.Services.AddHttpClient<GbifClient>((sp, client) =>
{
    var options = sp.GetRequiredService<IOptions<GbifOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.UserAgent.ParseAdd(options.UserAgent);
})
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
.AddStandardResilienceHandler();

builder.Services.AddSingleton<PerenualResolver>();
builder.Services.AddScoped<IPlantPerenualEnrichmentService, PlantPerenualEnrichmentService>();
builder.Services.AddScoped<IPerenualCatalogService, PerenualCatalogService>();

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
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => "ok");
app.MapControllers();

app.Run();

public partial class Program { }
