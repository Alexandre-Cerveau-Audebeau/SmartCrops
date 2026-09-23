import { act, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../../../i18n/i18n';
import { UnitSystemProvider } from '../../../contexts/UnitSystemContext';
import { gardenFixture } from '../../../test/fixtures/dashboard';
import GardensBlock from './GardensBlock';

// SMA-437 lot 1, PR A, step A7a — the Medium row's chips carry their glyphs
// wherever they fit (`_spec.md` § 10.24), and drop them — both, on every row
// of the card, the A9 form — where they do not: at 600 px the card is 552 px
// wide and « Balcon sud », its « Balcon » chip and its « Ornemental » chip
// need 282 px of a 272.5 px group. jsdom lays nothing out: the group answers
// the width the test sets, the name and the chip line their natural widths —
// the chip line narrower once its glyphs are gone.

class ManualResizeObserver {
  static instances: ManualResizeObserver[] = [];
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ManualResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const fireAll = () =>
  act(() => {
    for (const instance of ManualResizeObserver.instances) instance.fire();
  });

/** The width every Medium row group answers. */
let groupWidth = 0;

/** The group answers `groupWidth`; the name 81 px, the chip line 191 px with glyphs and 152 without. */
function stubRow() {
  const originalRect = Element.prototype.getBoundingClientRect;
  const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')!;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const width = this.hasAttribute('data-garden-row-group') ? groupWidth : 0;
    return {
      x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0,
      width, height: 0, toJSON: () => ({}),
    } as DOMRect;
  };
  Object.defineProperty(Element.prototype, 'scrollWidth', {
    configurable: true,
    get(this: Element) {
      if (this.hasAttribute('data-garden-row-chips')) return this.querySelector('svg') ? 191 : 152;
      return this.parentElement?.hasAttribute('data-garden-row-group') ? 81 : 0;
    },
  });
  return () => {
    Element.prototype.getBoundingClientRect = originalRect;
    Object.defineProperty(Element.prototype, 'scrollWidth', originalScroll);
  };
}

const config = { orientation: null, lightSchedule: null, hemisphere: 'N' as const, latitudeBand: 'mid' as const };
const gardens = [
  gardenFixture({ id: 'g1', name: 'Terrasse', config: { ...config, gardenType: 'terrace' }, isEdible: true }),
  gardenFixture({ id: 'g2', name: 'Balcon sud', config: { ...config, gardenType: 'balcony' }, isEdible: false }),
];

/** The Medium card, loaded unless the test says otherwise — always the same gardens, so the same content. */
function mediumCard({ loading = false, loadError = false }: { loading?: boolean; loadError?: boolean } = {}) {
  return (
    <ThemeProvider theme={createTheme()}>
      <UnitSystemProvider>
        <MemoryRouter>
          <GardensBlock
            size="medium"
            gardens={gardens}
            loading={loading}
            loadError={loadError}
            onCreateClick={() => {}}
            onChanged={() => {}}
            onDeleted={() => {}}
            onExpand={() => {}}
          />
        </MemoryRouter>
      </UnitSystemProvider>
    </ThemeProvider>
  );
}

const renderMedium = () => render(mediumCard());

/** The chip a label sits in. */
const chip = (label: string) => screen.getByText(label).closest('.MuiChip-root')!;

describe('GardensBlock — the Medium chips’ glyphs, wherever they fit (SMA-437, A7a)', () => {
  let restore: () => void;

  beforeEach(async () => {
    // The widgets read i18next itself, never the language context.
    await i18next.changeLanguage('en');
    ManualResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', ManualResizeObserver);
    restore = stubRow();
  });

  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
  });

  it('keeps both glyphs where the row holds them — the 286.5 px group of a 1 280 px desktop', () => {
    groupWidth = 286.5;
    renderMedium();
    fireAll();
    expect(chip('Balcony').querySelector('svg')).not.toBeNull();
    expect(chip('Ornamental').querySelector('svg')).not.toBeNull();
    expect(chip('Terrace').querySelector('svg')).not.toBeNull();
  });

  it('draws every chip of the card bare where one row does not hold them — the 272.5 px group of a 600 px tablet — and keeps every chip', () => {
    groupWidth = 272.5;
    renderMedium();
    fireAll();
    for (const label of ['Balcony', 'Ornamental', 'Terrace']) {
      expect(chip(label).querySelector('svg'), label).toBeNull();
    }
    // The rows are all there, each with its name.
    expect(screen.getByRole('link', { name: 'Open Terrasse' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Balcon sud' })).toBeInTheDocument();
  });

  it('gives the glyphs back when the card grows wide enough', () => {
    groupWidth = 272.5;
    renderMedium();
    fireAll();
    expect(chip('Balcony').querySelector('svg')).toBeNull();

    groupWidth = 286.5;
    fireAll();
    expect(chip('Balcony').querySelector('svg')).not.toBeNull();
    expect(chip('Ornamental').querySelector('svg')).not.toBeNull();
  });

  // PR #287, fix round 1, S1 (CodeRabbit, both surfaces) — the Medium body is
  // not drawn while the card loads or shows its error, so the rows the hook
  // measures do not exist yet. When they arrive with the SAME content — the
  // same gardens, the same language — nothing the hook depends on changes:
  // the measure has to start because the node mounted, not because a prop did.
  it.each([
    ['a loading view', { loading: true }],
    ['an error view', { loadError: true }],
  ])('measures the rows when the Medium body mounts after %s, with the same content — bare in a 272.5 px group', (_view, state) => {
    groupWidth = 272.5;
    const { rerender } = render(mediumCard(state));
    expect(screen.queryByText('Balcony')).toBeNull();

    rerender(mediumCard());
    for (const label of ['Balcony', 'Ornamental', 'Terrace']) {
      expect(chip(label).querySelector('svg'), label).toBeNull();
    }
  });
});
