import type { ReactNode } from 'react';
import type { LayoutScene } from './scenes';

/**
 * SMA-336 mobile lot, fix round 2, #11 (GitHub review `5263906213`, outside
 * the diff — `measure.ts` 381-405) — the harness's own PROBES: synthetic cards
 * built to hold a KNOWN cut, so the instrument is measured too. They are
 * mounted through the same grid as the widgets and read by the same
 * `measureCard`, and kept apart from the thirty scenes: a probe is expected to
 * break a rule, and the suite asserts that the harness SEES it.
 *
 * `zone-past-card`: a card of 200 px whose scrolling zone is 260 px tall — the
 * zone runs 60 px past the card's edge. A line the zone holds at its 170th
 * pixel fits the zone and is cut by the CARD; a line past the zone's fold is
 * cut by both, and scrolling the zone to its end still leaves it past the
 * card. Neither can be reached. Measured against the nearest clipping
 * ancestor alone — the zone, a scroller — both cuts read « a fold », which
 * `defects()` ignores: a real loss the instrument hid.
 *
 * `zone-fold`: the same card with a zone that FITS it (100 px) and the same
 * lines past the zone's fold: cut by the zone alone, reachable by scrolling —
 * rule 5 of the design contract — and NOT a defect, before and after.
 *
 * Fix round 3, #12 (ledger `ac9da25d` / `2a222383`) — the two AXES of a
 * zone, read apart:
 *
 * `x-hidden-y-auto`: a 100 px zone that HIDES its horizontal overflow and
 * scrolls its vertical one, holding a line far wider than itself. The line is
 * cut on the RIGHT by the zone, for good — no scroll ever brings its end into
 * view — while the lines under the zone's fold come back with a scroll. Read
 * with one `scroller` for both axes, the zone counted as scrolling, and the
 * wide line's cut passed for a fold: a hard horizontal clip the instrument
 * ignored.
 *
 * `x-auto-y-hidden`: the symmetric zone — the wide line scrolls into view,
 * the lines under the fold are cut at the bottom for good, and, hidden
 * vertically, they are lost below the card's edge.
 *
 * Every probe also reports the COMPUTED `overflow` of its zone, axis by axis
 * (`zoneOverflow`, read in the engine by `harness.tsx`): the rule the thirty
 * scenes rely on — `overflow-y: auto` declared alone computes `overflow-x` to
 * `auto`, so both axes scroll — is measured in Chrome, not assumed from the
 * specification.
 *
 * SMA-446, #13 — the CARD as a hard boundary, whatever its style computes:
 *
 * `card-scrolls`: the same 200 px card declared `overflow: auto` — a card
 * that would scroll whole, which no card may: a ZONE scrolls inside the card
 * (rule 5), the card itself never does — over a zone that clips nothing, so
 * the card is the only clipper of its lines. The line 170 px down and the
 * line 320 px down are cut by the card, for good. Read from the card's
 * computed axes, the card passed for a scroller and both cuts for a fold:
 * `hardClipped` 0, `beyondCard` 0 — a loss the instrument would have hidden
 * in silence the day a card declared a scroll. Every probe reports its card's
 * computed `overflow` too (`cardOverflow`), so this one proves it measures
 * what it claims.
 */
/** The probes of the first rounds: a card of a fixed height, holding one zone. */
type ZoneProbe = 'zone-past-card' | 'zone-fold' | 'x-hidden-y-auto' | 'x-auto-y-hidden' | 'card-scrolls';

/**
 * SMA-437 lot 1, PR A, step A7 (pre-flight D19) — two probes of the GRID's
 * tracks, whose cards take the height the grid gives them (`height: 100%`,
 * as `DashboardBlock` does) instead of a fixed one:
 *
 * `pinned-overflow`: a Small card holding 400 px of lines. From 600 px up its
 * cell is PINNED at 273 px (A-N10), so the card must stop there and CUT what
 * is below — a hard clip by the card: the proof that the pinning exists. On a
 * phone the row grows with it, and nothing is cut.
 *
 * `wide-short`: a Full-width card holding one line. Its row takes the height
 * of its content with NO 273 px floor (A-N10) — {@link WIDE_SHORT_HEIGHT} —
 * across every column of the desktop and both of a tablet (A-N12). On
 * develop, whose rows were 273 px tracks, it measured 273.
 */
type TrackProbe = 'pinned-overflow' | 'wide-short';

export interface ProbeScene extends LayoutScene {
  probe: ZoneProbe | TrackProbe;
}

export const PROBE_SCENES: ProbeScene[] = [
  { name: 'probe-zone-past-card', key: 'tips', size: 'medium', weather: 'all', probe: 'zone-past-card' },
  { name: 'probe-zone-fold', key: 'tips', size: 'medium', weather: 'all', probe: 'zone-fold' },
  { name: 'probe-x-hidden-y-auto', key: 'tips', size: 'medium', weather: 'all', probe: 'x-hidden-y-auto' },
  { name: 'probe-x-auto-y-hidden', key: 'tips', size: 'medium', weather: 'all', probe: 'x-auto-y-hidden' },
  { name: 'probe-card-scrolls', key: 'tips', size: 'medium', weather: 'all', probe: 'card-scrolls' },
  { name: 'probe-pinned-overflow', key: 'tips', size: 'small', weather: 'all', probe: 'pinned-overflow' },
  { name: 'probe-wide-short', key: 'tips', size: 'wide', weather: 'all', probe: 'wide-short' },
];

