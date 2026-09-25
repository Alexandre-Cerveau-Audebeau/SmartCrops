import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACTIONS_SCENES, GRID_SCENES, LAYOUT_SCENES } from './scenes';
import { ACTIONS_PROBES, FORCED_ACTION_LABEL, PROBE_SCENES, WIDE_LINE, WIDE_SHORT_HEIGHT } from './probes';
import type { ActionsMeasure, GridMeasure, SceneMeasure } from './harness';
import type { FocusMeasure } from './focusProbe';
import { VISIBLE_OVERLAP_PX, type CardMeasure } from './measure';
import { sizesFor } from '../../constants/dashboardCapabilities';
import type { DashboardBlockKey } from '../../types/Dashboard';
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
 * The instrument is checked too (fix round 2, #11; fix round 3, #12; SMA-446,
 * #13): five PROBES of `probes.tsx` — synthetic cards with a known cut — are
 * measured in every run, apart from the scenes, and the suite asserts what
 * the measure must see in them: a line a scrolling zone holds but the card
 * cuts is a clip by the card, a line under a zone's fold is not, a zone that
 * hides one axis beside a scrolling one cuts for good on the hidden axis, a
 * card that scrolls whole still cuts for good — and the computed `overflow`
 * the widgets' zones rely on is read from the engine.
 *
 * SMA-437 lot 1, PR A, step A7 (pre-flight D19) — the fourth size needs
 * more of the instrument: two TABLET runs, French at 600 px (the lower edge
 * of the two-column grid) and at 1 024 px, their viewport calibrated
 * (`windowFrame`) and asserted; GRID scenes — the Gardener and Expert
 * presets, at rest and in Edit mode — measured card by card AND as a grid
 * (the tracks the engine resolves, no two cards meeting, the Edit-mode
 * controls inside their card and over none of its text); and two probes of
 * the tracks: a pinned card taller than its row is CUT at 273 px (the pinning
 * exists), a short Full-width card takes the height of its content (no
 * floor, A-N10) across every column (A-N12).
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
/** The two tablet runs (SMA-437, D19): the lower edge of the two-column grid, and a landscape tablet. */
const TABLET_WIDTHS = [600, 1024] as const;
const DESKTOP_WIDTH = 1280;
/** A day in another month and another year: the wall clock the sixth run is told (#8). */
const ANOTHER_DAY = Date.UTC(2027, 1, 3, 15, 30, 0);

const RUNS: LayoutRun[] = [
  { id: 'fr@360', lang: 'fr', vw: 360 },
  // The twin of `fr@360`: the same language, the same width — the
  // determinism guard compares the two, box for box (#4).
  { id: 'fr@360-twin', lang: 'fr', vw: 360 },
  { id: 'fr@390', lang: 'fr', vw: 390 },
  ...TABLET_WIDTHS.map((vw) => ({ id: `fr@${vw}`, lang: 'fr' as const, vw })),
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
/** The grid scenes' measurements, by run then by scene name (SMA-437, D19). */
const grids = new Map<string, Map<string, GridMeasure>>();
/** Where the reorderable list leaves the focus, by run then by case (SMA-437 lot 1, PR B, round 1, S1). */
const focusCases = new Map<string, Map<string, FocusMeasure>>();
/** The header's actions zone, by run then by scene name (SMA-437, lot V39). */
const actionsCases = new Map<string, Map<string, ActionsMeasure>>();
/** The zone's probes, by run then by probe name — apart from its scenes, which must be clean; a probe must not be. */
const actionsProbes = new Map<string, Map<string, ActionsMeasure>>();
let outDir = '';

/** The runs whose grid has two or four columns — the tablets and the desktop — where the rows are `auto` and the cards pinned. */
const WIDE_RUNS = RUNS.filter((run) => run.vw >= 600);

/** The grid's width at a run of 600 px or more: the page's 1 200 px cap less its 24 px sides, or the viewport less them. */
const gridWidthAt = (vw: number) => Math.min(vw, 1200) - 48;

/** The pinned height of a size from 600 px up (A-N10), by hand: 273 px a row, 566 on two. */
const PINNED: Record<string, number> = { small: 273, medium: 273, large: 566 };

/** What a scene must be free of, at every width — named so a failure says which. */
function defects(scene: CardMeasure) {
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

/** The measurement of one grid scene in one run, or a throw that names both. */
const gridOf = (run: LayoutRun, name: string): GridMeasure => {
  const grid = grids.get(run.id)?.get(name);
  if (!grid) throw new Error(`No measurement for the grid scene ${name} in ${run.id}`);
  return grid;
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
          const { scenes, grids: measuredGrids, focus, actions } = outcome.value;
          results.set(RUNS[index]!.id, byName(scenes.filter((scene) => scene.probe === null)));
          probes.set(RUNS[index]!.id, byName(scenes.filter((scene) => scene.probe !== null)));
          grids.set(RUNS[index]!.id, new Map(measuredGrids.map((grid) => [grid.scene, grid])));
          focusCases.set(RUNS[index]!.id, new Map(focus.map((measure) => [measure.probe, measure])));
          actionsCases.set(RUNS[index]!.id, new Map(actions.filter((zone) => zone.probe === null).map((zone) => [zone.scene, zone])));
          actionsProbes.set(RUNS[index]!.id, new Map(actions.filter((zone) => zone.probe !== null).map((zone) => [zone.scene, zone])));
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
      expect(grids.get(run.id)?.size, run.id).toBe(GRID_SCENES.length);
      expect(actionsCases.get(run.id)?.size, run.id).toBe(ACTIONS_SCENES.length);
      expect(actionsProbes.get(run.id)?.size, run.id).toBe(ACTIONS_PROBES.length);
      for (const zone of actionsCases.get(run.id)?.values() ?? []) {
        expect(zone.fontLoaded, `${run.id} ${zone.scene}: Inter not loaded`).toBe(true);
      }
    }
  });

  describe.each(RUNS)('$id', (run) => {
    it.each(LAYOUT_SCENES.map((scene) => scene.name))('%s: no overlap, nothing clipped, nothing beyond the card', (name) => {
      const scene = sceneOf(run, name);
      expect(defects(scene)).toEqual({ overlaps: [], clipped: [], spills: [], beyondCard: 0 });
    });

    // SMA-437 (D19): every card of a whole grid, the same four rules — and
    // no two cards meeting, and in Edit mode every control inside its card,
    // over none of its text, with the corner grip on every card that has
    // more than one size at its formula: every one but the Key figures band,
    // whose one size is the Full width (PR B, step B1 — A-N11, C28).
    it.each(GRID_SCENES.map((grid) => grid.name))('%s: every card clean, no two cards meeting, the Edit controls clear of the text', (name) => {
      const grid = gridOf(run, name);
      const scene = GRID_SCENES.find((candidate) => candidate.name === name)!;
      for (const card of grid.cards) {
        expect(defects(card), card.scene).toEqual({ overlaps: [], clipped: [], spills: [], beyondCard: 0 });
        expect(card.fontLoaded, `${card.scene}: Inter not loaded`).toBe(true);
      }
      expect(grid.cardOverlaps).toEqual([]);
      if (grid.editing) {
        expect(grid.controls.map((card) => card.key)).toEqual(grid.cards.map((card) => card.key));
        for (const { key, controls } of grid.controls) {
          expect(controls.filter((control) => !control.inside).map((control) => control.label), key).toEqual([]);
          expect(controls.flatMap((control) => control.covers.map((text) => `${control.label} over ${text}`)), key).toEqual([]);
          const grips = sizesFor(key as DashboardBlockKey, scene.level).length > 1 ? 1 : 0;
          expect(controls.filter((control) => control.grip), key).toHaveLength(grips);
        }
      } else {
        expect(grid.controls).toEqual([]);
      }
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

  describe('the tablet (600 and 1 024 px) — two columns, the cards pinned (SMA-437, D19)', () => {
    it.each(TABLET_WIDTHS)('measures the viewport it claims: %i px, the window calibrated for its frame', (width) => {
      for (const scene of scenesOf(runOf(`fr@${width}`)).values()) {
        expect(scene.viewport, scene.scene).toBe(width);
      }
    });

    it.each(TABLET_WIDTHS)('draws two columns, and every card at its pinned height — at %i px', (width) => {
      const grid = gridWidthAt(width);
      const column = (grid - 20) / 2;
      for (const scene of scenesOf(runOf(`fr@${width}`)).values()) {
        // A Small takes one column; a Medium, a Large and a Full width both
        // (spanFor, two columns — A-N12). The Full width has no pinned height:
        // its own describe below measures it.
        const expectedWidth = scene.size === 'small' ? column : grid;
        if (scene.size === 'wide') {
          expect(scene.card.w, scene.scene).toBe(expectedWidth);
          continue;
        }
        expect([scene.card.w, scene.card.h], scene.scene).toEqual([expectedWidth, PINNED[scene.size]]);
      }
    });
  });

  describe('the grid scenes — the tracks the engine resolves (SMA-437, A-N10)', () => {
    it.each(WIDE_RUNS.map((run) => run.id))('from 600 px up, every resolved row is 273 px and every card its pinned height — but a Full-width row, as tall as its card — %s', (id) => {
      const run = runOf(id);
      for (const grid of GRID_SCENES) {
        const measured = gridOf(run, grid.name);
        // The tracks are `auto` now: a row of 273 px is the PINNED cards' doing,
        // and a Full-width row — the Key figures band of the Expert preset
        // (PR B, step B1) — the height of its one card (A-N10), no floor.
        const free = measured.cards.filter((card) => PINNED[card.size] === undefined);
        const unpinnedTracks = measured.rows.split(' ').filter((track) => track !== '273px').map(parseFloat);
        expect(unpinnedTracks, `${id} ${grid.name}`).toHaveLength(free.length);
        free.forEach((card, index) => {
          expect(unpinnedTracks[index], `${id} ${card.scene}`).toBeCloseTo(card.box.h, 0);
        });
        for (const card of measured.cards.filter((candidate) => PINNED[candidate.size] !== undefined)) {
          expect(card.box.h, `${id} ${card.scene}`).toBe(PINNED[card.size]);
        }
      }
    });

    it.each(PHONE_WIDTHS)('on a phone, one column of cards of 200 px at least, one above the other — at %i px', (width) => {
      for (const grid of GRID_SCENES) {
        const measured = gridOf(runOf(`fr@${width}`), grid.name);
        for (const card of measured.cards) {
          expect(card.box.w, card.scene).toBe(width - 32);
          expect(card.box.h, card.scene).toBeGreaterThanOrEqual(200);
        }
      }
    });
  });

  describe(`the desktop (${DESKTOP_WIDTH} px) — pinned as the pre-flight measured it`, () => {
    const desktop = runOf(`fr@${DESKTOP_WIDTH}`);

    it('keeps the card sizes of the 273px grid: 273 × 273, 566 × 273, 566 × 566', () => {
      // The Full width — the Key figures band — is no card of that grid: as
      // tall as its content (A-N10), measured in its own describe below.
      for (const scene of [...scenesOf(desktop).values()].filter((candidate) => candidate.size !== 'wide')) {
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

  // SMA-437 lot 1, PR B, step B7 (pre-flight C.8, D19) — the Key figures band:
  // one card in its one size, the Full width, as tall as its content (A-N10);
  // its four tiles four in a row from 900 px and two by two below (arbitrage
  // 2); the values of a row starting at one height whatever their labels wrap
  // to (the subgrid, D13); seven digits, hectares and the longest label held in
  // every run (arbitrage 1: 22 px on a phone).
  describe('the Key figures band (SMA-437 lot 1, PR B)', () => {
    const BAND_SCENES = LAYOUT_SCENES.filter((scene) => scene.key === 'keyfigures').map((scene) => scene.name);
    /** The band scenes that draw four tiles — every one but the empty band, which draws its invitation. */
    const TILED = BAND_SCENES.filter((name) => name !== 'keyfigures-wide-empty');
    /** The tiles of a scene, grouped by row (their top). */
    const rowsOf = (scene: SceneMeasure) => {
      const rows = new Map<number, SceneMeasure['keyFigureTiles']>();
      for (const tile of scene.keyFigureTiles) rows.set(tile.y, [...(rows.get(tile.y) ?? []), tile]);
      return [...rows.values()];
    };

    it('measures its four scenes in every run — the defaults, the extreme set, no garden, nothing planted', () => {
      expect(BAND_SCENES).toEqual(['keyfigures-wide', 'keyfigures-wide-extreme', 'keyfigures-wide-empty', 'keyfigures-wide-unplanted']);
      for (const run of RUNS) {
        for (const name of TILED) expect(sceneOf(run, name).keyFigureTiles, `${run.id} ${name}`).toHaveLength(4);
        expect(sceneOf(run, 'keyfigures-wide-empty').keyFigureTiles, run.id).toEqual([]);
      }
    });

    it.each(BAND_SCENES)('%s: at 1 280 px, the whole grid (1 152 px) and as tall as its content — under a row of 273 px, no floor (A-N10)', (name) => {
      const scene = sceneOf(runOf(`fr@${DESKTOP_WIDTH}`), name);
      expect(scene.card.w).toBe(gridWidthAt(DESKTOP_WIDTH));
      expect(scene.card.h).toBeLessThan(273);
      // As tall as its content: the body holds all of it, nothing below its fold.
      expect(scene.body.scrollH).toBeLessThanOrEqual(scene.body.h + 1);
    });

    it.each(TABLET_WIDTHS)('spans both columns of the tablet at %i px (A-N12), as tall as its content', (width) => {
      for (const name of BAND_SCENES) {
        const scene = sceneOf(runOf(`fr@${width}`), name);
        expect(scene.card.w, name).toBe(gridWidthAt(width));
        expect(scene.body.scrollH, name).toBeLessThanOrEqual(scene.body.h + 1);
      }
    });

    it.each(PHONE_WIDTHS)('is one card of 200 to 400 px on a phone, at %i px — its tiles two by two', (width) => {
      for (const name of BAND_SCENES) {
        const scene = sceneOf(runOf(`fr@${width}`), name);
        expect(scene.card.h, name).toBeGreaterThanOrEqual(200);
        expect(scene.card.h, name).toBeLessThanOrEqual(400);
      }
    });

    it('draws its four tiles four in a row from 900 px — at 1 024 and 1 280 px — and two by two below — at 600, 390 and 360 px (arbitrage 2)', () => {
      for (const run of RUNS) {
        const expected = run.vw >= 900 ? [4] : [2, 2];
        for (const name of TILED) {
          expect(rowsOf(sceneOf(run, name)).map((row) => row.length), `${run.id} ${name}`).toEqual(expected);
        }
      }
    });

    it('starts the values of a row at one height, whatever their labels wrap to — the subgrid (D13)', () => {
      for (const run of RUNS) {
        for (const name of TILED) {
          for (const row of rowsOf(sceneOf(run, name))) {
            const tops = row.map((tile) => tile.valueTop!);
            expect(Math.max(...tops) - Math.min(...tops), `${run.id} ${name} ${row.map((t) => t.figure).join(',')}`).toBeLessThanOrEqual(0.5);
          }
        }
      }
    });

    it('holds the extreme set — seven digits, 24,56 ha, the longest label — with nothing clipped and nothing spilled, in every run, in both languages', () => {
      for (const run of RUNS) {
        const scene = sceneOf(run, 'keyfigures-wide-extreme');
        expect(defects(scene), run.id).toEqual({ overlaps: [], clipped: [], spills: [], beyondCard: 0 });
      }
    });

    it('keeps every text of every tile inside its tile — no value running past it, in every run (« sept chiffres tiennent dans une tuile »)', () => {
      // Read against the TILE (`overflow`), which the card-level passes cannot
      // do for a flex item: this is what fixes the 22 px of arbitrage 1.
      for (const run of RUNS) {
        for (const name of TILED) {
          const past = sceneOf(run, name).keyFigureTiles.filter((tile) => tile.overflow > 0.5);
          expect(past.map((tile) => `${tile.figure} +${tile.overflow} px in ${tile.w} px`), `${run.id} ${name}`).toEqual([]);
        }
      }
    });

    it('gives the band three Edit-mode controls and no grip, clear of its title and its tiles — and keeps the ordinary rows around it pinned', () => {
      for (const run of WIDE_RUNS) {
        for (const name of ['grid-expert-edit', 'grid-expert-band-between-edit']) {
          const grid = gridOf(run, name);
          const band = grid.controls.find((card) => card.key === 'keyfigures')!;
          expect(band.controls, `${run.id} ${name}`).toHaveLength(3);
          expect(band.controls.filter((control) => control.grip), `${run.id} ${name}`).toEqual([]);
          expect(band.controls.flatMap((control) => control.covers), `${run.id} ${name}`).toEqual([]);
        }
        const between = gridOf(run, 'grid-expert-band-between');
        const band = between.cards.find((card) => card.key === 'keyfigures')!;
        const others = between.cards.filter((card) => card.key !== 'keyfigures');
        expect(others.some((card) => card.box.y < band.box.y), run.id).toBe(true);
        expect(others.some((card) => card.box.y > band.box.y), run.id).toBe(true);
        for (const card of others) expect(card.box.h, `${run.id} ${card.scene}`).toBe(PINNED[card.size]);
      }
    });
  });

  // SMA-437 lot 1, PR B, round 1, S1 — the reorderable list's promise, « ▲ ▼
  // keep the focus on themselves », read where a keyboard user lives: in a
  // browser, bare and inside the Popover the Key figures gear draws it in.
  // jsdom cannot tell: it drops the focus of a moved node as Chrome does, and
  // React gives it back after its commit — the question is what the engine,
  // the Popover's trap and dnd-kit leave in the end (`focusProbe.tsx`).
  describe('the reorderable list leaves the focus on the control pressed (SMA-437 lot 1, PR B, round 1, S1)', () => {
    const caseOf = (run: LayoutRun, probe: string): FocusMeasure => {
      const measure = focusCases.get(run.id)?.get(probe);
      if (!measure) throw new Error(`No focus measurement ${probe} in ${run.id}`);
      return measure;
    };
    const ROWS = ['Cases libres', 'Occupation', 'Variétés', 'À faire aujourd’hui'];
    /** Each gesture: the order it leaves, and where the focus must be — the row moved, the control pressed, an end reached. */
    const EXPECTED: Array<[string, string[], string, string, boolean]> = [
      ['down row 1', [ROWS[1]!, ROWS[0]!, ROWS[2]!, ROWS[3]!], ROWS[0]!, 'down', false],
      ['down row 3', [ROWS[0]!, ROWS[1]!, ROWS[3]!, ROWS[2]!], ROWS[2]!, 'down', true],
      ['up row 3', [ROWS[0]!, ROWS[2]!, ROWS[1]!, ROWS[3]!], ROWS[2]!, 'up', false],
      ['up row 2', [ROWS[1]!, ROWS[0]!, ROWS[2]!, ROWS[3]!], ROWS[1]!, 'up', true],
      ['handle-down row 1', [ROWS[1]!, ROWS[0]!, ROWS[2]!, ROWS[3]!], ROWS[0]!, 'handle', false],
      ['handle-up row 3', [ROWS[0]!, ROWS[2]!, ROWS[1]!, ROWS[3]!], ROWS[2]!, 'handle', false],
    ];

    it('sees a focus the engine drops: a focused row moved by the DOM alone leaves it on the body (the control case)', () => {
      for (const run of RUNS) {
        const control = caseOf(run, 'control/down row 1');
        expect([control.focusedRow, control.focusedControl, control.blurredOnTheWay], run.id).toEqual([null, 'body', true]);
      }
    });

    it.each(['list', 'popover'])('%s: ▲, ▼ and the handle leave the focus on the control pressed, on the row moved — ends included', (container) => {
      for (const run of RUNS) {
        for (const [gesture, order, row, control, disabled] of EXPECTED) {
          const measure = caseOf(run, `${container}/${gesture}`);
          expect([measure.order, measure.focusedRow, measure.focusedControl, measure.focusedDisabled], `${run.id} ${measure.probe}`).toEqual([
            order,
            row,
            control,
            disabled,
          ]);
        }
      }
    });
  });

  // SMA-437, lot V39, step A4 (pre-flight C.6, n° 1) — the header's actions
  // zone, `DashboardActions`, in every state (`ACTIONS_SCENES`). On a phone,
  // the arrangement of § 4.1 of the v3 contract, drawn again by V3-05: the
  // chip and the indicator on one line, then « Modifier » — « Terminé » in
  // Edit mode — and « Personnaliser » in two equal halves, then « Créer un
  // jardin » the whole width; nothing under the finger moves when the
  // indicator speaks, in every state that holds on one line. The one state
  // that does not — the failure beside the adjusted chip — puts the indicator
  // under the chip for as long as it shows (decision (a) of 25/09, SMA-437).
  describe('the header’s actions zone (SMA-437, lot V39)', () => {
    /** The three phone runs of their own: French at 360 and 390 px, English at 360. */
    const PHONE_IDS = ['fr@360', 'fr@390', 'en@360'];
    /** The gap between the chip and the indicator on their line: V3-05, `.vp.ph .a-top { gap: 10px }`. */
    const CHIP_LINE_GAP = 10;
    /** The gap between two parts of the zone from 600 px up: the header's, as before (`.acts { gap: 12px }`). */
    const WIDE_GAP = 12;
    const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;

    const zoneOf = (run: LayoutRun, name: string): ActionsMeasure => {
      const measure = actionsCases.get(run.id)?.get(name);
      if (!measure) throw new Error(`No measurement for the actions scene ${name} in ${run.id}`);
      return measure;
    };
    const partOf = (measure: ActionsMeasure, part: keyof ActionsMeasure['parts']) => {
      const box = measure.parts[part];
      if (!box) throw new Error(`${measure.scene}: no ${part}`);
      return box;
    };
    /** What the zone must be free of: the card's rules — and its own, every text on one line (V3-05, `.btn` and `.save`: `white-space: nowrap`). */
    const zoneDefects = (measure: ActionsMeasure) => ({ ...defects(measure), wrapped: measure.wrapped });
    /** The chip and what the indicator says hold on one line of the zone: there is nothing to put under the chip, or both widths and their gap fit. */
    const holds = (measure: ActionsMeasure) =>
      !measure.parts.chip ||
      measure.statusText === '' ||
      measure.parts.chip.w + CHIP_LINE_GAP + partOf(measure, 'status').w <= measure.zone.w + 0.5;

    it.each(RUNS.map((run) => run.id))('%s: every state of the zone is clean — no overlap, nothing clipped, nothing past the zone, every text on one line', (id) => {
      for (const scene of ACTIONS_SCENES) {
        expect(zoneDefects(zoneOf(runOf(id), scene.name)), scene.name).toEqual({ overlaps: [], clipped: [], spills: [], beyondCard: 0, wrapped: [] });
      }
    });

    it.each(PHONE_IDS)('%s: gives the zone the whole line of the phone', (id) => {
      const run = runOf(id);
      for (const scene of ACTIONS_SCENES) expect(zoneOf(run, scene.name).zone.w, scene.name).toBe(run.vw - 32);
    });

    it.each(PHONE_IDS)('%s: draws the two repeated buttons side by side, two equal halves of the zone, at rest and in Edit mode (§ 4.1, A-10.3)', (id) => {
      const faults = ACTIONS_SCENES.flatMap((scene) => {
        const measure = zoneOf(runOf(id), scene.name);
        const toggle = partOf(measure, 'toggle');
        const customize = partOf(measure, 'customize');
        const found: string[] = [];
        if (!near(toggle.y, customize.y)) found.push(`the toggle at y ${toggle.y}, Customize at y ${customize.y}`);
        if (!near(toggle.w, customize.w)) found.push(`halves of ${toggle.w} and ${customize.w} px`);
        if (!near(toggle.x, 0) || !near(customize.x + customize.w, measure.zone.w)) {
          found.push(`the pair spans ${toggle.x} to ${customize.x + customize.w} of ${measure.zone.w} px`);
        }
        return found.map((fault) => `${scene.name}: ${fault}`);
      });
      expect(faults).toEqual([]);
    });

    it.each(PHONE_IDS)('%s: puts « Créer un jardin » alone under the pair, the whole width of the zone — at rest only (§ 4.1, A-7)', (id) => {
      const faults = ACTIONS_SCENES.flatMap((scene) => {
        const measure = zoneOf(runOf(id), scene.name);
        if (scene.editing) return measure.parts.create ? [`${scene.name}: a Create button in Edit mode`] : [];
        const create = partOf(measure, 'create');
        const toggle = partOf(measure, 'toggle');
        const found: string[] = [];
        if (!near(create.x, 0) || !near(create.w, measure.zone.w)) found.push(`Create spans ${create.x} to ${create.x + create.w} of ${measure.zone.w} px`);
        if (create.y < toggle.y + toggle.h) found.push(`Create at y ${create.y}, above the pair's bottom ${toggle.y + toggle.h}`);
        return found.map((fault) => `${scene.name}: ${fault}`);
      });
      expect(faults).toEqual([]);
    });

    it.each(PHONE_IDS)('%s: keeps the chip and the indicator on one line whenever they fit — and puts the indicator under the chip in the one state that does not, the failure (decision (a))', (id) => {
      const faults = ACTIONS_SCENES.flatMap((scene) => {
        const measure = zoneOf(runOf(id), scene.name);
        if (!measure.parts.chip || measure.statusText === '') return [];
        const chip = partOf(measure, 'chip');
        const status = partOf(measure, 'status');
        const found: string[] = [];
        if (holds(measure)) {
          if (Math.abs(status.y + status.h / 2 - (chip.y + chip.h / 2)) > 1) found.push(`the indicator at y ${status.y}, off the chip's line (${chip.y}, ${chip.h} px)`);
          if (!near(status.x, chip.x + chip.w + CHIP_LINE_GAP)) found.push(`the indicator at x ${status.x}, not ${CHIP_LINE_GAP} px after the chip`);
        } else {
          if (scene.saveState !== 'error') found.push(`only the failure may leave the chip's line, not « ${measure.statusText} »`);
          if (status.y < chip.y + chip.h || !near(status.x, 0)) found.push(`the indicator at (${status.x}, ${status.y}), not under the chip`);
        }
        return found.map((fault) => `${scene.name}: ${fault}`);
      });
      expect(faults).toEqual([]);
    });

    it.each(PHONE_IDS)('%s: never moves « Terminé » or « Modifier » when the indicator speaks, in every state that holds on one line — one line down in the one that does not (decision (a))', (id) => {
      const run = runOf(id);
      const faults = (['gardener', 'expert'] as const).flatMap((level) =>
        (['rest', 'edit'] as const).flatMap((mode) => {
          const reference = partOf(zoneOf(run, `actions-${level}-${mode}-idle`), 'toggle');
          return (['pending', 'saved', 'error'] as const).flatMap((state) => {
            const measure = zoneOf(run, `actions-${level}-${mode}-${state}`);
            const toggle = partOf(measure, 'toggle');
            const at = `${measure.scene}: the toggle at (${toggle.x}, ${toggle.y}) ${toggle.w} × ${toggle.h}, (${reference.x}, ${reference.y}) ${reference.w} × ${reference.h} before any change`;
            if (holds(measure)) {
              return near(toggle.x, reference.x) && near(toggle.y, reference.y) && near(toggle.w, reference.w) && near(toggle.h, reference.h) ? [] : [at];
            }
            return near(toggle.x, reference.x) && near(toggle.w, reference.w) && toggle.y > reference.y ? [] : [at];
          });
        })
      );
      expect(faults).toEqual([]);
    });

    // SMA-437, lot V39, step A6 — the zone's probe (`probes.tsx`): the
    // instrument must SEE a label too wide for its button. A MUI button wraps
    // it rather than cutting it, so no overlap and no clip say so: the zone's
    // own rule must, and name it.
    it('sees a label too wide for its button: « Personnaliser » forced far too wide is signalled by name, in every run (the zone’s probe)', () => {
      for (const run of RUNS) {
        const probe = actionsProbes.get(run.id)?.get('probe-actions-label-too-wide');
        if (!probe) throw new Error(`No measurement for the zone's probe in ${run.id}`);
        const signalled = Object.values(zoneDefects(probe))
          .flat()
          .filter((entry): entry is string => typeof entry === 'string');
        expect(signalled.join(' | '), run.id).toContain(FORCED_ACTION_LABEL.slice(0, 44));
      }
    });

    it.each(RUNS.filter((run) => run.vw >= 600).map((run) => run.id))('%s: from 600 px up, keeps the header’s row — the pair on one line, and no room for the indicator while it is empty (risk 13)', (id) => {
      const faults = ACTIONS_SCENES.filter((scene) => !scene.unavailable).flatMap((scene) => {
        const measure = zoneOf(runOf(id), scene.name);
        const chip = partOf(measure, 'chip');
        const toggle = partOf(measure, 'toggle');
        const customize = partOf(measure, 'customize');
        const found: string[] = [];
        if (!near(toggle.y, customize.y)) found.push(`the toggle at y ${toggle.y}, Customize at y ${customize.y}`);
        // The gap is read where the toggle shares the chip's line; a zone
        // too narrow for the whole row wraps the pair under it, as before.
        const onChipLine = Math.abs(toggle.y + toggle.h / 2 - (chip.y + chip.h / 2)) <= 1;
        const before = measure.statusText === '' ? chip : partOf(measure, 'status');
        if (onChipLine && !near(toggle.x - (before.x + before.w), WIDE_GAP)) {
          found.push(`${toggle.x - (before.x + before.w)} px from the ${measure.statusText === '' ? 'chip' : 'indicator'} to the toggle`);
        }
        return found.map((fault) => `${scene.name}: ${fault}`);
      });
      expect(faults).toEqual([]);
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

    it('reads each scroll axis on its own: a hidden axis beside a scrolling one is a hard clip, not a fold (#12)', () => {
      // `overflow-x: hidden; overflow-y: auto`: the wide line is cut on the
      // right by the zone, for good — no scroll brings its end into view —
      // while the lines under the fold come back with a scroll. Read with one
      // `scroller` for both axes, the zone passed for scrolling and the wide
      // line's cut for a fold: a hard horizontal clip, ignored.
      const wide = `"${WIDE_LINE.slice(0, 44)}"`;
      const zone = 'div[probe-zone=true]';
      /** Each clip as [label, by, reachable, the edge it is cut on]. */
      const cuts = (probe: SceneMeasure) =>
        probe.clipped.map((c) => [c.label, c.by, c.scroller, c.right > 1 ? 'right' : c.bottom > 1 ? 'bottom' : 'other']);
      for (const run of RUNS) {
        const xHidden = probeOf(run, 'probe-x-hidden-y-auto');
        expect(cuts(xHidden), run.id).toEqual([
          [wide, zone, false, 'right'],
          ['"Past the card, inside the zone"', zone, true, 'bottom'],
          ['"Past the fold of the zone"', zone, true, 'bottom'],
        ]);
        expect(xHidden.hardClipped, run.id).toBe(1);
        // A zone that scrolls vertically loses nothing below the card's edge.
        expect(xHidden.body.beyondCard, run.id).toBe(0);
        // The symmetric zone, `overflow-x: auto; overflow-y: hidden`: the wide
        // line scrolls into view; the lines under the fold are cut for good —
        // and, hidden vertically, they are lost below the card's edge, which
        // `beyondCard` reads on the vertical axis alone.
        const yHidden = probeOf(run, 'probe-x-auto-y-hidden');
        expect(cuts(yHidden), run.id).toEqual([
          [wide, zone, true, 'right'],
          ['"Past the card, inside the zone"', zone, false, 'bottom'],
          ['"Past the fold of the zone"', zone, false, 'bottom'],
        ]);
        expect(yHidden.hardClipped, run.id).toBe(2);
        expect(yHidden.body.beyondCard, run.id).toBeGreaterThan(0);
      }
    });

    it('holds the card as a hard boundary whatever its computed overflow: a card that scrolls still counts its cuts as hard clips (SMA-446, #13)', () => {
      // The probe: the widgets' 200 px card declared `overflow: auto` — a
      // card that would scroll whole, which no card may: a ZONE scrolls
      // inside the card (rule 5), the card itself never does — over a zone
      // that clips nothing. The card is the only clipper of the line 170 px
      // down and the line 320 px down. Read from the card's computed axes,
      // the card passed for a scroller and both cuts for a fold — `hardClipped`
      // 0, `beyondCard` 0 — and `defects()` saw nothing: a loss the instrument
      // hid. The card is a hard boundary whatever its style says.
      for (const run of RUNS) {
        const probe = probeOf(run, 'probe-card-scrolls');
        // The premise, measured: the card computes `auto` on both axes and its zone clips nothing.
        expect(probe.cardOverflow, run.id).toEqual({ x: 'auto', y: 'auto' });
        expect(probe.zoneOverflow, run.id).toEqual({ x: 'visible', y: 'visible' });
        expect(probe.clipped.map((c) => [c.label, c.by, c.scroller]), run.id).toEqual([
          ['"Past the card, inside the zone"', 'card', false],
          ['"Past the fold of the zone"', 'card', false],
        ]);
        expect(probe.hardClipped, run.id).toBe(2);
        expect(probe.body.beyondCard, run.id).toBeGreaterThan(0);
      }
    });

    it('sees the pinning: a Small card taller than its row is CUT at 273 px from 600 px up, and grows on a phone (SMA-437, A-N10)', () => {
      // 400 px of lines in a card as tall as its cell. From 600 px up the cell
      // is pinned: the card stops at 273 px and the lines below are a hard
      // clip by the card. Without the pinning an `auto` row would have grown
      // to the lines and cut nothing.
      for (const run of WIDE_RUNS) {
        const probe = probeOf(run, 'probe-pinned-overflow');
        expect(probe.card.h, run.id).toBe(273);
        expect(probe.hardClipped, run.id).toBeGreaterThan(0);
        expect(new Set(probe.clipped.map((c) => c.by)), run.id).toEqual(new Set(['card']));
      }
      for (const width of PHONE_WIDTHS) {
        const probe = probeOf(runOf(`fr@${width}`), 'probe-pinned-overflow');
        expect(probe.card.h, `fr@${width}`).toBeGreaterThan(273);
        expect(probe.hardClipped, `fr@${width}`).toBe(0);
      }
    });

    it('sees the Full width take the height of its content — no 273 px floor — across every column (SMA-437, A-N10, A-N12)', () => {
      // One line in a Full-width card: 54 px, far under a row. On develop,
      // whose rows were 273 px tracks, this probe measured 273.
      for (const run of WIDE_RUNS) {
        const probe = probeOf(run, 'probe-wide-short');
        expect(probe.card.h, run.id).toBe(WIDE_SHORT_HEIGHT);
        expect(probe.card.w, run.id).toBe(gridWidthAt(run.vw));
        expect(probe.hardClipped, run.id).toBe(0);
      }
      // The phone keeps its `minmax(200px, auto)` floor (V7): the band is 200 px there.
      for (const width of PHONE_WIDTHS) {
        expect(probeOf(runOf(`fr@${width}`), 'probe-wide-short').card.h, `fr@${width}`).toBe(200);
      }
    });

    it('measures the CSS rule the scenes rely on: `overflow-y: auto` declared alone computes `overflow-x` to `auto` in the engine (#12)', () => {
      // Every scrolling zone of the widgets declares `overflowY: 'auto'` and
      // nothing for the other axis. CSS Overflow 3 computes that axis to
      // `auto`, so both scroll and the per-axis reading classifies those zones
      // as the merged one did — read from Chrome here, not from the text of
      // the specification. The mixed zones compute as declared: the probes
      // above measure what they claim to.
      for (const run of RUNS) {
        expect(probeOf(run, 'probe-zone-fold').zoneOverflow, run.id).toEqual({ x: 'auto', y: 'auto' });
        expect(probeOf(run, 'probe-zone-past-card').zoneOverflow, run.id).toEqual({ x: 'auto', y: 'auto' });
        expect(probeOf(run, 'probe-x-hidden-y-auto').zoneOverflow, run.id).toEqual({ x: 'hidden', y: 'auto' });
        expect(probeOf(run, 'probe-x-auto-y-hidden').zoneOverflow, run.id).toEqual({ x: 'auto', y: 'hidden' });
        for (const scene of scenesOf(run).values()) expect(scene.zoneOverflow, `${run.id} ${scene.scene}`).toBeNull();
      }
    });
  });
});
