using System.Globalization;
using System.Text;

namespace SmartCrops.Infrastructure.ExternalApis.Gbif;

/// <summary>
/// SMA-124 — pure, deterministic selection of the single best French common name
/// from a taxon's GBIF vernacular entries. Kept free of I/O and DI so it is unit
/// testable in isolation (the controller calls <see cref="SelectFrenchVernacular"/>
/// after <see cref="GbifClient.GetVernacularNamesAsync"/>).
///
/// <para>Algorithm:
/// <list type="number">
///   <item>Keep only <c>language == "fra"</c> entries (ISO 639-3 — NOT <c>"fr"</c>).</item>
///   <item>Split each name on the first comma, keep the first segment, trim; drop
///   blanks. This defeats TAXREF's habit of packing several names into one field
///   (e.g. <c>"Iris d'Allemagne, Flambe, Iris des jardins"</c>).</item>
///   <item>Group case- and accent-insensitively; the group's display form is the
///   best-formed variant (most accents, e.g. <c>"poivrée"</c> beats <c>"poivree"</c>).</item>
///   <item>Pick the group: a <c>preferred == true</c> entry wins; otherwise the
///   most frequent. Ties break deterministically by shortest then ordinal.</item>
/// </list>
/// Returns <c>null</c> when no usable <c>fra</c> entry exists (caller leaves the
/// plant EN/Latin — a data reality, not an i18n gap).</para>
/// </summary>
public static class GbifVernacularSelector
{
    private const string FrenchLanguageCode = "fra";

    public static string? SelectFrenchVernacular(IEnumerable<GbifVernacularName> entries)
    {
        ArgumentNullException.ThrowIfNull(entries);

        // (display name, preferred) for every usable fra entry after comma-splitting.
        var candidates = new List<(string Name, bool Preferred)>();
        foreach (var entry in entries)
        {
            if (!string.Equals(entry.Language, FrenchLanguageCode, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }
            var name = FirstSegment(entry.VernacularName);
            if (name is null)
            {
                continue;
            }
            candidates.Add((name, entry.Preferred == true));
        }

        if (candidates.Count == 0)
        {
            return null;
        }

        // Group case-/accent-insensitively so casing and accent variants of the
        // same name collapse and their occurrences sum into one frequency.
        var groups = candidates
            .GroupBy(c => NormalizeKey(c.Name))
            .Select(g => new
            {
                // Best-formed display variant: most accents, then shortest, then
                // ordinal — fully deterministic regardless of input order.
                Display = g
                    .Select(c => c.Name)
                    .OrderByDescending(AccentCount)
                    .ThenBy(n => n.Length)
                    .ThenBy(n => n, StringComparer.Ordinal)
                    .First(),
                Frequency = g.Count(),
                HasPreferred = g.Any(c => c.Preferred),
            });

        // preferred wins outright; else most frequent; tie-break shortest then alpha.
        var winner = groups
            .OrderByDescending(g => g.HasPreferred)
            .ThenByDescending(g => g.Frequency)
            .ThenBy(g => g.Display.Length)
            .ThenBy(g => g.Display, StringComparer.Ordinal)
            .First();

        return winner.Display;
    }

    /// <summary>First comma-separated segment, trimmed; <c>null</c> if blank/empty.</summary>
    private static string? FirstSegment(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }
        var comma = value.IndexOf(',');
        var segment = (comma >= 0 ? value[..comma] : value).Trim();
        return segment.Length == 0 ? null : segment;
    }

    /// <summary>Case- and accent-insensitive key: strip combining marks then lowercase.</summary>
    private static string NormalizeKey(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var ch in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
            {
                sb.Append(ch);
            }
        }
        return sb.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
    }

    /// <summary>Count of combining accent marks — the "best-formed" tie-breaker
    /// (<c>"poivrée"</c> = 1, <c>"poivree"</c> = 0), so accented variants win.</summary>
    private static int AccentCount(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var count = 0;
        foreach (var ch in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark)
            {
                count++;
            }
        }
        return count;
    }
}
