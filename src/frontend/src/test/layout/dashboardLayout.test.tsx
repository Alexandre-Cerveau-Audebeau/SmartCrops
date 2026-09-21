import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LAYOUT_SCENES } from './scenes';
import { PROBE_SCENES } from './probes';
import type { SceneMeasure } from './harness';
import { VISIBLE_OVERLAP_PX } from './measure';
import {
  IS_CI,
  buildHarness,
  findChrome,
  makeOutDir,
  measureRun,
  removeOutDir,
  terminateChildren,
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
 * with `--dump-dom` (`chrome.mjs`). The page mounts the thirty scenes of
 * `scenes.tsx` through the real `DashboardGrid`, one after the other, and
 * measures each card with `measure.ts`; the dump is one `<pre>` of results.
 * Six runs, in parallel: French at 360 and 390 px (the two phone widths of
 * the visual pass; the phone is emulated on the `#page` width because
 * headless Chrome opens no window under 500 px, and 500 is still under the
 * 600 px breakpoint), French at 1280 px (the desktop — its 24 scenes at zero
 * on `5282852` are pinned here, and the four this lot corrected), English at
 * 360, where « 2 PM » is wider than « 14 h » — and, for the harness's own
 * guards (fix round 1, #4 and #8), French at 360 a SECOND time, identical,
 * and French at 360 with the wall clock told another day. Day and night were
 * measured identical on 290 runs by the pre-flight, so the light theme alone
 * runs.
 *
 * What it asserts, scene by scene, at every width: NO visible overlap between
 * two atoms of a card, NOTHING clipped by the card or by an `overflow:
 * hidden` ancestor (an ellipsis is not a clip; a scrolling zone's fold is not
 * a clip), NO text drawn past its block, NOTHING below the card's edge.
 * Contacts under {@link VISIBLE_OVERLAP_PX} — line boxes touching without a
 * glyph under another — are reported, not failed.
 *
 * The instrument is checked too (fix round 2, #11): two PROBES of
 * `probes.tsx` — synthetic cards with a known cut — are measured in every
 * run, apart from the scenes, and the suite asserts what the measure must
 * see in them: a line a scrolling zone holds but the card cuts is a clip by
 * the card, and a line under a zone's fold is not.
 *
 * Chrome: `CHROME_BIN`, else the usual names on the PATH, else the usual
 * install paths. Without Chrome the suite is SKIPPED on a workstation and
 * FAILS on CI (`CI` is set there): the workflow's own step checks the browser
 * first, and a layout suite that skips on CI would guard nothing. Every run is
 * bounded (S1): a browser past its delay is killed, and every browser still
 * running is killed before the temp folder goes, whether the setup passed or
 * threw.
 */

const PHONE_WIDTHS = [360, 390] as const;
const DESKTOP_WIDTH = 1280;
/** A day in another month and another year: the wall clock the sixth run is told (#8). */
const ANOTHER_DAY = Date.UTC(2027, 1, 3, 15, 30, 0);

const RUNS: LayoutRun[] = [
  { id: 'fr@360', lang: 'fr', vw: 360 },
  // The twin of `fr@360`: the same language, the same width — the
  // determinism guard compares the two, box for box (#4).
  { id: 'fr@360-twin', lang: 'fr', vw: 360 },
  { id: 'fr@390', lang: 'fr', vw: 390 },
  { id: `fr@${DESKTOP_WIDTH}`, lang: 'fr', vw: DESKTOP_WIDTH },
  { id: 'en@360', lang: 'en', vw: 360 },
  // `fr@360` again, with the page told the machine's clock says February
  // 2027: the harness freezes its own instant over it, so the measurements
  // must be the same (#8).
  { id: 'fr@360-clock', lang: 'fr', vw: 360, clockMs: ANOTHER_DAY },
];

/** A run by its id — never by its position, which the list above does not promise. */
const runOf = (id: string): LayoutRun => {
  const run = RUNS.find((candidate) => candidate.id === id);
  if (!run) throw new Error(`No layout run ${id}`);
  return run;
};

const CHROME = findChrome();

if (!CHROME && IS_CI) {
  throw new Error(
    'No Chrome for the layout harness on CI: set CHROME_BIN or install google-chrome — the suite must run there, never skip.'
  );
}

const results = new Map<string, Map<string, SceneMeasure>>();
/** The probes' measurements, by run then by probe name — apart from the scenes, which must be clean; a probe must not be. */
const probes = new Map<string, Map<string, SceneMeasure>>();
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

/** The measurement of one scene in one run, or a throw that names both. */
const sceneOf = (run: LayoutRun, name: string): SceneMeasure => {
  const scene = results.get(run.id)?.get(name);
  if (!scene) throw new Error(`No measurement for ${name} in ${run.id}`);
  return scene;
};

/** Every scene of a run, keyed by name. */
const scenesOf = (run: LayoutRun): Map<string, SceneMeasure> => {
  const scenes = results.get(run.id);
  if (!scenes) throw new Error(`No measurements for ${run.id}`);
  return scenes;
};

/** The measurement of one probe in one run, or a throw that names both. */
const probeOf = (run: LayoutRun, name: string): SceneMeasure => {
  const probe = probes.get(run.id)?.get(name);
  if (!probe) throw new Error(`No measurement for the probe ${name} in ${run.id}`);
  return probe;
};

describe.skipIf(!CHROME)('dashboard layout in a real engine (SMA-336 mobile lot, D7)', () => {
  beforeAll(async () => {
    outDir = makeOutDir();
    try {
      await buildHarness(outDir);
      writePage(outDir);
      // Every run settles — measured, or killed past its delay — before the
      // first failure is raised: no browser is left behind a thrown hook.
      const settled = await Promise.allSettled(RUNS.map((run) => measureRun(CHROME!, outDir, run)));
      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') {
          const byName = (measured: SceneMeasure[]) => new Map(measured.map((scene) => [scene.scene, scene]));
          results.set(RUNS[index]!.id, byName(outcome.value.filter((scene) => scene.probe === null)));
          probes.set(RUNS[index]!.id, byName(outcome.value.filter((scene) => scene.probe !== null)));
        }
      });
      const failed = settled.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
      if (failed) throw failed.reason;
    } finally {
      // Whether the setup passed or threw: nothing of Chrome survives it.
      await terminateChildren();
    }
  }, 180_000);

  afterAll(async () => {
    // The profiles are deleted only once every browser has exited.
    await terminateChildren();
    if (outDir) removeOutDir(outDir);
  });

  it('measured every scene and every probe, in Inter, in every run', () => {
    for (const run of RUNS) {
      const scenes = scenesOf(run);
      expect(scenes.size, run.id).toBe(LAYOUT_SCENES.length);
      for (const scene of scenes.values()) {
        expect(scene.fontLoaded, `${run.id} ${scene.scene}: Inter not loaded`).toBe(true);
      }
      expect(probes.get(run.id)?.size, run.id).toBe(PROBE_SCENES.length);
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
      const run = runOf(`fr@${width}`);
      for (const scene of scenesOf(run).values()) {
        expect(scene.gridAutoRows, `${run.id} ${scene.scene}`).toBe('minmax(200px, auto)');
        expect(scene.card.w, `${run.id} ${scene.scene}`).toBe(width - 32);
        expect(scene.card.h, `${run.id} ${scene.scene}`).toBeGreaterThanOrEqual(200);
      }
    });

    it.each(PHONE_WIDTHS)('gives each garden name 130 px at least on the Medium row at %i px (N1, arbitrage 5)', (width) => {
      const scene = sceneOf(runOf(`fr@${width}`), 'gardens-medium');
      expect(scene.gardenNameWidths).toHaveLength(3);
      for (const nameWidth of scene.gardenNameWidths) expect(nameWidth).toBeGreaterThanOrEqual(130);
    });

    it('draws the six hour slots at 360 px with room for each (V36, arbitrage 1)', () => {
      const scene = sceneOf(runOf('fr@360'), 'weather-medium');
      expect(scene.card.h).toBeGreaterThan(300);
      expect(scene.scrollers).toEqual([]);
    });

    it('shows the ten calendar rows and the twelve month initials at 360 px (V38, arbitrage 2)', () => {
      const scene = sceneOf(runOf('fr@360'), 'month-large');
      expect(scene.scrollers.filter((s) => s.axis.includes('y'))).toEqual([]);
      expect(scene.ellipsized.filter((e) => e.where.startsWith('month-axis'))).toEqual([]);
    });
  });

  describe(`the desktop (${DESKTOP_WIDTH} px) — pinned as the pre-flight measured it`, () => {
    const desktop = runOf(`fr@${DESKTOP_WIDTH}`);

    it('keeps the card sizes of the 273px grid: 273 × 273, 566 × 273, 566 × 566', () => {
      for (const scene of scenesOf(desktop).values()) {
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

    it('measures the Medium tips too (#2): two tips that fit whole hide nothing, on the short and the long garden names', () => {
      expect(sceneOf(desktop, 'tips-medium').hiddenRows).toBe(0);
      expect(sceneOf(desktop, 'tips-medium-long').hiddenRows).toBe(0);
    });
  });

  describe('the harness itself', () => {
    it('reads the same measurements twice: two identical runs agree on every scene, box for box (#4)', () => {
      // Guards the harness: a card measured differently on two identical
      // runs would make every assertion above a coin toss. `fr@360-twin` is
      // `fr@360` again — the whole measurement is compared, not a width.
      const twin = scenesOf(runOf('fr@360-twin'));
      for (const [name, scene] of scenesOf(runOf('fr@360'))) {
        expect(twin.get(name), name).toEqual(scene);
      }
    });

    it('does not follow the machine’s date: told another day, the same run measures the same, box for box (#8)', () => {
      // The page is told the wall clock says 3 February 2027; the harness
      // freezes its own instant over it (`freeze.ts`), so the fixtures'
      // months, the calendar's column and the relative dates do not move.
      const other = scenesOf(runOf('fr@360-clock'));
      for (const [name, scene] of scenesOf(runOf('fr@360'))) {
        expect(other.get(name), name).toEqual(scene);
      }
    });

    it('draws the same card frame in both languages: fr@360 and en@360 share the card widths (language parity)', () => {
      // Not determinism — the twin above is that: the frame comes from the
      // grid track, and « 2 PM » wider than « 14 h » may only change what
      // is drawn inside it.
      const english = scenesOf(runOf('en@360'));
      for (const [name, scene] of scenesOf(runOf('fr@360'))) {
        expect(english.get(name)?.card.w, name).toBe(scene.card.w);
      }
    });

    it('counts what the CARD cuts inside a scrolling zone as clipped by the card, never as the zone’s fold (#11)', () => {
      // The probe: a 200 px card whose zone runs 60 px past its edge. A line
      // 170 px down the zone fits the zone and is cut by the card; a line past
      // the zone's fold is cut by both, and scrolling the zone to its end
      // still leaves it past the card. Neither is reachable: both are HARD
      // clips, by the card. Measured against the nearest clipping ancestor
      // alone, both read as a scroller's fold and were ignored.
      for (const run of RUNS) {
        const probe = probeOf(run, 'probe-zone-past-card');
        const hard = probe.clipped.filter((c) => !c.scroller).map((c) => [c.label, c.by]);
        expect(hard, run.id).toEqual([
          ['"Past the card, inside the zone"', 'card'],
          ['"Past the fold of the zone"', 'card'],
        ]);
        expect(probe.hardClipped, run.id).toBe(2);
        // The cut is the card's edge, not the zone's: the first line loses
        // under 20 px, the second every pixel of its glyphs.
        expect(probe.clipped.find((c) => c.label === '"Past the card, inside the zone"')?.bottom, run.id).toBeLessThan(20);
      }
    });

    it('still lets a scrolling zone keep its lines under its fold: the fold probe has no hard clip (rule 5, #11)', () => {
      // The same lines in a zone that fits the card: cut by the zone alone,
      // brought back by a scroll — a fold, not a loss.
      for (const run of RUNS) {
        const probe = probeOf(run, 'probe-zone-fold');
        expect(probe.hardClipped, run.id).toBe(0);
        expect(probe.clipped.map((c) => [c.label, c.scroller]), run.id).toEqual([
          ['"Past the card, inside the zone"', true],
          ['"Past the fold of the zone"', true],
        ]);
      }
    });
  });
});
