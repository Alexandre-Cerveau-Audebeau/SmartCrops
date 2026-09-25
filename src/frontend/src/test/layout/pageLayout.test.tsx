import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IS_CI, findChrome, makeOutDir, removeOutDir, terminateChildren } from './chrome.mjs';
import { buildPageHarness, openPage, writePageHarness, type PageSession } from './pageChrome.mjs';
import type { PageMeasure } from './pageHarness';

/**
 * SMA-437, lot V39, PR B, step B9 — the compact action bar ON THE WHOLE PAGE,
 * in a real engine (pre-flight, § C.6 n° 2 and 3; technical decision 12).
 *
 * What jsdom cannot prove, proven here: the bar's place under the real site
 * navbar, its stacking, its height; the relay at the scroll position the
 * header's buttons cross the line « navbar + bar », both ways; the real focus
 * moving between the twins through `inert`; `scroll-padding-top` bringing a
 * focused control out from under the two bars; the content that stays still
 * when Edit mode is toggled from the bar; no bar at the Novice formula nor
 * while the layout loads. At five viewports — two phones, a portrait tablet,
 * a desktop, a phone in landscape — at the Gardener and the Expert formulas,
 * out of and in Edit mode; at night and in English at 360 and 1 280 px.
 *
 * And the PROBES (the rule of SMA-446): the page broken on purpose — the bar
 * over the navbar, a label wider than its half, a save region born filled, a
 * toggle unmounted at the key — each of which the SAME checks must report.
 *
 * Chrome as the scenes' suite finds it: without it the suite is SKIPPED on a
 * workstation and FAILS on CI.
 */

const CHROME = findChrome();

if (!CHROME && IS_CI) {
  throw new Error(
    'No Chrome for the page harness on CI: set CHROME_BIN or install google-chrome — the suite must run there, never skip.'
  );
}

interface PageView {
  id: string;
  width: number;
  height: number;
  /** A device: its scrollbar drawn over the page, as on a phone or a tablet. */
  mobile: boolean;
}

/** The pre-flight's five viewports (§ C.6 n° 2): two phones, a portrait tablet, a desktop, a phone in landscape. */
const VIEWS: PageView[] = [
  { id: '360x780', width: 360, height: 780, mobile: true },
  { id: '390x844', width: 390, height: 844, mobile: true },
  { id: '768x1024', width: 768, height: 1024, mobile: true },
  { id: '1280x800', width: 1280, height: 800, mobile: false },
  { id: '568x320', width: 568, height: 320, mobile: true },
];

const LEVELS = ['gardener', 'expert'] as const;
type Level = (typeof LEVELS)[number];

/** The bar at rest, and in Edit mode from 600 px: 53 px and its 1 px rule (V3-05, `.cb-in`). */
const BAR_HEIGHT = 54;
/** The bar in Edit mode on a phone: two lines (A-10.4), 72.7 px drawn — its `offsetHeight` rounds it. */
const BAR_HEIGHT_PHONE_EDIT = 73;
/** The relay is proven at the computed scroll position, give or take the pre-flight's 2 px step. */
const RELAY_STEP = 2;

/** One scenario of a formula at one viewport: the measurements its steps took. */
interface LevelRun {
  /** The top of the page, before anything. */
  top: PageMeasure;
  /** Out of Edit mode: the scroll position the header's buttons cross the line, and the page just before it, just after it, and back before it. */
  relay: { expected: number; before: PageMeasure; after: PageMeasure; back: PageMeasure };
  /** Mid-page, the header's toggle focused before the scroll. */
  mid: PageMeasure;
  /** Enter on the bar's toggle, mid-page: Edit mode; and where the first card visible under the bars stood before and after. */
  enter: { after: PageMeasure; card: string; before: number; now: number };
  /** In Edit mode: the relay again — the bar two lines tall on a phone —, then back mid-page. */
  editRelay: { expected: number; before: PageMeasure; after: PageMeasure };
  /** A control put under the two bars, then focused: where it ends, and the line it must clear. */
  padding: { top: number; line: number };
  /** A gesture in Edit mode: the save's region while it saves, and once saved. */
  save: { idle: PageMeasure; pending: PageMeasure; saved: PageMeasure };
  /** Enter on the bar's toggle again: out of Edit mode, the content still. */
  leave: { after: PageMeasure; card: string; before: number; now: number };
}

