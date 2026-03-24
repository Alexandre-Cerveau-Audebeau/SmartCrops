using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using SmartCrops.Infrastructure;

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

// Skip DB init when no connection string is configured (e.g. unit test environments).
if (!string.IsNullOrEmpty(app.Configuration.GetConnectionString("DefaultConnection")))
    await app.Services.InitialiseDatabaseAsync();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => "ok");
app.MapControllers();

app.Run();

public partial class Program { }
