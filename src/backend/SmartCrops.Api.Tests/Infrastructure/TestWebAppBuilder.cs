using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests.Infrastructure;

/// <summary>
/// Fluent builder that composes the <see cref="WebApplicationFactory{TEntryPoint}"/>
/// configuration each test class needs without each factory carrying the full
/// matrix of placeholder config keys for services it does not exercise.
///
/// <para><b>Background.</b> Every external-service options class registered with
/// <c>AddOptionsWithValidateOnStart</c> (today: <c>Trefle</c>; tomorrow: Perenual,
/// Pl@ntNet, …) forces a non-empty placeholder into the in-memory configuration of
/// every test factory at boot time. Without this builder, the matrix is O(services
/// × factories) — see issue #60 for the full history.</para>
///
/// <para><b>Design.</b> The builder is config-only by intent. Test doubles (stubs,
/// mocks, fakes) stay outside the builder and are wired through the
/// <see cref="WithServices(Action{IServiceCollection})"/> escape hatch in each
/// fixture. Two terminal methods cover the two consumption patterns observed in
/// the codebase: <see cref="ApplyTo(IWebHostBuilder)"/> for factories that inherit
/// <see cref="WebApplicationFactory{TEntryPoint}"/> and override
/// <see cref="WebApplicationFactory{TEntryPoint}.ConfigureWebHost"/>, and
/// <see cref="Build"/> for fixtures that own the factory lifecycle directly
/// (xUnit <see cref="IAsyncLifetime"/>, etc.).</para>
///
/// <para>No defaults are applied implicitly: a test class that needs a database
/// must call <see cref="WithConnectionString"/> or
/// <see cref="WithInMemoryDatabase"/> explicitly. Forgetting to opt in to a
/// required concern crashes the host at boot — the intended signal.</para>
/// </summary>
public sealed class TestWebAppBuilder
{
    private readonly Dictionary<string, string?> _config = new();
    private Action<IServiceCollection>? _serviceOverrides;
    private string? _environment;
    private bool _usesConnectionString;
    private bool _usesInMemoryDatabase;

    /// <summary>
    /// Sets the ASP.NET Core hosting environment (e.g. <c>"Development"</c>,
    /// <c>"Testing"</c>). The hosting environment gates conditional Program.cs
    /// branches such as the <c>DataSeeder</c> skip used by integration tests.
    /// </summary>
    public TestWebAppBuilder WithEnvironment(string env)
    {
        _environment = env;
        return this;
    }

    /// <summary>
    /// Registers JWT bearer placeholders (<c>Jwt:Key</c>, <c>Jwt:Issuer</c>,
    /// <c>Jwt:Audience</c>) under values that match the
    /// <c>GenerateToken</c> helpers used by the integration test classes — so
    /// tokens signed with the same constants validate against the host.
    /// </summary>
    public TestWebAppBuilder WithJwtAuth()
    {
        _config["Jwt:Key"] = "SmartCrops-Test-Secret-Key-Min32Characters!!";
        _config["Jwt:Issuer"] = "SmartCrops";
        _config["Jwt:Audience"] = "SmartCrops";
        return this;
    }

    /// <summary>
    /// Registers Google OAuth placeholders (<c>Google:ClientId</c>,
    /// <c>Google:ClientSecret</c>). Required for Program.cs <c>AddGoogle()</c>
    /// to bind at host boot, even when no test actually exercises Google sign-in.
    /// </summary>
    public TestWebAppBuilder WithGoogleOAuth()
    {
        _config["Google:ClientId"] = "test-client-id";
        _config["Google:ClientSecret"] = "test-client-secret";
        return this;
    }

    /// <summary>
    /// Registers <c>Frontend:BaseUrl</c>. Consumed by the CORS policy and the
    /// frontend redirect URLs.
    /// </summary>
    public TestWebAppBuilder WithFrontendUrl(string url = "http://localhost:3000")
    {
        _config["Frontend:BaseUrl"] = url;
        return this;
    }

    /// <summary>
    /// Registers <c>Trefle:Token</c>. <c>TrefleOptions.Token</c> is
    /// <c>[Required]</c> with an empty default and validated at host boot via
    /// <c>ValidateOnStart</c>; any non-empty placeholder keeps the host alive.
    /// Tests that mock <c>IPlantTrefleEnrichmentService</c> never actually read
    /// the token but still need this method called so the host boots.
    /// </summary>
    public TestWebAppBuilder WithTrefle(string token = "test-token")
    {
        _config["Trefle:Token"] = token;
        return this;
    }