/** What one viewport's session measured, or why it could not. */
interface ViewResult {
  levels: Partial<Record<Level, LevelRun>>;
  novice: { top: PageMeasure; mid: PageMeasure } | null;
  loading: PageMeasure | null;
  night: { rest: PageMeasure; edit: PageMeasure } | null;
  english: { rest: PageMeasure; edit: PageMeasure } | null;
  probes: Record<string, PageMeasure>;
}

const results = new Map<string, ViewResult>();
const failures = new Map<string, unknown>();
let outDir = '';

const selectors = {
  headerToggle: '[data-dashboard-header] [data-page-action="edit"]',
  barToggle: '[data-compact-bar] [data-page-action="edit"]',
  region: '[data-save-status]',
  hide: 'button[aria-label^="Masquer "]',
  drag: 'button[aria-label^="Déplacer "]',
  bar: '[data-compact-bar]',
};

/** A phone: under 600 px wide, the bar in two lines in Edit mode. */
const isPhone = (view: PageView) => view.width < 600;

/** The line the bar relays at, in the window: the navbar's bottom plus the bar's height. */
const lineOf = (m: PageMeasure) => m.navbar.y + m.navbar.h + (m.bar?.height ?? 0);

/** The scroll position the header's repeated buttons cross that line. */
const relayOf = (m: PageMeasure) => m.headerRow.docBottom - lineOf(m);

// ── The checks — the SAME for the scenes and for the probes ────────────────

/** The bar hidden: invisible, inert and silent; the header's buttons live. */
function hiddenFaults(m: PageMeasure): string[] {
  const faults: string[] = [];
  if (!m.bar) return faults;
  if (m.bar.visibility !== 'hidden') faults.push(`the bar is ${m.bar.visibility}`);
  if (m.bar.ariaHidden !== 'true') faults.push('the bar is not aria-hidden');
  if (!m.bar.inert) faults.push('the bar is not inert');
  if (m.headerRow.inert || m.headerRow.ariaHidden !== null) faults.push('the header’s buttons are not live');
  return faults;
}

/**
 * The bar shown where it belongs: visible, live, the header's two buttons
 * inert; right under the navbar and below it in the stacking; over nothing
 * else — what is at its centre is itself —; the window's width; its height.
 */
function placedFaults(m: PageMeasure, height: number): string[] {
  if (!m.bar) return ['no bar on the page'];
  const bar = m.bar;
  const faults: string[] = [];
  const navBottom = m.navbar.y + m.navbar.h;
  if (bar.visibility !== 'visible') faults.push(`the bar is ${bar.visibility}`);
  if (bar.ariaHidden !== null || bar.inert) faults.push('the bar is not live');
  if (!m.headerRow.inert || m.headerRow.ariaHidden !== 'true') faults.push('the header’s buttons are still live');
  if (Math.abs(bar.rect.y - navBottom) > 0.5) faults.push(`the bar’s top at ${bar.rect.y}, the navbar’s bottom at ${navBottom}`);
  if (bar.rect.y < navBottom - 0.5) faults.push(`the bar overlaps the navbar by ${Math.round((navBottom - bar.rect.y) * 10) / 10} px`);
  if (!(bar.zIndex < m.navbar.zIndex)) faults.push(`the bar’s z-index ${bar.zIndex}, the navbar’s ${m.navbar.zIndex}`);
  if (!bar.hitInside) faults.push('something covers the bar’s centre');
  if (Math.abs(bar.rect.w - m.navbar.w) > 0.5) faults.push(`the bar is ${bar.rect.w} px wide, the navbar ${m.navbar.w}`);
  if (Math.abs(bar.height - height) > 0.5) faults.push(`the bar is ${bar.height} px high, not ${height}`);
  return faults;
}

/** Every text of the bar whole, on one line, clear of every other — the scenes' own instrument. */
function textFaults(m: PageMeasure): string[] {
  if (!m.bar) return ['no bar on the page'];
  // A hidden bar is not measured: never a silent pass on nothing.
  if (m.bar.visibility !== 'visible') return [`the bar is ${m.bar.visibility}: nothing measured`];
  const { visibleOverlaps, clipped, spills, ellipsized, wrapped } = m.bar;
  return [
    ...(visibleOverlaps > 0 ? [`${visibleOverlaps} overlap(s)`] : []),
    ...clipped.map((what) => `clipped: ${what}`),
    ...spills.map((what) => `spills: ${what}`),
    ...ellipsized.map((what) => `ellipsized: ${what}`),
    ...wrapped.map((what) => `wrapped: ${what}`),
  ];
}

