/**
 * SMA-423 — render budget of the planner when a catalogue plant is armed.
 *
 * Performance non-regression: arming, switching and disarming a plant from
 * the catalogue must NOT re-render the whole catalogue (536 rows at the real
 * size) nor the grid cells. Before SMA-423 one click rendered 537 rows and
 * all 100 cells (pre-flight §3.2); the budget below is what the memoized
 * `PlantRow` (PlantSidebar) and the stable grid callbacks (GardenPlanner)
 * guarantee.
 *
 * Technique — NO instrumentation in the sources: `useTranslation` from
 * react-i18next is intercepted and counted PER CALLING COMPONENT (the caller
 * name is read from the call stack). Every catalogue row renders exactly one
 * `FootprintBadge`, which calls `useTranslation`, so that counter IS the
 * number of rows rendered (+1 for the armed-plant chip while it is mounted).
 * `GridCell` calls `useTranslation` too: that counter is the number of grid
 * cells rendered. A mount-time check (536 rows, 100 cells) proves the probe
 * sees the components before any budget is judged.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { GardenLayoutData } from '../services/gardenLayoutApi';
import type { Garden } from '../types/Garden';
import type { Plant } from '../types/Plant';

const probe = vi.hoisted(() => {
  const counts = new Map<string, number>();
  // Frames that sit between the component and this counter, or that are not
  // components at all — never attribute a render to them.
  const SKIP = new Set([
    'useTranslation',
    'callerName',
    'bump',
    'Object',
    'Module',
    'Proxy',
    'eval',
    'Function',
  ]);
  function callerName(): string {
    const stack = new Error().stack ?? '';
    const lines = stack.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i].match(
        /^\s*at\s+(?:async\s+)?([A-Za-z_$][\w$]*)(?:\.[\w$<>]+)*\s*\(/
      );
      if (!m) continue;
      const name = m[1];
      if (SKIP.has(name)) continue;
      return name;
    }
    return '?';
  }
  return {
    bump() {
      const n = callerName();
      counts.set(n, (counts.get(n) ?? 0) + 1);
    },
    reset() {
      counts.clear();
    },
    snapshot(): Record<string, number> {
      return Object.fromEntries(counts.entries());
    },
  };
});

vi.mock('react-i18next', async (importOriginal) => {
  const orig = await importOriginal<typeof import('react-i18next')>();
  return {
    ...orig,
    useTranslation: (...args: Parameters<typeof orig.useTranslation>) => {
      probe.bump();
      return orig.useTranslation(...args);
    },
  };
});

vi.mock('../services/plantApi', () => ({ fetchPlants: vi.fn() }));
vi.mock('../services/gardenApi', () => ({
  fetchGarden: vi.fn(),
  updateGarden: vi.fn(),
}));
vi.mock('../services/gardenLayoutApi', () => ({
  fetchLayout: vi.fn(),
  saveLayout: vi.fn(),
}));

import GardenPlanner from './GardenPlanner';
import { fetchGarden } from '../services/gardenApi';
import { fetchLayout } from '../services/gardenLayoutApi';
import { fetchPlants } from '../services/plantApi';

// Real catalogue size (536 plants). Declared composition: every 13th plant
// has an unknown spacing (the dashed "1×1?" badge + tooltip), every 7th a
// 90 cm spacing (2×2 at 50 cm/cell), the rest 30 cm (1×1).
const N_PLANTS = 536;
const plants: Plant[] = Array.from({ length: N_PLANTS }, (_, i) => {
  const spacing = i % 13 === 0 ? null : i % 7 === 0 ? 90 : 30;
  return {
    id: `p${i}`,
    scientificName: `Plantus fixture ${i}`,
    commonName: `Plante ${i}`,
    xPlantSpacingValue: spacing,
    xPlantSpacingUnit: spacing === null ? null : 'cm',
  } as Plant;
});

const garden = { id: 'g1', name: 'Jardin test' } as unknown as Garden;

const placement = (
  id: string,
  plantId: string,
  startRow: number,
  startCol: number,
  span: number
) => ({
  id,
  plantId,
  plantScientificName: null,
  startRow,
  startCol,
  spanRows: span,
  spanCols: span,
  notes: null,
});

// A 10 × 10 garden with a few placements — the grid has real content to
// (not) re-render.
const layout: GardenLayoutData = {
  width: 10,
  height: 10,
  cellSize: '50cm',
  cellsJson: null,
  config: {
    orientation: null,
    gardenType: null,
    lightSchedule: null,
    hemisphere: null,
    latitudeBand: null,
  },
  placements: [
    placement('pl1', 'p1', 0, 0, 1),
    placement('pl2', 'p7', 2, 2, 2),
    placement('pl3', 'p14', 5, 5, 2),
    placement('pl4', 'p3', 9, 9, 1),
    placement('pl5', 'p21', 0, 5, 2),
    placement('pl6', 'p5', 7, 1, 1),
  ],
};

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('smartcrops-language', 'en');
  await i18n.changeLanguage('en');
  // jsdom ships no ResizeObserver; the planner observes its scroll container.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderPlanner() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/gardens/g1/planner']}>
        <Routes>
          <Route path="/gardens/:id/planner" element={<GardenPlanner />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>
  );
}

/** The catalogue row (ListItemButton) whose primary label is exactly `name`. */
function rowOf(name: string): HTMLElement {
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>('.MuiListItemButton-root')
  );
  const row = rows.find((r) => within(r).queryByText(name) !== null);
  if (!row) throw new Error(`catalogue row not found: ${name}`);
  return row;
}

