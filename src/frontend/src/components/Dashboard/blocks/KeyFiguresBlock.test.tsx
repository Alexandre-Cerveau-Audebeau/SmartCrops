import { fireEvent, render, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { createAppTheme } from '../../../theme';
import { gardenFixture } from '../../../test/fixtures/dashboard';
import { declaredAtBreakpoint, rulesFor } from '../../../test/dashboardDom';
import { EMPTY_WEATHER_DATA } from '../../../types/DashboardWeather';
import type { DashboardGardenData } from '../../../types/DashboardData';
import { gardenViewOf } from '../../../utils/gardenStats';
import KeyFiguresBlock from './KeyFiguresBlock';

// SMA-437 lot 1, PR B, step B4 — the Key figures band: one card, one title,
// four tiles in the order of its four emplacements, and its states — a
// skeleton, the error with « Réessayer », the form-(b) invitation without a
// garden (contract § 4.5, V3-04). The figures themselves are
// `keyFigures.test.ts`'s; this file pins what the band DRAWS.

/** A 10 × 8 plan, nothing planted: eighty free cells. */
const plot = gardenFixture({ id: 'g1', name: 'Terrasse', width: 10, height: 8 });

function renderBand(
  props: Partial<React.ComponentProps<typeof KeyFiguresBlock>> = {},
  language: 'en' | 'fr' = 'fr'
) {
  localStorage.setItem('smartcrops-language', language);
  const gardens: DashboardGardenData[] = props.gardens ?? [plot];
  return render(
    <ThemeProvider theme={createAppTheme('light')}>
      <LanguageProvider>
        <KeyFiguresBlock
          size="wide"
          editing={false}
          options={null}
          gardens={gardens}
          views={new Map(gardens.map((garden) => [garden.id, gardenViewOf(garden)]))}
          varieties={[]}
          totals={{ gardenCount: gardens.length, placementCount: 0, varietyCount: 0, catalogPlantCount: 536 }}
          weather={EMPTY_WEATHER_DATA}
          weatherStatus="ready"
          loading={false}
          loadError={false}
          onRetry={() => {}}
          onCreate={() => {}}
          {...props}
        />
      </LanguageProvider>
    </ThemeProvider>
  );
}

const card = () => document.querySelector('[data-widget="keyfigures"]') as HTMLElement;
const tiles = () => [...card().querySelectorAll<HTMLElement>('[data-key-figure]')];

describe('the band — one card, one title, four tiles', () => {
  it('is ONE widget card titled « Chiffres clés », its figures a list of four tiles', () => {
    renderBand();
    expect(document.querySelectorAll('[data-widget]')).toHaveLength(1);
    expect(within(card()).getByRole('heading', { level: 2, name: 'Chiffres clés' })).toBeInTheDocument();
    const list = within(card()).getByRole('list', { name: 'Vos quatre chiffres clés' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  });

  it('draws the four defaults in their order when nothing is stored: cases libres, occupation, variétés, à faire aujourd’hui', () => {
    renderBand();
    expect(tiles().map((tile) => tile.getAttribute('data-key-figure'))).toEqual(['free', 'occupancy', 'varieties', 'todo']);
  });

  it('draws the stored four in THEIR order — emplacement 1 to 4', () => {
    renderBand({ options: { figures: ['cities', 'noplan', 'surface', 'free'] } });
    expect(tiles().map((tile) => tile.getAttribute('data-key-figure'))).toEqual(['cities', 'noplan', 'surface', 'free']);
  });

  it('falls back to the defaults on a stored document it cannot read', () => {
    renderBand({ options: { figures: ['free', 'free', 'free', 'free'] } });
    expect(tiles().map((tile) => tile.getAttribute('data-key-figure'))).toEqual(['free', 'occupancy', 'varieties', 'todo']);
  });

  it('says each tile in one sentence, and hides the drawing from assistive technology', () => {
    renderBand();
    const [free] = tiles();
    // The RAW text, no-break space before the colon included (§ 5.3): the
    // queries of Testing Library compare whitespace-normalized text.
    expect(free!.querySelector(':scope > span')!.textContent).toBe('Cases libres\u00a0: 80 — où planter la suite');
    for (const part of free!.querySelectorAll('[data-key-figure-label], [data-key-figure-value], [data-key-figure-sub]')) {
      expect(part.closest('[aria-hidden="true"]'), part.textContent ?? '').not.toBeNull();
    }
  });

  it('draws a true zero as a word and nothing-to-measure as a dash — never « 0 » (R5)', () => {
    renderBand();
    const byFigure = (figure: string) => card().querySelector(`[data-key-figure="${figure}"] [data-key-figure-value]`)!;
    expect(byFigure('occupancy')).toHaveTextContent('—');
    expect(byFigure('varieties')).toHaveTextContent('Aucune');
    expect(byFigure('todo')).toHaveTextContent('Rien');
    expect(byFigure('free')).toHaveTextContent('80');
    expect(byFigure('todo')).toHaveAttribute('data-soft', 'true');
    expect(byFigure('free')).not.toHaveAttribute('data-soft');
  });

  it('draws hectares beyond 10 000 m², the unit apart', () => {
    // Three 100 × 100 plans of 1 m cells: 30 000 m².
    const big = [0, 1, 2].map((index) =>
      gardenFixture({ id: `g${index}`, name: `Verger ${index}`, width: 100, height: 100, cellSize: '1m' })
    );
    renderBand({ gardens: big, options: { figures: ['surface', 'free', 'occupancy', 'todo'] } });
    const surface = card().querySelector('[data-key-figure="surface"]')!;
    expect(surface.querySelector('[data-key-figure-value]')).toHaveTextContent(/^3$/);
    expect(surface.querySelector('[data-key-figure-unit]')).toHaveTextContent('ha');
  });
});

describe('the band’s states (V16, R5)', () => {
  it('without a garden: the form-(b) invitation — never four zeros — and its gesture creates one', () => {
    const onCreate = vi.fn();
    renderBand({ gardens: [], onCreate });
    expect(tiles()).toHaveLength(0);
    expect(within(card()).getByRole('heading', { level: 3, name: 'Vos chiffres clés arrivent avec votre premier jardin' })).toBeInTheDocument();
    const body = within(card()).getByText(/^Cases libres, occupation, variétés, tâches du jour/);
    expect(body.textContent).toBe(
      'Cases libres, occupation, variétés, tâches du jour\u00a0: tout se calcule à partir de vos jardins et de leurs plans.'
    );
    fireEvent.click(within(card()).getByRole('button', { name: 'Créer un jardin' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('while the gardens load: a skeleton of four tiles, and no figure', () => {
    renderBand({ loading: true });
    expect(tiles()).toHaveLength(0);
    expect(card().querySelectorAll('.MuiSkeleton-root')).toHaveLength(4);
  });

  it('behind a load error: the message and « Réessayer »', () => {
    const onRetry = vi.fn();
    renderBand({ loadError: true, onRetry });
    expect(card()).toHaveTextContent('Impossible de charger vos chiffres clés.');
    fireEvent.click(within(card()).getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says the same in English', () => {
    renderBand({}, 'en');
    expect(within(card()).getByRole('heading', { level: 2, name: 'Key figures' })).toBeInTheDocument();
    expect(within(card()).getByText('Free cells: 80 — where to plant next')).toBeInTheDocument();
  });
});

describe('the measures — V3-04 on the type scale, with the two exceptions of arbitrage 1', () => {
  it('four tiles in a row from 900 px (md), two by two below — arbitrage 2', () => {
    renderBand();
    const list = within(card()).getByRole('list');
    expect(declaredAtBreakpoint(list, '0px', 'grid-template-columns')).toBe('repeat(2, minmax(0, 1fr))');
    expect(declaredAtBreakpoint(list, '900px', 'grid-template-columns')).toBe('repeat(4, minmax(0, 1fr))');
    expect(declaredAtBreakpoint(list, '0px', 'column-gap')).toBe('10px');
    expect(declaredAtBreakpoint(list, '600px', 'column-gap')).toBe('12px');
  });

  it('a tile is a flat patch — no border, no shadow — and a subgrid of three rows, so the values of a row align', () => {
    renderBand();
    const rules = rulesFor(tiles()[0]!).replace(/\s+/g, '');
    expect(rules).toContain('grid-template-rows:subgrid');
    expect(rules).toContain('grid-row:span3');
    expect(rules).toContain('border-radius:10px');
    expect(rules).not.toMatch(/border:|box-shadow/);
  });

  it('labels in 11 px capitals (exception 1), values in 28 px — 22 px under 600 px (exception 2) — units and sub-lines at the 14 px floor', () => {
    renderBand();
    const tile = tiles()[0]!;
    const label = rulesFor(tile.querySelector('[data-key-figure-label]')!).replace(/\s+/g, '');
    expect(label).toContain('font-size:11px');
    expect(label).toContain('text-transform:uppercase');
    expect(label).toContain('font-weight:800');
    const value = tile.querySelector('[data-key-figure-value]')!;
    expect(declaredAtBreakpoint(value, '0px', 'font-size')).toBe('22px');
    expect(declaredAtBreakpoint(value, '600px', 'font-size')).toBe('28px');
    expect(rulesFor(value).replace(/\s+/g, '')).toContain('font-variant-numeric:tabular-nums');
    expect(rulesFor(tile.querySelector('[data-key-figure-sub]')!).replace(/\s+/g, '')).toContain('font-size:14px');
  });
});
