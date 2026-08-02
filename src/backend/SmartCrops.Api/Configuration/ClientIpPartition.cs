using System.Net;
using System.Net.Sockets;

namespace SmartCrops.Api.Configuration;

/// <summary>
/// SMA-328 — the rate-limit partition key shared by the three sister policies
/// (contact / passwordReset / account).
///
/// <para><b>Why /64 for IPv6.</b> Keying on the full address hands one attacker
/// 2^64 separate budgets inside a single /64 allocation — the smallest block
/// routinely routed to an end site — because every address in the block is
/// theirs to rotate through. Keying on the /64 prefix makes the routed
/// allocation itself the budget holder: one block, one budget. IPv4 keeps the
/// full address (one address IS the allocation there), and IPv4-mapped IPv6
/// addresses are unmapped first so a dual-stack listener cannot split the same
/// client across two partitions.</para>
///
/// <para><b>Load-bearing literal.</b> A null remote address keys to
/// <c>"unknown"</c> — TestServer requests have no remote IP, and the three
/// rate-limit test suites depend on sharing that partition. Do not rename it.</para>
/// </summary>
public static class ClientIpPartition
{
    public static string FromContext(HttpContext context)
    {
        var address = context.Connection.RemoteIpAddress;
        if (address is null)
        {
            return "unknown";
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            return address.ToString();
        }

        // IPv6: zero the interface identifier (bytes 8..15), keep the /64 prefix.
        var bytes = address.GetAddressBytes();
        for (var i = 8; i < 16; i++)
        {
            bytes[i] = 0;
        }

        return new IPAddress(bytes) + "/64";
    }
}
