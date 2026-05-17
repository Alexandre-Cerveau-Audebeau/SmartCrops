namespace SmartCrops.Api.Tests.Integration;

/// <summary>
/// xUnit collection definition that shares a single <see cref="PostgresFixture"/>
/// across all integration test classes. The container starts once per test run
/// (not once per class), keeping the cost of integration tests amortized.
/// </summary>
[CollectionDefinition("Integration")]
public sealed class IntegrationCollection : ICollectionFixture<PostgresFixture>
{
    // Intentionally empty — xUnit collection-fixture marker only.
}
