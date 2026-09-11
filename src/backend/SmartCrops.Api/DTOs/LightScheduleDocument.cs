using System.Text.Json;
using System.Text.RegularExpressions;

namespace SmartCrops.Api.DTOs;

/// <summary>
/// The stored <c>LightScheduleJson</c> document: what makes it well-formed, and
/// how it is read back.
///
/// <para>SMA-336 PR 2/5, round 4 (C4 — E‴3). These four members lived in
/// <c>GardensController</c>, and round 3 made <c>ParseLightSchedule</c>
/// <c>internal</c> so the dashboard aggregate could share the reader rather than
/// keep a second copy of its tolerance for a malformed value. Sharing the rule
/// was right; the direction of the dependency was not. A controller is an HTTP
/// entry point, and making one the owner of a stored-document reader another
/// controller calls fixes a direction that gets harder to unwind as more readers
/// appear. The rule is about the COLUMN, not about the gardens endpoint.</para>
///
/// <para>Here rather than in a new namespace: <c>GardenWireRecords.cs</c> already
/// moved <see cref="GardenConfigDto"/> and <see cref="LightSlotDto"/> out of the
/// controller for the same reason (round 1, E5), and this is the reader for the
/// document those records describe. Both controllers already import
/// <c>SmartCrops.Api.DTOs</c>, so no call site gains a using.</para>
///
/// <para>The bodies are the round 3 ones, moved unchanged. Nothing about what a
/// document has to satisfy, or about what an unreadable one degrades to, differs
/// from what shipped.</para>
/// </summary>
internal static class LightScheduleDocument
{
    /// <summary>How many slots one schedule may carry.</summary>
    internal const int MaxSlots = 6;

    private static readonly JsonSerializerOptions JsonWeb =
        new(JsonSerializerDefaults.Web);

    /// <summary>Strict 24h clock: 00:00 .. 23:59.</summary>
    private static readonly Regex TimeSlotPattern =
        new(@"^([01]\d|2[0-3]):[0-5]\d$", RegexOptions.Compiled);

    /// <summary>
    /// What makes a list of light slots WELL-FORMED, in one place (round 3, E″3).
    ///
    /// <para>These rules used to live inline in <c>GardensController.ValidateConfig</c>,
    /// so only the write path knew them. <see cref="Parse"/> asks the same
    /// question of the stored document, which is the point: a value this server
    /// would refuse to accept must not be one it hands back.</para>
    ///
    /// <para>Element nullability is deliberate. <c>[null]</c> deserializes to a
    /// list holding a null, and both callers have to answer for it before
    /// dereferencing <c>Start</c> / <c>End</c>.</para>
    /// </summary>
    /// <returns>The 400 reason, or null when every slot is well-formed.</returns>
    internal static string? ValidateSlots(IReadOnlyList<LightSlotDto?> slots)
    {
        if (slots.Count > MaxSlots)
            return $"lightSchedule allows at most {MaxSlots} slots.";

        foreach (var slot in slots)
        {
            // A null array element (e.g. `[null]` in the JSON) must be
            // rejected via the 400 path BEFORE dereferencing Start/End.
            if (slot is null
                || slot.Start is null || slot.End is null
                || !TimeSlotPattern.IsMatch(slot.Start)
                || !TimeSlotPattern.IsMatch(slot.End))
                return "each lightSchedule slot needs start and end in 24h HH:mm format.";
            // Zero-padded HH:mm makes ordinal comparison chronological.
            if (string.CompareOrdinal(slot.Start, slot.End) >= 0)
                return "each lightSchedule slot must have start < end.";
        }

        return null;
    }

    /// <summary>
    /// Reads the stored document, or null when it is not one this server would
    /// have accepted.
    ///
    /// <para>Round 1, E4 / G1 — a MALFORMED document reads as no schedule at all,
    /// rather than throwing. <c>LightScheduleJson</c> is an unconstrained text
    /// column: the two API write paths validate what they store, but exports
    /// preserve legacy raw values and nothing stops a hand-edit or a truncated
    /// write. Both readers are on a page-wide critical path — one builds every
    /// garden of <c>GET /api/dashboard</c> — so an escaping
    /// <see cref="JsonException"/> turned one unreadable garden into a dashboard
    /// nobody could open. Degrading matches how the rest of this feature already
    /// treats stored documents it did not write: an unknown block key, an unknown
    /// level and an unparseable layout all fall back rather than fail.</para>
    ///
    /// <para>Only <see cref="JsonException"/> is caught. A malformed document is
    /// the failure this reader can answer; anything else is not, and would be
    /// hidden by a broader filter.</para>
    ///
    /// <para>Round 3, E″3 — the round 1 fix caught the SYNTAX and stopped there,
    /// which was incomplete rather than wrong: <c>[null]</c>, <c>[{}]</c>,
    /// <c>[{"start":"25:00","end":"20:00"}]</c> and a reversed range all
    /// deserialize without raising, so they walked past the <c>catch</c> and
    /// left this boundary as a schedule the write path would have refused with a
    /// 400. The document is now held to the SAME slot rules the write path
    /// applies (<see cref="ValidateSlots"/>), and anything that fails them reads
    /// as no schedule at all.</para>
    /// </summary>
    internal static List<LightSlotDto>? Parse(string? json) => Parse(json, out _);

    /// <summary>
    /// <see cref="Parse(string?)"/>, and WHY the document read as none (round 7,
    /// S06 — Extension #7-6 / #8-2).
    ///
    /// <para>Both degradations were silent: a corrupt row produced a garden whose
    /// exposure engine ran on default inputs, and the next config save wrote
    /// <c>null</c> over the stored value, with no signal anywhere that the data
    /// needed repair — invisible until a user reported their light slots gone.
    /// This reader is <c>static</c> and stays a pure function; it hands the
    /// reason to the HTTP entry point that has the request context and a logger,
    /// which is where the decision about how loudly to say it belongs.</para>
    /// </summary>
    /// <param name="reason">
    /// Why a NON-EMPTY document read as none — the parse failure or the slot
    /// rule it broke — and null when it was empty or well-formed.
    /// </param>
    internal static List<LightSlotDto>? Parse(string? json, out string? reason)
    {
        reason = null;
        if (string.IsNullOrEmpty(json)) return null;

        List<LightSlotDto?>? slots;
        try
        {
            // Nullable elements: `[null]` is a document this reader must survive,
            // and `List<LightSlotDto>` would hide the null behind an annotation
            // the serializer does not enforce.
            slots = JsonSerializer.Deserialize<List<LightSlotDto?>>(json, JsonWeb);
        }
        catch (JsonException exception)
        {
            reason = $"not a JSON schedule: {exception.Message}";
            return null;
        }

        if (slots is null)
        {
            reason = "the document is JSON null.";
            return null;
        }

        if (ValidateSlots(slots) is { } broken)
        {
            reason = broken;
            return null;
        }

        return [.. slots.Select(slot => slot!)];
    }
}
