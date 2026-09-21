import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import { createAppTheme } from '../../theme';
import { LAYOUT_NOW_MS, freezeClock } from './clock';
import { LAYOUT_SCENES, sceneWidget } from './scenes';

// SMA-336 mobile lot, fix round 1 (#8) — the layout scenes read NO wall clock.
// The harness measures wrapping to the pixel, and a fixture month that
// followed the machine's date would move the calendar's tinted column and
// the month in every To-do sentence from one month to the next: the same
// tree, measured in October, could hide a different row than in September.
// The scenes are dated on one fixed instant instead (`clock.ts`), and the
// page freezes that instant before anything mounts (`freeze.ts`). This suite
// proves both by running under two different system clocks.

const MARCH = Date.UTC(2026, 2, 5, 9, 0, 0);
const NOVEMBER = Date.UTC(2026, 10, 20, 17, 0, 0);

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

/** The scenes module, loaded afresh while the system clock says `now`. */
async function scenesAt(now: number) {
  vi.setSystemTime(now);
  vi.resetModules();
  return import('./scenes');
}

/** The text a scene draws under the app's providers — the same tree the harness mounts, read in jsdom. */
function sceneText(name: string): string {
  const scene = LAYOUT_SCENES.find((candidate) => candidate.name === name);
  if (!scene) throw new Error(`No scene ${name}`);
  const { container, unmount } = render(
    <MemoryRouter>
      <ThemeProvider theme={createAppTheme('light')}>
        <UnitSystemProvider>{sceneWidget(scene)}</UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
  const text = container.textContent ?? '';
  unmount();
  return text;
}

describe('the layout scenes are dated on a fixed instant, not on the wall clock (#8)', () => {
  it('keys the calendar fixtures on the same month whichever month the suite runs in', async () => {
    const inMarch = await scenesAt(MARCH);
    const inNovember = await scenesAt(NOVEMBER);

    // The tomato's harvest is « this month » and the basil's sowing « six
    // months away »: both must read the same token under both clocks.
    const tomatoMarch = inMarch.varieties.find((v) => v.plantId === 'tomato')!;
    const tomatoNovember = inNovember.varieties.find((v) => v.plantId === 'tomato')!;
    const basilMarch = inMarch.varieties.find((v) => v.plantId === 'basil')!;
    const basilNovember = inNovember.varieties.find((v) => v.plantId === 'basil')!;
    expect(tomatoMarch.harvestPeriod).toBe(tomatoNovember.harvestPeriod);
    expect(basilMarch.sowingPeriod).toBe(basilNovember.sowingPeriod);
    // …and that month is the instant's: September.
    expect(tomatoMarch.harvestPeriod).toBe('september');
    expect(basilMarch.sowingPeriod).toBe('march');
  });

  it('draws the same Gardens, To-do and calendar cards under two system clocks once the harness clock is frozen — the page’s reading', () => {
    // « Modifié il y a … » on the Gardens card, the month of an unlocated
    // garden's tasks and the calendar's current column are read from the
    // clock: frozen, they are the same in March and in November.
    const texts = [MARCH, NOVEMBER].map((now) => {
      vi.setSystemTime(now);
      const thaw = freezeClock(LAYOUT_NOW_MS);
      try {
        return [sceneText('gardens-small'), sceneText('todo-medium-partial'), sceneText('month-large')];
      } finally {
        thaw();
      }
    });
    expect(texts[0]).toEqual(texts[1]);
  });

  it('the control: unfrozen, the Gardens and To-do cards follow the machine’s date — which is what the freeze is for', () => {
    const texts = [MARCH, NOVEMBER].map((now) => {
      vi.setSystemTime(now);
      return [sceneText('gardens-small'), sceneText('todo-medium-partial')];
    });
    expect(texts[0]![0]).not.toBe(texts[1]![0]);
    expect(texts[0]![1]).not.toBe(texts[1]![1]);
  });
});
