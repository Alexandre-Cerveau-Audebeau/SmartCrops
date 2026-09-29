import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { panelGardens } from '../../../test/layout/scenes';
import type { GardenOrder } from '../../../hooks/useGardenOrder';
import type { DashboardGardenData } from '../../../types/DashboardData';
import { customOrderIds } from './gardensOptions';
import GardensOptionsPanel from './GardensOptionsPanel';

// PR #300, fix round 1, A — THE FAMILY OF THE RANK LOOKUP, in the widget's gear
// (SMA-448, lot F5-a; A-N5): each row of the custom order asked `isNew` for its
// « Nouveau » chip, and `isNew` scanned a WHOLE list for every row —
// `gardens.some` (is any garden ranked on the server?) or `order.order.includes`
// (is this one in the local order?) — while the list holds every garden, the
// Expert's without a limit: O(n²) per render. The chips are unchanged by
// construction (the page suite holds them, and the counts below); what is
// proven here is the mechanism: the lookups in the two lists the panel is
// handed do not grow with its rows.

const LOOKUPS = ['indexOf', 'lastIndexOf', 'includes', 'find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every'] as const;

/**
 * Every array lookup `draw` makes IN one of `lists` — by identity, so the
 * list dnd-kit keeps of the row ids is not one of them —, named `list.method`.
 * Spied on `Array.prototype`; the calls are copied out, then the spies
 * restored, before anything is read.
 */
function lookupsIn(lists: Record<string, readonly unknown[]>, draw: () => void): string[] {
  const spies = LOOKUPS.map((name) => ({ name, spy: vi.spyOn(Array.prototype, name) }));
  let calls: { name: string; context: unknown }[] = [];
  try {
    draw();
  } finally {
    calls = spies.flatMap(({ name, spy }) => spy.mock.contexts.map((context) => ({ name, context })));
    for (const { spy } of spies) spy.mockRestore();
  }
  const named = Object.entries(lists);
  return calls.flatMap(({ name, context }) => {
    const list = named.find(([, candidate]) => candidate === context);
    return list ? [`${list[0]}.${name}`] : [];
  });
}

/** The panel on the custom sort, its order list drawn — mounted, its « Nouveau » chips counted, unmounted. */
function newChips(gardens: DashboardGardenData[], order: GardenOrder): number {
  localStorage.setItem('smartcrops-language', 'en');
  const { container, unmount } = render(
    <ThemeProvider theme={createTheme()}>
      <LanguageProvider>
        <GardensOptionsPanel
          options={{ sort: 'custom' }}
          sorts={['lastOpened', 'name', 'created', 'updated', 'custom']}
          gardens={gardens}
          ready
          onChange={() => {}}
          order={order}
        />
      </LanguageProvider>
    </ThemeProvider>
  );
  const chips = container.querySelectorAll('[data-gardens-order-new]').length;
  unmount();
  return chips;
}

describe('GardensOptionsPanel — the « Nouveau » chip reads the list once, never once per row (PR #300, fix round 1, A)', () => {
  // A third of the panel scenes' gardens are ranked on the server
  // (`panelGardens`): of 3, one ranked and two not; of 30, ten and twenty.

  it('on the server’s places: 2 chips of 3, 20 of 30 — and the same lookups in the list for 30 rows as for 3', () => {
    const scan = (count: number) => {
      const gardens = panelGardens(count);
      const order: GardenOrder = { ids: customOrderIds(gardens), order: null, state: 'idle', move: () => {} };
      let chips = 0;
      const lookups = lookupsIn({ gardens }, () => {
        chips = newChips(gardens, order);
      });
      return { chips, lookups };
    };
    const three = scan(3);
    const thirty = scan(30);

    expect([three.chips, thirty.chips]).toEqual([2, 20]);
    expect(thirty.lookups).toEqual(three.lookups);
  });

  it('on a local order: the gardens it leaves out are « Nouveau » — 2 of 3, 20 of 30 — and the order itself is never searched', () => {
    const scan = (count: number) => {
      const gardens = panelGardens(count);
      const local = gardens.filter((_, index) => index % 3 === 0).map((garden) => garden.id);
      const order: GardenOrder = { ids: customOrderIds(gardens, local), order: local, state: 'idle', move: () => {} };
      let chips = 0;
      const lookups = lookupsIn({ gardens, local }, () => {
        chips = newChips(gardens, order);
      });
      return { chips, lookups };
    };
    const three = scan(3);
    const thirty = scan(30);

    expect([three.chips, thirty.chips]).toEqual([2, 20]);
    expect(thirty.lookups).toEqual(three.lookups);
    expect(thirty.lookups.filter((lookup) => lookup.startsWith('local.'))).toEqual([]);
  });
});