    /// <summary>
    /// Currently a fluent no-op: <c>GbifOptions</c> has non-empty defaults for
    /// every <c>[Required]</c> property (<c>BaseUrl</c>, <c>UserAgent</c>) so
    /// the production defaults pass <c>ValidateOnStart</c> without per-test
    /// configuration. Present for symmetry with <see cref="WithTrefle"/> and to
    /// make tests' GBIF dependency explicit at the fluent-API level. Reserved
    /// for future GBIF options that may become test-required.
    /// </summary>
    public TestWebAppBuilder WithGbif() => this;

    /// <summary>
    /// Registers <c>Perenual:ApiKey</c>. <c>PerenualOptions.ApiKey</c> is
    /// <c>[Required]</c> with an empty default and validated at host boot via
    /// <c>ValidateOnStart</c>; any non-empty placeholder keeps the host alive.
    /// Tests that mock <c>IPlantPerenualEnrichmentService</c> never actually
    /// read the key but still need this method called so the host boots.
    /// </summary>
    public TestWebAppBuilder WithPerenual(string apiKey = "test-perenual-key")
    {
        _config["Perenual:ApiKey"] = apiKey;
        return this;
    }

    /// <summary>
    /// Registers <c>Typesense:ApiKey</c>. <c>TypesenseOptions.ApiKey</c> is
    /// <c>[Required]</c> with an empty default and validated at host boot via
    /// <c>ValidateOnStart</c>; any non-empty placeholder keeps the host alive.
    /// No test dials Typesense (the client is HTTP-lazy and only the admin
    /// reindex endpoint uses it), but every booting factory needs this method
    /// called so the host starts.
    /// </summary>
    public TestWebAppBuilder WithTypesense(string apiKey = "test-typesense-key")
    {
        _config["Typesense:ApiKey"] = apiKey;
        return this;
    }

    /// <summary>
    /// Registers <c>Smtp:Password</c>. <c>SmtpOptions.Password</c> is
    /// <c>[Required]</c> with an empty default and validated at host boot via
    /// <c>ValidateOnStart</c>; any non-empty placeholder keeps the host alive.
    /// Every other <c>SmtpOptions</c> property carries a real non-secret
    /// default, and tests swap <c>IEmailService</c> for a stub, so nothing
    /// ever dials the relay — but every booting factory needs this method
    /// called so the host starts.
    /// </summary>
    public TestWebAppBuilder WithSmtp(string password = "test-password")
    {
        _config["Smtp:Password"] = password;
        return this;
    }

    /// <summary>
    /// Registers <c>ConnectionStrings:DefaultConnection</c>. Use this for
    /// fixtures backed by a real database (e.g. Postgres Testcontainers).
    /// Mutually exclusive with <see cref="WithInMemoryDatabase"/>: calling
    /// both on the same builder throws <see cref="InvalidOperationException"/>
    /// so an ambiguous persistence intent fails fast at builder-time rather
    /// than silently picking one mode via DI Last-Win semantics.
    /// </summary>
    public TestWebAppBuilder WithConnectionString(string connectionString)
    {
        if (_usesInMemoryDatabase)
        {
            throw new InvalidOperationException(
                "WithConnectionString cannot be combined with WithInMemoryDatabase. " +
                "Choose one persistence mode per test factory.");
        }
        _usesConnectionString = true;
        _config["ConnectionStrings:DefaultConnection"] = connectionString;
        return this;
    }

