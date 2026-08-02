using Microsoft.Extensions.Configuration;
using Npgsql;
using SmartCrops.Infrastructure.Data;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-41 — the two-path connection-string resolver: discrete credentials go
/// through NpgsqlConnectionStringBuilder (reserved characters in the password
/// survive a round-trip), and the classic DefaultConnection path is
/// byte-for-byte unchanged, exception message included.
/// </summary>
public class ConnectionStringResolverTests
{
    private static IConfiguration Config(params (string Key, string? Value)[] entries) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(entries.ToDictionary(e => e.Key, e => e.Value))
            .Build();

    [Fact]
    public void DiscreteCredentials_HostilePassword_SurvivesRoundTrip()
    {
        // ';' splits Npgsql options, quotes break naive quoting — the exact
        // characters a generated production password may contain.
        var hostilePassword = "p;a's\"b";
        Assert.Contains(";", hostilePassword);
        Assert.Contains("'", hostilePassword);
        Assert.Contains("\"", hostilePassword);

        var result = ConnectionStringResolver.Resolve(Config(
            ("Database:Host", "dbhost"),
            ("Database:User", "u"),
            ("Database:Password", hostilePassword)));

        var parsed = new NpgsqlConnectionStringBuilder(result);
        Assert.Equal("dbhost", parsed.Host);
        Assert.Equal(hostilePassword, parsed.Password);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("65536")]
    public void OutOfRangePort_Throws_NamingTheRawValue(string portRaw)
    {
        var ex = Assert.Throws<InvalidOperationException>(
            () => ConnectionStringResolver.Resolve(Config(
                ("Database:Host", "dbhost"),
                ("Database:Port", portRaw),
                ("Database:User", "u"),
                ("Database:Password", "p"))));

        Assert.Equal($"Database:Port value '{portRaw}' is out of range (1-65535).", ex.Message);
    }

    [Fact]
    public void HostWithoutUser_Throws_NamingTheUserKey()
    {
        var ex = Assert.Throws<InvalidOperationException>(
            () => ConnectionStringResolver.Resolve(Config(
                ("Database:Host", "dbhost"))));

        Assert.Contains("Database:User", ex.Message);
    }

    [Fact]
    public void HostAndUserWithoutPassword_Throws_NamingThePasswordKey()
    {
        var ex = Assert.Throws<InvalidOperationException>(
            () => ConnectionStringResolver.Resolve(Config(
                ("Database:Host", "dbhost"),
                ("Database:User", "u"))));

        Assert.Contains("Database:Password", ex.Message);
    }

    [Fact]
    public void NoDatabaseHost_DefaultConnection_ReturnedVerbatim()
    {
        var result = ConnectionStringResolver.Resolve(Config(
            ("ConnectionStrings:DefaultConnection", "Host=x;Database=y")));

        Assert.Equal("Host=x;Database=y", result);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void BlankDefaultConnection_Throws_WithTheExistingMessage(string blank)
    {
        // "" and whitespace come back non-null from configuration and would
        // otherwise sail through into UseNpgsql, deferring the failure to the
        // first request (Program's DB-init skip-gate).
        var ex = Assert.Throws<InvalidOperationException>(
            () => ConnectionStringResolver.Resolve(Config(
                ("ConnectionStrings:DefaultConnection", blank))));

        Assert.Equal("Connection string 'DefaultConnection' is not configured.", ex.Message);
    }

    [Fact]
    public void NeitherSource_Throws_WithTheExistingMessage()
    {
        var ex = Assert.Throws<InvalidOperationException>(
            () => ConnectionStringResolver.Resolve(Config()));

        Assert.Equal("Connection string 'DefaultConnection' is not configured.", ex.Message);
    }

    [Fact]
    public void IsConfigured_DatabaseHostOnly_IsTrue()
    {
        // Presence-only: Resolve would throw its named credential errors, but
        // a source IS selected — the DB-init gate must open.
        Assert.True(ConnectionStringResolver.IsConfigured(Config(
            ("Database:Host", "dbhost"))));
    }

    [Fact]
    public void IsConfigured_ValidDefaultConnectionOnly_IsTrue()
    {
        Assert.True(ConnectionStringResolver.IsConfigured(Config(
            ("ConnectionStrings:DefaultConnection", "Host=x;Database=y"))));
    }

    [Fact]
    public void IsConfigured_BlankDefaultConnectionOnly_IsFalse()
    {
        Assert.False(ConnectionStringResolver.IsConfigured(Config(
            ("ConnectionStrings:DefaultConnection", "   "))));
    }

    [Fact]
    public void IsConfigured_NeitherSource_IsFalse()
    {
        Assert.False(ConnectionStringResolver.IsConfigured(Config()));
    }
}
