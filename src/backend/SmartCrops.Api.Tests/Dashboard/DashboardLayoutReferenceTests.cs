using System.Text.Json;
using SmartCrops.Core.Dashboard;

namespace SmartCrops.Api.Tests.Dashboard;

/// <summary>
/// PR #287, fix round 1, S2 (CodeRabbit, both surfaces) — the dashboard's
/// vocabulary, its size table and its presets exist twice, here in
/// <c>SmartCrops.Core/Dashboard</c> and in the client, each pinned by its own
/// literals: a change made on one side only failed no test. Both suites now
/// compare THEIR constants to one reference file,
/// <c>src/frontend/src/constants/dashboardLayout.reference.json</c>, which this
/// project copies next to its assembly (see the <c>.csproj</c>); the client's
/// twin of this class is <c>dashboardLayout.reference.test.ts</c>. A drift on
/// either side fails that side's suite.
///
/// <para>The file lives in the frontend tree because the production image of
/// the frontend is built from <c>src/frontend</c> alone and type-checks the
/// client's test; the API image is built from <c>src/backend</c> and never
/// builds this project, so reaching across to the frontend tree costs it
/// nothing.</para>
/// </summary>
public class DashboardLayoutReferenceTests
{
    private static readonly JsonElement Reference = Load();

    private static JsonElement Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Dashboard", "dashboardLayout.reference.json");
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return document.RootElement.Clone();
    }

    private static string[] Strings(JsonElement array) =>
        [.. array.EnumerateArray().Select(item => item.GetString()!)];

    public static TheoryData<string> Levels() => [.. DashboardLayout.Levels.All];

    [Fact]
    public void Blocks_AreTheReferenceBlocks_InItsOrder()
    {
        Assert.Equal(Strings(Reference.GetProperty("blocks")), DashboardLayout.Blocks.All);
    }

    [Fact]
    public void Sizes_AreTheReferenceSizes()
    {
        Assert.Equal(Strings(Reference.GetProperty("sizes")), DashboardLayout.Sizes.All);
    }

    [Fact]
    public void Levels_AreTheReferenceLevels_AndTheDefaultIsItsDefault()
    {
        Assert.Equal(Strings(Reference.GetProperty("levels")), DashboardLayout.Levels.All);
        // A constant goes on the `expected` side (xUnit2000).
        Assert.Equal(DashboardLayout.DefaultLevel, Reference.GetProperty("defaultLevel").GetString());
    }

    [Fact]
    public void NonHidableBlock_IsTheReferenceOne()
    {
        Assert.Equal(DashboardLayout.NonHidableBlock, Reference.GetProperty("nonHidableBlock").GetString());
    }

    [Theory]
    [MemberData(nameof(Levels))]
    public void SizesFor_EveryBlockAtALevel_IsTheReferenceRow_InItsOrder(string level)
    {
        var rows = Reference.GetProperty("sizesFor").GetProperty(level);

        Assert.Equal(
            rows.EnumerateObject().Select(row => row.Name),
            DashboardLayout.Blocks.All);
        foreach (var row in rows.EnumerateObject())
        {
            Assert.Equal(Strings(row.Value), DashboardCapabilities.SizesFor(row.Name, level));
        }
    }

    /// <summary>
    /// SMA-437 lot 1, PR B, step B2 — the Key figures band's catalogue and its
    /// four defaults exist on both sides too: the client reads them to draw and
    /// to fall back, the server to refuse (pre-flight D9, D10).
    /// </summary>
    [Fact]
    public void KeyFigures_AreTheReferenceFigures_AndItsDefaults()
    {
        var keyFigures = Reference.GetProperty("keyFigures");

        Assert.Equal(Strings(keyFigures.GetProperty("figures")), DashboardKeyFigures.All);
        Assert.Equal(Strings(keyFigures.GetProperty("defaults")), DashboardKeyFigures.Defaults);
    }

    [Theory]
    [MemberData(nameof(Levels))]
    public void Preset_IsTheReferencePreset_BlockByBlock(string level)
    {
        var expected = Reference.GetProperty("presets").GetProperty(level).EnumerateArray()
            .Select(block => new DashboardPresetBlock(
                block.GetProperty("key").GetString()!,
                block.GetProperty("size").GetString()!,
                block.GetProperty("hidden").GetBoolean()))
            .ToList();

        Assert.Equal(expected, DashboardPresets.For(level));
    }
}
