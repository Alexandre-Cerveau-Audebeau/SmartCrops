using SmartCrops.Api.DTOs;

namespace SmartCrops.Api.Tests.DTOs;

/// <summary>
/// Unit tests for <see cref="LightScheduleDocument"/> — the slot pattern, on
/// its own (SMA-336 round 8, GitHub review of <c>0bb6325</c>, outside the diff).
///
/// <para>The integration suites hold the write path and the two readers to the
/// rules through HTTP; this class holds the PATTERN to its digits. In .NET
/// <c>\d</c> is every Unicode decimal digit unless the regex runs under
/// <c>RegexOptions.ECMAScript</c>, so <c>0١:0٢</c> matched the 24h pattern,
/// passed the ordinal comparison and survived <see cref="LightScheduleDocument.Parse(string?)"/>.
/// The pattern is <c>[0-9]</c> now, and this is the test the finding asked for.</para>
/// </summary>
public class LightScheduleDocumentTests
{
    private static LightSlotDto Slot(string start, string end) => new(start, end);

    // The digit goes where the old pattern had a `\d` — the second digit of a
    // 0x/1x hour and the second digit of the minute. The first digit of each
    // was `[01]` / `[0-5]` already, explicit ASCII ranges, so a non-ASCII
    // digit THERE was refused before this round too.
    [Theory]
    [InlineData("0١:0٢", "12:00")] // Arabic-Indic digits in the start
    [InlineData("08:00", "1٢:0٠")] // and in the end
    [InlineData("0८:00", "12:00")] // Devanagari
    [InlineData("0８:00", "12:00")] // fullwidth
    public void ValidateSlots_RejectsNonAsciiDigits(string start, string end)
    {
        var reason = LightScheduleDocument.ValidateSlots([Slot(start, end)]);

        Assert.NotNull(reason);
        Assert.Contains("24h HH:mm", reason);
    }

    [Fact]
    public void Parse_AStoredDocumentInNonAsciiDigits_ReadsAsNone_WithTheRule()
    {
        // The read side of the same rule: a document a client could have stored
        // before the fix (both write paths validated with `\d`) reads as no
        // schedule at all, and the round-7 reason names the rule it broke.
        var slots = LightScheduleDocument.Parse("[{\"start\":\"0١:0٢\",\"end\":\"12:00\"}]", out var reason);

        Assert.Null(slots);
        Assert.NotNull(reason);
        Assert.Contains("24h HH:mm", reason);
    }

    [Fact]
    public void ValidateSlots_AcceptsEveryAsciiMinuteOfTheDay()
    {
        // What a STORED schedule could have been written with, exhaustively:
        // `[0-9]` is a subset of `\d`, so every ASCII `HH:mm` the old pattern
        // accepted is accepted still. 1 440 values, each as a start before
        // 23:59 — and 23:59 itself as an end after 00:00.
        for (var hour = 0; hour < 24; hour++)
        {
            for (var minute = 0; minute < 60; minute++)
            {
                var time = $"{hour:D2}:{minute:D2}";
                var slot = time == "23:59" ? Slot("00:00", time) : Slot(time, "23:59");

                Assert.Null(LightScheduleDocument.ValidateSlots([slot]));
            }
        }
    }

    [Fact]
    public void Parse_AStoredAsciiDocument_ReadsBackUnchanged()
    {
        var slots = LightScheduleDocument.Parse(
            "[{\"start\":\"08:00\",\"end\":\"12:00\"},{\"start\":\"14:30\",\"end\":\"23:59\"}]",
            out var reason);

        Assert.Null(reason);
        Assert.NotNull(slots);
        Assert.Collection(
            slots,
            first => Assert.Equal(("08:00", "12:00"), (first.Start, first.End)),
            second => Assert.Equal(("14:30", "23:59"), (second.Start, second.End)));
    }

    [Theory]
    [InlineData("24:00")]
    [InlineData("8:00")]
    [InlineData("08:60")]
    [InlineData("08h00")]
    public void ValidateSlots_StillRejectsWhatItRejectedBefore(string start)
    {
        var reason = LightScheduleDocument.ValidateSlots([Slot(start, "23:59")]);

        Assert.NotNull(reason);
        Assert.Contains("24h HH:mm", reason);
    }
}
