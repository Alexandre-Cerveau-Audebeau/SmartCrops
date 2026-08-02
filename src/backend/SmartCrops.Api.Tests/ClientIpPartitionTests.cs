using System.Net;
using Microsoft.AspNetCore.Http;
using SmartCrops.Api.Configuration;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-328 — unit proof of the shared rate-limit partition key: null keys to
/// the load-bearing "unknown" literal, IPv4 stays per-address, IPv4-mapped
/// IPv6 unmaps, and IPv6 collapses to the routed /64 allocation.
/// </summary>
public class ClientIpPartitionTests
{
    private static string KeyFor(string? ip)
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = ip is null ? null : IPAddress.Parse(ip);
        return ClientIpPartition.FromContext(context);
    }

    [Fact]
    public void NullAddress_KeysToUnknown()
    {
        Assert.Equal("unknown", KeyFor(null));
    }

    [Fact]
    public void Ipv4_KeysToFullAddress()
    {
        Assert.Equal("203.0.113.7", KeyFor("203.0.113.7"));
    }

    [Fact]
    public void Ipv4MappedIpv6_UnmapsToIpv4()
    {
        Assert.Equal("203.0.113.7", KeyFor("::ffff:203.0.113.7"));
    }

    [Fact]
    public void Ipv6_SameSlash64_ShareOneKey()
    {
        var key = KeyFor("2001:41d0:401:3000::3860");
        Assert.Equal("2001:41d0:401:3000::/64", key);
        Assert.Equal(key, KeyFor("2001:41d0:401:3000::1"));
    }

    [Fact]
    public void Ipv6_DifferentSlash64_GetDistinctKeys()
    {
        Assert.NotEqual(KeyFor("2001:41d0:401:3000::1"), KeyFor("2001:41d0:401:3001::1"));
        Assert.Equal("2001:41d0:401:3001::/64", KeyFor("2001:41d0:401:3001::1"));
    }
}
