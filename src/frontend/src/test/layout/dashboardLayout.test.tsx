import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LAYOUT_SCENES } from './scenes';
import type { SceneMeasure } from './harness';
import { VISIBLE_OVERLAP_PX } from './measure';
import {
  IS_CI,
  buildHarness,
  findChrome,
  makeOutDir,
  measureRun,
  removeOutDir,
  writePage,
  type LayoutRun,
} from './chrome.mjs';

/**
 * SMA-336 mobile lot, step 7 (pre-flight D7) — the dashboard's LAYOUT, measured
 * in a real engine.
 *
 * jsdom lays nothing out: every rect it answers is zero, so the design-freeze
 * suites can pin what the CSS DECLARES and never what it DRAWS. The visual
 * pass of 20/09 found four defects the declarations could not see — six hour
 * slots printed on one another, an invitation over a tip, « +N tâches → » over
 * the last task, month labels over month labels — and the pre-flight measured
 * them with this harness before fixing them. It stays, so they cannot return.
 *
 * How: `harness.tsx` is bundled ONCE with Vite into a single script (no
 * server, no new dependency — `vite` is what builds the app), written into a
 * `file://` page with the app's own Inter faces, and opened in Chrome headless
 * with `--dump-dom` (`chrome.mjs`). The page mounts the twenty-nine scenes of
 * `scenes.tsx` through the real `DashboardGrid`, one after the other, and
 * measures each card with `measure.ts`; the dump is one `<pre>` of results.
 * Four runs, in parallel: French at 360 and 390 px (the two phone widths of
 * the visual pass; the phone is emulated on the `#page` width because
 * headless Chrome opens no window under 500 px, and 500 is still under the
 * 600 px breakpoint), French at 1280 px (the desktop — its 24 scenes at zero
 * on `5282852` are pinned here, and the four this lot corrected), and English
 * at 360, where « 2 PM » is wider than « 14 h ». Day and night were measured
 * identical on 290 runs by the pre-flight, so the light theme alone runs.
 *
 * What it asserts, scene by scene, at every width: NO visible overlap between
 * two atoms of a card, NOTHING clipped by the card or by an `overflow:
 * hidden` ancestor (an ellipsis is not a clip; a scrolling zone's fold is not
 * a clip), NO text drawn past its block, NOTHING below the card's edge.
 * Contacts under {@link VISIBLE_OVERLAP_PX} — line boxes touching without a
 * glyph under another — are reported, not failed.
 *
 * Chrome: `CHROME_BIN`, else the usual names on the PATH, else the usual
 * install paths. Without Chrome the suite is SKIPPED on a workstation and
 * FAILS on CI (`CI` is set there): the workflow's own step checks the browser
 * first, and a layout suite that skips on CI would guard nothing.
 */

const PHONE_WIDTHS = [360, 390] as const;
const DESKTOP_WIDTH = 1280;

const RUNS: LayoutRun[] = [
  { id: 'fr@360', lang: 'fr', vw: 360 },
  { id: 'fr@390', lang: 'fr', vw: 390 },
  { id: `fr@${DESKTOP_WIDTH}`, lang: 'fr', vw: DESKTOP_WIDTH },
  { id: 'en@360', lang: 'en', vw: 360 },
];

const CHROME = findChrome();

if (!CHROME && IS_CI) {
  throw new Error(
    'No Chrome for the layout harness on CI: set CHROME_BIN or install google-chrome — the suite must run there, never skip.'
  );
}

const results = new Map<string, Map<string, SceneMeasure>>();
let outDir = '';

/** What a scene must be free of, at every width — named so a failure says which. */
function defects(scene: SceneMeasure) {
  return {
    overlaps: scene.overlaps
      .filter((o) => Math.min(o.w, o.h) >= VISIBLE_OVERLAP_PX)
      .map((o) => `${o.a} ∩ ${o.b} = ${o.w}×${o.h} @(${o.x},${o.y})`),
    clipped: scene.clipped
      .filter((c) => !c.scroller)
      .map((c) => `${c.label} by ${c.by}: top ${c.top} right ${c.right} bottom ${c.bottom} left ${c.left}`),
    spills: scene.spills.map((s) => `${s.label}: ${s.textW} px in ${s.container} of ${s.containerW}`),
    beyondCard: scene.body.beyondCard,
  };
}

const sceneOf = (run: LayoutRun, name: string): SceneMeasure => {
  const scene = results.get(run.id)?.get(name);
  if (!scene) throw new Error(`No measurement for ${name} in ${run.id}`);
  return scene;
};

