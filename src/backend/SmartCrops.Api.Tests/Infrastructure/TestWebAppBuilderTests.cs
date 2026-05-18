namespace SmartCrops.Api.Tests.Infrastructure;

/// <summary>
/// Unit tests for <see cref="TestWebAppBuilder"/>. Covers the fail-fast
/// invariants on mutually exclusive DB modes added in PR #61 round 2.
/// Other builder methods are exercised indirectly through the 223 backend
/// tests that use the 4 migrated factories.
/// </summary>
public class TestWebAppBuilderTests
{
    [Fact]
    public void WithConnectionString_AfterWithInMemoryDatabase_Throws()
    {
        var builder = new TestWebAppBuilder().WithInMemoryDatabase("Test");

        var ex = Assert.Throws<InvalidOperationException>(
            () => builder.WithConnectionString("Host=localhost;Database=test"));

        Assert.Contains("WithConnectionString cannot be combined with WithInMemoryDatabase", ex.Message);
    }

    [Fact]
    public void WithInMemoryDatabase_AfterWithConnectionString_Throws()
    {
        var builder = new TestWebAppBuilder().WithConnectionString("Host=localhost;Database=test");

        var ex = Assert.Throws<InvalidOperationException>(
            () => builder.WithInMemoryDatabase("Test"));

        Assert.Contains("WithInMemoryDatabase cannot be combined with WithConnectionString", ex.Message);
    }
}