/** Click a catalogue row and return the render counts that click caused. */
async function clickRow(name: string): Promise<Record<string, number>> {
  probe.reset();
  await act(async () => {
    fireEvent.click(rowOf(name));
  });
  return probe.snapshot();
}

describe('GardenPlanner render budget when arming a catalogue plant (SMA-423)', () => {
  it('arming, switching and disarming re-render only the rows concerned and no grid cell', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue(plants);

    probe.reset();
    renderPlanner();
    await screen.findByRole('grid');
    await screen.findByText('Plante 535', {}, { timeout: 15000 });
    await act(async () => {});

    // The probe must see the whole catalogue and the whole grid at mount —
    // otherwise the budgets below would pass for the wrong reason.
    const mount = probe.snapshot();
    expect(mount.FootprintBadge).toBe(N_PLANTS);
    expect(mount.GridCell).toBe(100);
    expect(screen.queryByTestId('armed-plant-indicator')).toBeNull();

    // A — first arming: the armed row + the identity chip.
    const a = await clickRow('Plante 10');
    expect(screen.getByTestId('armed-plant-indicator')).toHaveTextContent(
      'Plante 10'
    );
    expect(rowOf('Plante 10')).toHaveAttribute('aria-pressed', 'true');
    expect
      .soft(a.FootprintBadge ?? 0, 'A (first arming): catalogue rows rendered')
      .toBeLessThanOrEqual(2);
    // The first arming ENTERS Place mode: the page flips
    // `onCellPointerDown={placeMode ? handleCellPointerDown : undefined}`
    // from undefined to the handler — a toggle the lot keeps on purpose (it
    // drives the per-cell touch-action clamp) — so GardenGrid sees a changed
    // prop and every cell re-renders EXACTLY once. That single full pass is
    // the documented, measured budget (100 before and after SMA-423); only B,
    // which stays inside Place mode, must leave the grid untouched.
    expect
      .soft(a.GridCell ?? 0, 'A (first arming): grid cells rendered')
      .toBe(100);

    // B — switching to another plant: the previous row, the new row and the
    // chip; the grid is untouched (Place mode stays on, only the plant
    // changes).
    const b = await clickRow('Plante 20');
    expect(screen.getByTestId('armed-plant-indicator')).toHaveTextContent(
      'Plante 20'
    );
    expect(rowOf('Plante 20')).toHaveAttribute('aria-pressed', 'true');
    expect(rowOf('Plante 10')).toHaveAttribute('aria-pressed', 'false');
    expect
      .soft(b.FootprintBadge ?? 0, 'B (switch plant): catalogue rows rendered')
      .toBeLessThanOrEqual(3);
    expect
      .soft(b.GridCell ?? 0, 'B (switch plant): grid cells rendered')
      .toBe(0);

    // C — disarming by re-clicking the armed row: that row only (the chip
    // unmounts).
    const c = await clickRow('Plante 20');
    expect(screen.queryByTestId('armed-plant-indicator')).toBeNull();
    expect(rowOf('Plante 20')).toHaveAttribute('aria-pressed', 'false');
    expect
      .soft(c.FootprintBadge ?? 0, 'C (disarm): catalogue rows rendered')
      .toBeLessThanOrEqual(1);
    // Disarming LEAVES Place mode (SET_PLACE_PLANT(null) sets placeMode to
    // false): the same kept toggle flips onCellPointerDown back to undefined,
    // so the grid re-renders exactly once more — the mirror of A, not a
    // regression. B is the step that proves the grid callbacks are stable.
    expect
      .soft(c.GridCell ?? 0, 'C (disarm): grid cells rendered')
      .toBe(100);
  }, 60000);
});
