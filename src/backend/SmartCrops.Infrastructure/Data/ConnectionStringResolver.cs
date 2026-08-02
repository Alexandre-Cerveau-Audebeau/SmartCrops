using Microsoft.Extensions.Configuration;
using Npgsql;

namespace SmartCrops.Infrastructure.Data;

/// <summary>
/// SMA-41 — resolves the database connection string from configuration.
///
/// <para><b>Production path.</b> When <c>Database:Host</c> is configured (the
/// deployment supplies discrete env vars — Lot 2), the string is composed with
/// <see cref="NpgsqlConnectionStringBuilder"/>, which quotes reserved
/// characters: a password containing <c>;</c> or quotes cannot break the
/// string or smuggle extra options into it. This is the deployment gate that
/// allows generated passwords.</para>
///
/// <para><b>Dev/tests path.</b> Without <c>Database:Host</c>, the classic
/// <c>ConnectionStrings:DefaultConnection</c> is returned verbatim, with the
/// same fail-fast exception as before — behavior unchanged.</para>
/// </summary>
public static class ConnectionStringResolver
{
    public static string Resolve(IConfiguration configuration)
    {
        var host = configuration["Database:Host"];
        if (!string.IsNullOrWhiteSpace(host))
        {
            var portRaw = configuration["Database:Port"];
            var port = 5432;
            if (!string.IsNullOrWhiteSpace(portRaw) && !int.TryParse(portRaw, out port))
            {
                throw new InvalidOperationException(
                    $"Database:Port value '{portRaw}' is not a valid integer.");
            }

            var builder = new NpgsqlConnectionStringBuilder
            {
                Host = host,
                Port = port,
                Database = configuration["Database:Name"] is { Length: > 0 } name ? name : "smartcrops",
                Username = configuration["Database:User"],
                Password = configuration["Database:Password"],
            };
            return builder.ConnectionString;
        }

        return configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException(
                "Connection string 'DefaultConnection' is not configured.");
    }
}