/** ONE region for the save — the header's, never in an inert row — and none in the bar. */
function regionFaults(m: PageMeasure): string[] {
  const faults: string[] = [];
  if (m.regions.count !== 1) faults.push(`${m.regions.count} save regions`);
  if (!m.regions.inHeader) faults.push('the save region is not in the header');
  if (m.regions.inInert) faults.push('the save region is in an inert row');
  if (m.bar && m.bar.statusRoles > 0) faults.push(`${m.bar.statusRoles} live region(s) in the bar`);
  return faults;
}

/** The focus is on the node marked `mark` — the same node, not a look-alike, and never the body. */
function focusFaults(m: PageMeasure, mark: string): string[] {
  if (m.active.where === 'body') return ['the focus fell to the body'];
  return m.active.mark === mark ? [] : [`the focus is on ${m.active.where} « ${m.active.text} » (${m.active.mark ?? 'unmarked'}), not on ${mark}`];
}

/** The region carrying a state is the node marked before any gesture: born empty, the same node since. */
function sameRegionFaults(m: PageMeasure, text: string): string[] {
  const faults: string[] = [];
  if (m.regions.mark !== 'region') faults.push('the region is not the node that was there before any gesture');
  if (m.regions.text !== text) faults.push(`the region says « ${m.regions.text} », not « ${text} »`);
  return faults;
}

// ── The scenarios ───────────────────────────────────────────────────────────

const measure = (session: PageSession) => session.evaluate<PageMeasure>('window.__page.measure()');
const scroll = (session: PageSession, y: number) => session.evaluate(`window.__page.scrollTo(${Math.max(0, Math.round(y))})`);
const settle = (session: PageSession, frames = 4) => session.evaluate(`window.__page.settle(${frames})`);
const call = (session: PageSession, expression: string) => session.evaluate(`window.__page.${expression}`);