describe.skipIf(!CHROME)('dashboard layout in a real engine (SMA-336 mobile lot, D7)', () => {
  beforeAll(async () => {
    outDir = makeOutDir();
    await buildHarness(outDir);
    writePage(outDir);
    const measured = await Promise.all(RUNS.map((run) => measureRun(CHROME!, outDir, run)));
    RUNS.forEach((run, index) => {
      results.set(run.id, new Map(measured[index]!.map((scene) => [scene.scene, scene])));
    });
  }, 180_000);

  afterAll(() => {
    if (outDir) removeOutDir(outDir);
  });

  it('measured every scene, in Inter, in every run', () => {
    for (const run of RUNS) {
      const scenes = results.get(run.id)!;
      expect(scenes.size, run.id).toBe(LAYOUT_SCENES.length);
      for (const scene of scenes.values()) {
        expect(scene.fontLoaded, `${run.id} ${scene.scene}: Inter not loaded`).toBe(true);
      }
    }
  });

  describe.each(RUNS)('$id', (run) => {
    it.each(LAYOUT_SCENES.map((scene) => scene.name))('%s: no overlap, nothing clipped, nothing beyond the card', (name) => {
      const scene = sceneOf(run, name);
      expect(defects(scene)).toEqual({ overlaps: [], clipped: [], spills: [], beyondCard: 0 });
    });
  });

  describe('the phone (360 and 390 px)', () => {
    it.each(PHONE_WIDTHS)('is one column of 328 / 358 px cards, on rows of 200px at least (D1) — at %i px', (width) => {
      const run = RUNS.find((r) => r.lang === 'fr' && r.vw === width)!;
      for (const scene of results.get(run.id)!.values()) {
        expect(scene.gridAutoRows, `${run.id} ${scene.scene}`).toBe('minmax(200px, auto)');
        expect(scene.card.w, `${run.id} ${scene.scene}`).toBe(width - 32);
        expect(scene.card.h, `${run.id} ${scene.scene}`).toBeGreaterThanOrEqual(200);
      }
    });

    it.each(PHONE_WIDTHS)('gives each garden name 130 px at least on the Medium row at %i px (N1, arbitrage 5)', (width) => {
      const run = RUNS.find((r) => r.lang === 'fr' && r.vw === width)!;
      const scene = sceneOf(run, 'gardens-medium');
      expect(scene.gardenNameWidths).toHaveLength(3);
      for (const nameWidth of scene.gardenNameWidths) expect(nameWidth).toBeGreaterThanOrEqual(130);
    });

    it('draws the six hour slots at 360 px with room for each (V36, arbitrage 1)', () => {
      const scene = sceneOf(RUNS[0]!, 'weather-medium');
      expect(scene.card.h).toBeGreaterThan(300);
      expect(scene.scrollers).toEqual([]);
    });

    it('shows the ten calendar rows and the twelve month initials at 360 px (V38, arbitrage 2)', () => {
      const scene = sceneOf(RUNS[0]!, 'month-large');
      expect(scene.scrollers.filter((s) => s.axis.includes('y'))).toEqual([]);
      expect(scene.ellipsized.filter((e) => e.where.startsWith('month-axis'))).toEqual([]);
    });
  });

  describe(`the desktop (${DESKTOP_WIDTH} px) — pinned as the pre-flight measured it`, () => {
    const desktop = RUNS[2]!;

    it('keeps the card sizes of the 273px grid: 273 × 273, 566 × 273, 566 × 566', () => {
      for (const scene of results.get(desktop.id)!.values()) {
        const expected = scene.size === 'small' ? [273, 273] : scene.size === 'medium' ? [566, 273] : [566, 566];
        expect([scene.card.w, scene.card.h], scene.scene).toEqual(expected);
      }
    });

    it('lets the days yield WHOLE rows to the partial invitation (constat 12): two of five hidden, none cut', () => {
      const scene = sceneOf(desktop, 'weather-large-partial');
      expect(scene.hiddenRows).toBe(2);
    });

    it('caps the four two-line tasks of the long-named gardens by measure (V34, arbitrage 3): one row hidden, « +N » whole', () => {
      const scene = sceneOf(desktop, 'todo-medium-long');
      expect(scene.hiddenRows).toBe(1);
    });

    it('hides a row only where the rows do not fit whole: one on the short-named To-do (a sentence wraps), none on the two-task partial card, none on a located week', () => {
      // Five tasks, four listed: three one-line rows of 30 px (the disc) and
      // « Protéger du froid — 3 plantes sensibles sous 8° (Terrasse), 9° mardi
      // soir » on two lines, 158 px with the gaps for the 150 the list has
      // beside « +N ». On 5282852 the fourth ran 8 px into the gap under the
      // list; clipped by D4 it would be cut, so the measure hides it whole.
      expect(sceneOf(desktop, 'todo-medium').hiddenRows).toBe(1);
      expect(sceneOf(desktop, 'todo-medium-partial').hiddenRows).toBe(0);
      expect(sceneOf(desktop, 'weather-large').hiddenRows).toBe(0);
    });
  });

  it('reads the same measurements twice: the harness is deterministic', () => {
    // Guards the harness itself: a card measured differently on two identical
    // runs would make every assertion above a coin toss.
    const first = results.get('fr@360')!;
    for (const [name, scene] of first) {
      const twin = results.get('en@360')!.get(name)!;
      expect(twin.card.w, name).toBe(scene.card.w);
    }
  });
});
