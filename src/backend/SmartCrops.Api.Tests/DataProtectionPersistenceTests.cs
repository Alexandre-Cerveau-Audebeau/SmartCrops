using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SmartCrops.Api.Tests.Infrastructure;

namespace SmartCrops.Api.Tests;

/// <summary>
/// SMA-41 — Data Protection key persistence, in its strong form: host 1
/// protects a value and writes the key ring to DataProtection:KeysPath; a
/// SECOND host booted on the SAME path must unprotect that value. This is the
/// production scenario — a redeploy that must still unprotect yesterday's
/// confirmation/reset tokens. The protector PURPOSE must be identical on both
/// hosts: a differing purpose makes Unprotect throw and would fake a
/// persistence failure.
/// </summary>
public class DataProtectionPersistenceTests
{
    private static Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> FactoryFor(string keysPath) =>
        new TestWebAppBuilder()
            .WithEnvironment("Testing")
            .WithJwtAuth()
            .WithGoogleOAuth()
            .WithFrontendUrl()
            .WithTrefle()
            .WithPerenual()
            .WithTypesense()
            .WithSmtp()
            .WithConfig("DataProtection:KeysPath", keysPath)
            .Build();

    [Fact]
    public async Task KeyRing_PersistedByFirstHost_UnprotectsOnSecondHost()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "smartcrops-dp-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            string protectedValue;
            await using (var firstHost = FactoryFor(tempDir))
            {
                var provider = firstHost.Services.GetRequiredService<IDataProtectionProvider>();
                protectedValue = provider.CreateProtector("t").Protect("x");

                Assert.False(string.IsNullOrEmpty(protectedValue));
                Assert.NotEmpty(Directory.GetFiles(tempDir, "key-*.xml"));

                var dpOptions = firstHost.Services.GetRequiredService<IOptions<DataProtectionOptions>>().Value;
                Assert.Equal("SmartCrops", dpOptions.ApplicationDiscriminator);
            }

            // Second host, same path — the redeploy. Same purpose "t".
            await using var secondHost = FactoryFor(tempDir);
            var secondProvider = secondHost.Services.GetRequiredService<IDataProtectionProvider>();
            Assert.Equal("x", secondProvider.CreateProtector("t").Unprotect(protectedValue));
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, recursive: true);
            }
        }
    }

    /// <summary>
    /// SMA-328 R2 — an unusable DataProtection:KeysPath must kill the boot
    /// with a message naming the config key. A temp FILE passed as the path is
    /// the portable stand-in for an unwritable directory: OS-ACL manipulation
    /// is not portable on the Linux CI runner, while CreateDirectory over an
    /// existing file fails everywhere.
    /// </summary>
    [Fact]
    public void UnusableKeysPath_FailsFastAtBoot_NamingTheConfigKey()
    {
        var tempFile = Path.Combine(Path.GetTempPath(), "smartcrops-dp-probe-" + Guid.NewGuid().ToString("N"));
        File.WriteAllText(tempFile, "");
        try
        {
            using var factory = FactoryFor(tempFile);
            var ex = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
            Assert.Contains("DataProtection:KeysPath", ex.ToString());
        }
        finally
        {
            File.Delete(tempFile);
        }
    }
}