/** The whole scenario of one formula at one viewport. */
async function runLevel(session: PageSession, level: Level): Promise<LevelRun> {
  await session.navigate(`level=${level}&theme=light&lang=fr`);
  await call(session, `mark('header-toggle', ${JSON.stringify(selectors.headerToggle)})`);
  await call(session, `mark('bar-toggle', ${JSON.stringify(selectors.barToggle)})`);
  await call(session, `mark('region', ${JSON.stringify(selectors.region)})`);
  const top = await measure(session);

  // The relay, out of Edit mode.
  const expected = relayOf(top);
  await scroll(session, expected - RELAY_STEP);
  const before = await measure(session);
  await scroll(session, expected + RELAY_STEP);
  const after = await measure(session);
  await scroll(session, expected - RELAY_STEP);
  const back = await measure(session);

  // The header's toggle focused at the top; mid-page, the focus has followed it into the bar.
  await scroll(session, 0);
  await call(session, `focus(${JSON.stringify(selectors.headerToggle)})`);
  await scroll(session, Math.min(top.maxScroll, top.headerRow.docBottom + 300));
  const mid = await measure(session);

  // Enter, at the keyboard, on the bar's toggle: Edit mode, the content still.
  const anchor = mid.firstCard?.key ?? '';
  const cardSelector = JSON.stringify(`[data-widget="${anchor}"]`);
  const anchorBefore = await session.evaluate<number>(`window.__page.top(${cardSelector})`);
  await session.press('Enter');
  await settle(session);
  const enterAfter = await measure(session);
  const anchorNow = await session.evaluate<number>(`window.__page.top(${cardSelector})`);
  const enter = { after: enterAfter, card: anchor, before: anchorBefore, now: anchorNow };

  // The relay in Edit mode — the phone's bar is two lines tall — and the focus back in the header at the top.
  const editExpected = relayOf(enterAfter);
  await scroll(session, editExpected - RELAY_STEP);
  const editBefore = await measure(session);
  await scroll(session, editExpected + RELAY_STEP);
  const editAfter = await measure(session);

  // scroll-padding-top: a drag handle put 70 px from the top — under the two bars — then focused.
  await scroll(session, Math.min(enterAfter.maxScroll, enterAfter.headerRow.docBottom + 300));
  const handles = await session.evaluate<number>(`window.__page.count(${JSON.stringify(selectors.drag)})`);
  const handle = Math.min(3, handles - 1);
  const handleTop = await session.evaluate<number>(`window.__page.docTop(${JSON.stringify(selectors.drag)}, ${handle})`);
  await scroll(session, handleTop - 70);
  const underBars = await measure(session);
  await call(session, `focus(${JSON.stringify(selectors.drag)}, true, ${handle})`);
  await settle(session);
  const padding = {
    top: await session.evaluate<number>(`window.__page.top(${JSON.stringify(selectors.drag)}, ${handle})`),
    line: lineOf(underBars),
  };

  // A gesture: a widget hidden. The header's region says it, the same node, and the bar's copy with it.
  // The save is HELD (fix round 1, R1): « Enregistrement… » cannot end under the measurement that reads it.
  const idle = await measure(session);
  const writes = await session.evaluate<number>('window.__page.saves()');
  await call(session, 'holdSaves()');
  await call(session, `click(${JSON.stringify(selectors.hide)})`);
  await session.waitFor(`document.querySelector('[data-save-status]').textContent === 'Enregistrement…'`, 'the save starting');
  const pending = await measure(session);
  await session.waitFor(`window.__page.saves() > ${writes}`, 'the save leaving');
  await call(session, 'releaseSaves()');
  await session.waitFor(`document.querySelector('[data-save-status]').textContent === 'Enregistré'`, 'the save ending');
  const saved = await measure(session);

  // Enter on the bar's toggle again: out of Edit mode, the content still.
  await scroll(session, Math.min(saved.maxScroll, saved.headerRow.docBottom + 300));
  await call(session, `focus(${JSON.stringify(selectors.barToggle)})`);
  const leaveMeasure = await measure(session);
  const leaveAnchor = leaveMeasure.firstCard?.key ?? '';
  const leaveSelector = JSON.stringify(`[data-widget="${leaveAnchor}"]`);
  const leaveBefore = await session.evaluate<number>(`window.__page.top(${leaveSelector})`);
  await session.press('Enter');
  await settle(session);
  const leaveAfter = await measure(session);
  const leaveNow = await session.evaluate<number>(`window.__page.top(${leaveSelector})`);

  return {
    top,
    relay: { expected, before, after, back },
    mid,
    enter,
    editRelay: { expected: editExpected, before: editBefore, after: editAfter },
    padding,
    save: { idle, pending, saved },
    leave: { after: leaveAfter, card: leaveAnchor, before: leaveBefore, now: leaveNow },
  };
}

/** Mid-page out of Edit mode, then in it — for the night and for English. */
async function restAndEdit(session: PageSession, query: string) {
  await session.navigate(query);
  const top = await measure(session);
  await scroll(session, Math.min(top.maxScroll, top.headerRow.docBottom + 300));
  const rest = await measure(session);
  await call(session, `focus(${JSON.stringify(selectors.barToggle)})`);
  await session.press('Enter');
  await settle(session);
  return { rest, edit: await measure(session) };
}

/** One probe: the page broken as `probe` breaks it, then measured by the same means. */
async function runProbe(session: PageSession, probe: string): Promise<PageMeasure> {
  await session.navigate('level=expert&theme=light&lang=fr');
  await call(session, `mark('region', ${JSON.stringify(selectors.region)})`);
  await call(session, `mark('bar-toggle', ${JSON.stringify(selectors.barToggle)})`);
  const top = await measure(session);
  await scroll(session, Math.min(top.maxScroll, top.headerRow.docBottom + 300));
  if (probe === 'unmount-toggle') {
    await call(session, `focus(${JSON.stringify(selectors.barToggle)})`);
    await call(session, `probe('unmount-toggle')`);
    await session.press('Enter');
    await settle(session);
    return measure(session);
  }
  if (probe === 'filled-region') {
    // Into Edit mode from the header, at the top — the gesture that follows needs it, not the bar.
    await scroll(session, 0);
    await call(session, `click(${JSON.stringify(selectors.headerToggle)})`);
    await settle(session);
    await call(session, `probe('filled-region')`);
    await call(session, `click(${JSON.stringify(selectors.hide)})`);
    await settle(session, 6);
    return measure(session);
  }
  await call(session, `probe(${JSON.stringify(probe)})`);
  await settle(session);
  return measure(session);
}