/** The card's border-box height, its padding and its 1 px border: the frame the widgets' cards draw, at a fixed size. */
const CARD_HEIGHT = 200;
const PADDING = 16;
/** The height of a line, and of the spacers between them. */
const LINE = 20;

/** The Full-width probe's card: one line, its padding and its two 1 px borders — 54 px, far under the 273 px of a row. */
export const WIDE_SHORT_HEIGHT = LINE + 2 * PADDING + 2;

/** The lines the pinned probe holds: 400 px of them, well past a 273 px card. */
const PINNED_LINES = 20;

/**
 * The first line of the two mixed-axis probes: far wider than any zone the
 * grid draws — 532 px in the 566 px Medium card of the desktop, and 942 px in
 * the 976 px one of a 1 024 px tablet since the tablet runs (SMA-437), where
 * the line of the first rounds fitted whole — never wrapping.
 */
export const WIDE_LINE =
  'A line far wider than its zone, cut on the right for good — no scrollbar will ever bring its end into view, at any width, ' +
  'not even in the widest Medium card a tablet draws, nine hundred and seventy-six pixels from one border to the other';

/** One axis of a zone's `overflow`: declared, or left to the engine's computation, as the widgets' zones leave their other axis. */
type Overflow = 'auto' | 'hidden' | undefined;

/**
 * The zone of each probe: its height, its `overflow` axis by axis, whether
 * its first line is the wide one — and the CARD's own `overflow`, the widgets'
 * `hidden` for every probe but `card-scrolls` (#13).
 */
const ZONES: Record<
  ZoneProbe,
  { height: number; overflowX: Overflow; overflowY: Overflow; wide: boolean; card: 'hidden' | 'auto' }
> = {
  'zone-past-card': { height: 260, overflowX: undefined, overflowY: 'auto', wide: false, card: 'hidden' },
  'zone-fold': { height: 100, overflowX: undefined, overflowY: 'auto', wide: false, card: 'hidden' },
  'x-hidden-y-auto': { height: 100, overflowX: 'hidden', overflowY: 'auto', wide: true, card: 'hidden' },
  'x-auto-y-hidden': { height: 100, overflowX: 'auto', overflowY: 'hidden', wide: true, card: 'hidden' },
  // A zone that clips nothing — `overflow` left to compute to `visible` on
  // both axes — under a card that scrolls: the card is the only clipper.
  'card-scrolls': { height: 260, overflowX: undefined, overflowY: undefined, wide: false, card: 'auto' },
};

/** One line of the probe — the text atom the measure reads — of a known height, never wrapping. */
function line(id: string, text: string) {
  return (
    <p data-probe-line={id} style={{ margin: 0, height: LINE, lineHeight: `${LINE}px`, fontSize: 14, whiteSpace: 'nowrap' }}>
      {text}
    </p>
  );
}

/** Empty height between two lines. */
const spacer = (height: number) => <div aria-hidden style={{ height }} />;

/**
 * The card of a probe: the widgets' frame — `overflow: hidden` (or `auto`,
 * for the one probe that scrolls its card, #13), a 1 px border, a padding —
 * at a fixed height, holding ONE zone of 400 px of content. The zone starts
 * 17 px down the card (the border, the padding): a line at its top — « Within
 * the card », or the wide line — a line 170 px down the zone — 187 to 207 on
 * the card, past its 199 px padding box, within a 260 px zone, under the fold
 * of a 100 px one — and a line 320 px down, past the fold of either zone.
 */
export function probeWidget(scene: ProbeScene): ReactNode {
  if (scene.probe === 'pinned-overflow' || scene.probe === 'wide-short') return trackProbe(scene.probe);
  const zone = ZONES[scene.probe];
  return (
    <div
      data-widget="probe"
      style={{
        height: CARD_HEIGHT,
        boxSizing: 'border-box',
        overflow: zone.card,
        padding: PADDING,
        border: '1px solid #cccccc',
        borderRadius: 12,
        background: '#ffffff',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* An undeclared axis is left out of the style, as the widgets leave it: React sets nothing for `undefined`. */}
      <div data-probe-zone style={{ height: zone.height, overflowX: zone.overflowX, overflowY: zone.overflowY }}>
        {zone.wide ? line('wide', WIDE_LINE) : line('within', 'Within the card')}
        {spacer(150)}
        {line('past-card', 'Past the card, inside the zone')}
        {spacer(130)}
        {line('past-fold', 'Past the fold of the zone')}
        {spacer(60)}
      </div>
    </div>
  );
}

/**
 * The card of a track probe (SMA-437): the widgets' frame — `overflow:
 * hidden`, a 1 px border, a padding — as tall as the grid makes it
 * (`height: 100%`, `DashboardBlock`'s own rule), holding either 400 px of lines
 * (`pinned-overflow`) or one (`wide-short`).
 */
function trackProbe(probe: TrackProbe): ReactNode {
  const lines = probe === 'pinned-overflow' ? PINNED_LINES : 1;
  return (
    <div
      data-widget="probe"
      style={{
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: PADDING,
        border: '1px solid #cccccc',
        borderRadius: 12,
        background: '#ffffff',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {Array.from({ length: lines }, (_, index) => (
        <div key={index}>{line(`line-${index + 1}`, `Line ${index + 1} of the probe`)}</div>
      ))}
    </div>
  );
}
