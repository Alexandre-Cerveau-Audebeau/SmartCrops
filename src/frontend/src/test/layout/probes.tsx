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
 */
export interface ProbeScene extends LayoutScene {
  probe: 'zone-past-card' | 'zone-fold';
}

export const PROBE_SCENES: ProbeScene[] = [
  { name: 'probe-zone-past-card', key: 'tips', size: 'medium', weather: 'all', probe: 'zone-past-card' },
  { name: 'probe-zone-fold', key: 'tips', size: 'medium', weather: 'all', probe: 'zone-fold' },
];

/** The card's border-box height, its padding and its 1 px border: the frame the widgets' cards draw, at a fixed size. */
const CARD_HEIGHT = 200;
const PADDING = 16;
/** The height of a line, and of the spacers between them. */
const LINE = 20;

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
 * The card of a probe: the widgets' frame — `overflow: hidden`, a 1 px
 * border, a padding — at a fixed height, holding ONE scrolling zone of
 * 400 px of content. The zone starts 17 px down the card (the border, the
 * padding): a line at its top, a line 170 px down the zone — 187 to 207 on
 * the card, past its 199 px padding box, within a 260 px zone — and a line
 * 320 px down, past the fold of either zone.
 */
export function probeWidget(scene: ProbeScene): ReactNode {
  const zoneHeight = scene.probe === 'zone-past-card' ? 260 : 100;
  return (
    <div
      data-widget="probe"
      style={{
        height: CARD_HEIGHT,
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: PADDING,
        border: '1px solid #cccccc',
        borderRadius: 12,
        background: '#ffffff',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div data-probe-zone style={{ height: zoneHeight, overflowY: 'auto' }}>
        {line('within', 'Within the card')}
        {spacer(150)}
        {line('past-card', 'Past the card, inside the zone')}
        {spacer(130)}
        {line('past-fold', 'Past the fold of the zone')}
        {spacer(60)}
      </div>
    </div>
  );
}