/** Every scenario of one viewport, in one Chrome. */
async function runView(view: PageView): Promise<ViewResult> {
  const session = await openPage(CHROME!, outDir, { label: view.id, width: view.width, height: view.height, mobile: view.mobile });
  try {
    const result: ViewResult = { levels: {}, novice: null, loading: null, night: null, english: null, probes: {} };
    for (const level of LEVELS) result.levels[level] = await runLevel(session, level);

    // The Novice formula: no bar at any position (A-9).
    await session.navigate('level=novice&theme=light&lang=fr');
    const noviceTop = await measure(session);
    await scroll(session, Math.min(noviceTop.maxScroll, noviceTop.headerRow.docBottom + 300));
    result.novice = { top: noviceTop, mid: await measure(session) };

    // The layout never arrives: the page scrolled over its skeletons, no bar (A-10.2).
    await session.navigate('level=expert&theme=light&lang=fr&prefs=pending');
    const loadingTop = await measure(session);
    await scroll(session, loadingTop.maxScroll);
    result.loading = await measure(session);

    if (view.width === 360 || view.width === 1280) {
      result.night = await restAndEdit(session, 'level=expert&theme=dark&lang=fr');
    }
    if (view.width === 360) {
      result.english = await restAndEdit(session, 'level=expert&theme=light&lang=en');
      for (const probe of ['bar-top-40', 'wide-label', 'filled-region', 'unmount-toggle']) {
        result.probes[probe] = await runProbe(session, probe);
      }
    }
    return result;
  } finally {
    await session.close();
  }
}

/** The result of a viewport, or a throw that says why it has none. */
const viewOf = (id: string): ViewResult => {
  const result = results.get(id);
  if (!result) throw new Error(`No measurement for ${id}: ${String(failures.get(id) ?? 'not run')}`);
  return result;
};
const levelOf = (id: string, level: Level): LevelRun => {
  const run = viewOf(id).levels[level];
  if (!run) throw new Error(`No scenario ${level} at ${id}`);
  return run;
};

const CASES = VIEWS.flatMap((view) => LEVELS.map((level) => ({ id: view.id, level, view })));