    /// <summary>
    /// Replaces the production <see cref="SmartCropsDbContext"/> registration
    /// with an EF Core in-memory store under the given name.
    ///
    /// <para><b>Important.</b> xUnit runs test classes in parallel by default.
    /// Reusing the same <paramref name="databaseName"/> across multiple test
    /// classes causes state to bleed between parallel runs and produces
    /// non-deterministic failures. Convention: pass the test class's domain
    /// area (e.g. <c>"GardensTests"</c>, <c>"HealthTests"</c>).</para>
    ///
    /// <para><b>Does NOT preserve EF Core interceptors.</b> The production
    /// <c>AddDbContext</c> lambda attaches <c>UpdateTimestampInterceptor</c>;
    /// replacing the descriptor here drops that registration. Tests that need
    /// the interceptor must instead use <see cref="WithServices"/> with a
    /// custom <c>AddDbContext</c> lambda that re-attaches it.</para>
    /// </summary>
    /// <param name="databaseName">Unique-per-test-class database identifier.</param>
    public TestWebAppBuilder WithInMemoryDatabase(string databaseName = "TestDb")
    {
        if (_usesConnectionString)
        {
            throw new InvalidOperationException(
                "WithInMemoryDatabase cannot be combined with WithConnectionString. " +
                "Choose one persistence mode per test factory.");
        }
        _usesInMemoryDatabase = true;
        return WithServices(services =>
        {
            var descriptors = services
                .Where(d => d.ServiceType == typeof(DbContextOptions<SmartCropsDbContext>))
                .ToList();
            foreach (var descriptor in descriptors)
            {
                services.Remove(descriptor);
            }

            services.AddDbContext<SmartCropsDbContext>(options =>
            {
                options.UseInMemoryDatabase(databaseName);
            });
        });
    }

    /// <summary>
    /// Generic escape hatch for arbitrary <c>"Section:Key"</c> entries not
    /// covered by a dedicated <c>With*()</c> method. Prefer the dedicated
    /// method when one exists so the intent is visible at the call site.
    /// </summary>
    public TestWebAppBuilder WithConfig(string key, string? value)
    {
        _config[key] = value;
        return this;
    }

    /// <summary>
    /// Generic DI escape hatch for service registration overrides (stubs,
    /// fakes, additional interceptors, test-only singletons). Multiple calls
    /// accumulate — each <see cref="Action{IServiceCollection}"/> runs in the
    /// order it was registered.
    ///
    /// <para><b>Ordering contract.</b> <c>_serviceOverrides</c> chains via
    /// multicast delegate composition (<c>+=</c>): the first call sets it,
    /// subsequent calls append. When <see cref="ApplyTo"/> hands the combined
    /// delegate to <c>ConfigureTestServices</c>, ASP.NET invokes each
    /// component in registration order. Later registrations override earlier
    /// ones following standard DI Last-Win semantics. Callers chaining
    /// <see cref="WithInMemoryDatabase"/> followed by a custom
    /// <see cref="WithServices"/> that re-attaches interceptors get the
    /// intended order; the reverse would have the in-memory DB replace the
    /// interceptor-aware registration.</para>
    /// </summary>
    public TestWebAppBuilder WithServices(Action<IServiceCollection> configure)
    {
        _serviceOverrides += configure;
        return this;
    }

    /// <summary>
    /// Applies the accumulated configuration to an existing
    /// <see cref="IWebHostBuilder"/>. Call this from inside a custom
    /// <see cref="WebApplicationFactory{TEntryPoint}.ConfigureWebHost"/>
    /// override when the test class wraps the factory in its own subclass
    /// (e.g. to expose helper methods like <c>GenerateToken</c>).
    /// </summary>
    /// <example>
    /// <code>
    /// protected override void ConfigureWebHost(IWebHostBuilder builder)
    /// {
    ///     new TestWebAppBuilder()
    ///         .WithEnvironment("Development")
    ///         .WithJwtAuth()
    ///         .WithGoogleOAuth()
    ///         .WithFrontendUrl()
    ///         .WithTrefle()
    ///         .WithInMemoryDatabase("MyTests")
    ///         .ApplyTo(builder);
    /// }
    /// </code>
    /// </example>
    public void ApplyTo(IWebHostBuilder builder)
    {
        if (_environment is not null)
        {
            builder.UseEnvironment(_environment);
        }

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(_config);
        });

        if (_serviceOverrides is not null)
        {
            builder.ConfigureTestServices(_serviceOverrides);
        }
    }

    /// <summary>
    /// Builds a fully-configured <see cref="WebApplicationFactory{TEntryPoint}"/>
    /// in one call. Use this from fixtures that own the factory lifecycle
    /// directly (xUnit <see cref="IAsyncLifetime"/>, collection fixtures).
    /// </summary>
    public WebApplicationFactory<Program> Build()
    {
        return new WebApplicationFactory<Program>().WithWebHostBuilder(ApplyTo);
    }
}
