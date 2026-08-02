using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using SmartCrops.Api.Tests.Infrastructure;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-41 — Data Protection key persistence: with DataProtection:KeysPath
/// configured, protecting a value writes the key ring to that directory
/// (key-*.xml), which is what survives a container rebuild and keeps
/// confirmation/reset tokens alive across redeploys.
/// </summary>
public class DataProtectionPersistenceTests
{
    [Fact]
    public async Task KeysPath_PersistsKeyRing_ToConfiguredDirectory()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "smartcrops-dp-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            await using var factory = new TestWebAppBuilder()
                .WithEnvironment("Testing")
                .WithJwtAuth()
                .WithGoogleOAuth()
                .WithFrontendUrl()
                .WithTrefle()
                .WithPerenual()
                .WithTypesense()
                .WithSmtp()
                .WithConfig("DataProtection:KeysPath", tempDir)
                .Build();

            var provider = factory.Services.GetRequiredService<IDataProtectionProvider>();
            var protectedValue = provider.CreateProtector("t").Protect("x");

            Assert.False(string.IsNullOrEmpty(protectedValue));
            Assert.NotEmpty(Directory.GetFiles(tempDir, "key-*.xml"));
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, recursive: true);
            }
        }
    }
}