describe.skipIf(!CHROME)('the compact action bar on the whole page, in a real engine (SMA-437, lot V39, B9)', () => {
  beforeAll(async () => {
    outDir = makeOutDir();
    try {
      await buildPageHarness(outDir);
      writePageHarness(outDir);
      const settled = await Promise.allSettled(VIEWS.map((view) => runView(view)));
      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') results.set(VIEWS[index]!.id, outcome.value);
        else failures.set(VIEWS[index]!.id, outcome.reason);
      });
    } finally {
      await terminateChildren();
    }
  }, 240_000);

  afterAll(async () => {
    // Still tried when a browser outlived its kills; `removeOutDir` never throws.
    try {
      await terminateChildren();
    } finally {
      if (outDir) removeOutDir(outDir);
    }
  });

  it('ran every viewport to its end, in Inter, at the viewport it claims', () => {
    expect([...failures.entries()].map(([id, reason]) => `${id}: ${String(reason)}`)).toEqual([]);
    for (const view of VIEWS) {
      const top = levelOf(view.id, 'expert').top;
      expect(top.viewport, view.id).toEqual({ w: view.width, h: view.height });
      expect(top.fontLoaded, view.id).toBe(true);
    }
  });

  describe('at the top of the page', () => {
    it.each(CASES)('$id $level: no bar — hidden, inert, aria-hidden — and the header’s buttons live', ({ id, level }) => {
      expect(hiddenFaults(levelOf(id, level).top)).toEqual([]);
    });
  });

  describe('the relay at the same place (A-10.1)', () => {
    it.each(CASES)('$id $level: shows as the header’s buttons pass under the navbar plus the bar, and leaves as they come back — out of Edit mode', ({ id, level }) => {
      const { relay } = levelOf(id, level);
      expect({
        before: hiddenFaults(relay.before),
        after: placedFaults(relay.after, BAR_HEIGHT),
        back: hiddenFaults(relay.back),
      }).toEqual({ before: [], after: [], back: [] });
    });

    it.each(CASES)('$id $level: does the same in Edit mode, at the line of its own Edit-mode height', ({ id, level, view }) => {
      const { editRelay } = levelOf(id, level);
      expect({
        before: hiddenFaults(editRelay.before),
        after: placedFaults(editRelay.after, isPhone(view) ? BAR_HEIGHT_PHONE_EDIT : BAR_HEIGHT),
      }).toEqual({ before: [], after: [] });
    });
  });

  describe('mid-page (A-10.2, A-10.3, A-10.7, A-10.8)', () => {
    it.each(CASES)('$id $level: sits right under the navbar, below it, over nothing, the window’s width, 54 px — « Modifier » and « Personnaliser », nothing else', ({ id, level }) => {
      const { mid } = levelOf(id, level);
      expect(placedFaults(mid, BAR_HEIGHT)).toEqual([]);
      expect(mid.bar?.buttons).toEqual(['Modifier', 'Personnaliser']);
    });

    it.each(CASES)('$id $level: in Edit mode, « Mode Modifier », « Terminé » and « Personnaliser », tinted, 73 px on a phone and 54 above', ({ id, level, view }) => {
      const { after } = levelOf(id, level).enter;
      expect(placedFaults(after, isPhone(view) ? BAR_HEIGHT_PHONE_EDIT : BAR_HEIGHT)).toEqual([]);
      expect(after.bar?.buttons).toEqual(['Terminé', 'Personnaliser']);
      expect(after.bar?.label).toBe('Mode Modifier');
      expect(after.bar?.backgroundImage).toContain('linear-gradient');
    });

    it.each(CASES)('$id $level: clips, wraps, overlaps nothing — out of and in Edit mode, while it saves', ({ id, level }) => {
      const run = levelOf(id, level);
      expect({
        rest: textFaults(run.mid),
        edit: textFaults(run.enter.after),
        pending: textFaults(run.save.pending),
      }).toEqual({ rest: [], edit: [], pending: [] });
    });

    it.each(CASES)('$id $level: the bar does not grow at the first gesture — the state’s place is kept', ({ id, level }) => {
      const { save } = levelOf(id, level);
      // The bar is there in each state measured (fix round 1, G10): without it,
      // the two heights below were `undefined` and `undefined`, and passed.
      expect(save.idle.bar, 'idle').not.toBeNull();
      expect(save.pending.bar, 'pending').not.toBeNull();
      expect(save.saved.bar, 'saved').not.toBeNull();
      expect(save.pending.bar?.height).toBe(save.idle.bar?.height);
      expect(save.saved.bar?.height).toBe(save.idle.bar?.height);
    });
  });

  describe('one announcement (A-10.6)', () => {
    it.each(CASES)('$id $level: one region for the save, the header’s — empty before any gesture, the same node carrying « Enregistrement… » then « Enregistré », copied in the bar', ({ id, level }) => {
      const run = levelOf(id, level);
      expect({
        top: [...regionFaults(run.top), ...sameRegionFaults(run.top, '')],
        mid: regionFaults(run.mid),
        idle: sameRegionFaults(run.save.idle, ''),
        pending: [...regionFaults(run.save.pending), ...sameRegionFaults(run.save.pending, 'Enregistrement…')],
        saved: [...regionFaults(run.save.saved), ...sameRegionFaults(run.save.saved, 'Enregistré')],
      }).toEqual({ top: [], mid: [], idle: [], pending: [], saved: [] });
      expect([run.save.pending.bar?.copy, run.save.saved.bar?.copy]).toEqual(['Enregistrement…', 'Enregistré']);
    });
  });

  describe('the focus (A-10.5, A-10.6)', () => {
    it.each(CASES)('$id $level: follows its twin into the bar as the header’s buttons go, stays on the same node through Enter, and comes back to the header at the top', ({ id, level }) => {
      const run = levelOf(id, level);
      expect({
        mid: focusFaults(run.mid, 'bar-toggle'),
        enter: focusFaults(run.enter.after, 'bar-toggle'),
        top: focusFaults(run.editRelay.before, 'header-toggle'),
        leave: focusFaults(run.leave.after, 'bar-toggle'),
      }).toEqual({ mid: [], enter: [], top: [], leave: [] });
      expect([run.enter.after.active.text, run.leave.after.active.text]).toEqual(['Terminé', 'Modifier']);
    });

    it.each(CASES)('$id $level: brings a control focused under the two bars out from under them — scroll-padding-top (WCAG 2.4.11)', ({ id, level }) => {
      const { padding, mid } = levelOf(id, level);
      expect(mid.scrollPaddingTop).toBe(`${lineOf(mid) + 8}px`);
      expect(padding.top).toBeGreaterThanOrEqual(padding.line - 0.5);
    });
  });

  describe('the content stays still (technical decision 11)', () => {
    it.each(CASES)('$id $level: toggling Edit mode from the bar mid-page moves the first card visible under the bars by less than a pixel — in and out', ({ id, level }) => {
      const { enter, leave } = levelOf(id, level);
      expect({
        enter: `${enter.card} ${Math.round((enter.now - enter.before) * 10) / 10} px`,
        leave: `${leave.card} ${Math.round((leave.now - leave.before) * 10) / 10} px`,
      }).toEqual({ enter: `${enter.card} 0 px`, leave: `${leave.card} 0 px` });
      expect(Math.abs(enter.now - enter.before)).toBeLessThan(1);
      expect(Math.abs(leave.now - leave.before)).toBeLessThan(1);
    });
  });

  describe('where there is no bar', () => {
    it.each(VIEWS.map((view) => view.id))('%s: none at the Novice formula, at the top nor mid-page (A-9)', (id) => {
      const { novice } = viewOf(id);
      expect([novice?.top.bar, novice?.mid.bar]).toEqual([null, null]);
      expect(novice!.mid.scrollY).toBeGreaterThan(novice!.top.headerRow.docBottom);
    });

    it.each(VIEWS.map((view) => view.id))('%s: none while the layout loads, the page scrolled as far as it goes (A-10.2)', (id) => {
      const { loading } = viewOf(id);
      expect(hiddenFaults(loading!)).toEqual([]);
      expect(loading!.bar).not.toBeNull();
    });
  });

  describe('at night and in English, at 360 and 1 280 px', () => {
    it.each(['360x780', '1280x800'])('%s at night: in place and clean, out of and in Edit mode — the Edit-mode ground `invBg`', (id) => {
      const { night } = viewOf(id);
      const phone = id === '360x780';
      expect({
        rest: [...placedFaults(night!.rest, BAR_HEIGHT), ...textFaults(night!.rest)],
        edit: [...placedFaults(night!.edit, phone ? BAR_HEIGHT_PHONE_EDIT : BAR_HEIGHT), ...textFaults(night!.edit)],
      }).toEqual({ rest: [], edit: [] });
      expect(night!.edit.bar?.backgroundImage).toContain('rgba(76, 180, 124, 0.07)');
    });

    it('360x780 in English: « Edit » and « Customize », then « Edit mode », « Done » and « Customize », in place and clean', () => {
      const { english } = viewOf('360x780');
      expect({
        rest: [...placedFaults(english!.rest, BAR_HEIGHT), ...textFaults(english!.rest)],
        edit: [...placedFaults(english!.edit, BAR_HEIGHT_PHONE_EDIT), ...textFaults(english!.edit)],
      }).toEqual({ rest: [], edit: [] });
      expect([english!.rest.bar?.buttons, english!.edit.bar?.buttons, english!.edit.bar?.label]).toEqual([
        ['Edit', 'Customize'],
        ['Done', 'Customize'],
        'Edit mode',
      ]);
    });
  });

  describe('the probes — the same checks see a page broken on purpose (SMA-446)', () => {
    const probe = (name: string) => {
      const measured = viewOf('360x780').probes[name];
      if (!measured) throw new Error(`No measurement for the probe ${name}`);
      return measured;
    };

    it('a bar pinned at 40 px, over the navbar: reported', () => {
      expect(placedFaults(probe('bar-top-40'), BAR_HEIGHT)).toEqual([
        'the bar’s top at 40, the navbar’s bottom at 56',
        'the bar overlaps the navbar by 16 px',
      ]);
    });

    it('« Personnaliser » wider than its half: reported', () => {
      expect(textFaults(probe('wide-label'))).not.toEqual([]);
    });

    it('a save region born filled, in place of the one that was there: reported', () => {
      expect(sameRegionFaults(probe('filled-region'), 'Enregistrement…')).toEqual([
        'the region is not the node that was there before any gesture',
      ]);
    });

    it('a toggle unmounted at the key: reported — the focus falls to the body', () => {
      expect(focusFaults(probe('unmount-toggle'), 'bar-toggle')).toEqual(['the focus fell to the body']);
    });
  });
});
