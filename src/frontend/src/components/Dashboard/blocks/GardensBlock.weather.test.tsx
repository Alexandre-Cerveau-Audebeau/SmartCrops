import { fireEvent, render, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../../contexts/UnitSystemContext';
import { gardenFixture } from '../../../test/fixtures/dashboard';
import { locationFixture } from '../../../test/fixtures/weather';
import GardensBlock, { type GardensWeather } from './GardensBlock';

// SMA-336 PR 3b/5 — the MÉTÉO column of the Gardens table, amendment A6
// lifted: the temperature pill over the place name when the garden is
// located, the dashed marker and the « Add » link when it is not, and the
// marker of PR 2/5 wherever the page passes no weather at all.

const gardens = [
  gardenFixture({ id: 'g1', name: 'Terrasse' }),
  gardenFixture({ id: 'g2', name: 'Balcon sud' }),
];

function renderTable(weather: GardensWeather | undefined, onLocate?: (id: string) => void) {
  localStorage.setItem('smartcrops-language', 'en');
  render(
    <ThemeProvider theme={createTheme()}>
      <LanguageProvider>
        <UnitSystemProvider>
          <MemoryRouter>
            <GardensBlock
              size="large"
              gardens={gardens}
              loading={false}
              loadError={false}
              showWeatherColumn
              weather={weather}
              onLocate={onLocate}
              onCreateClick={() => {}}
              onChanged={() => {}}
              onDeleted={() => {}}
              onExpand={() => {}}
            />
          </MemoryRouter>
        </UnitSystemProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
  return [...document.querySelectorAll('[data-weather-column]')] as HTMLElement[];
}

afterEach(() => {
  localStorage.removeItem('smartcrops.unitSystem');
});

describe('GardensBlock — the MÉTÉO column (PR 3b/5)', () => {
  it('keeps the « Soon » marker of PR 2/5 when the page passes no weather', () => {
    const [first, second] = renderTable(undefined);

    expect(within(first!).getByText('Soon')).toBeInTheDocument();
    expect(within(second!).getByText('Soon')).toBeInTheDocument();
  });

  it('draws a skeleton while the aggregate is in flight', () => {
    const cells = renderTable({ status: 'loading' });

    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell.querySelector('.MuiSkeleton-root')).not.toBeNull();
    }
  });

  it('says « No weather » in every cell when the aggregate failed — never a figure', () => {
    const cells = renderTable({ status: 'error' });

    for (const cell of cells) expect(within(cell).getByText('No weather')).toBeInTheDocument();
  });

  it('draws the temperature pill and the place for a located garden, « Add » for the other', () => {
    const onLocate = vi.fn();
    const [terrasse, balcon] = renderTable(
      { status: 'ready', byGarden: new Map([['g1', locationFixture()], ['g2', null]]) },
      onLocate
    );

    // `Main.dc.html`: `<span class="pill wx num">24°</span><div class="tsub">Lyon</div>`.
    expect(within(terrasse!).getByText('24°')).toBeInTheDocument();
    expect(within(terrasse!).getByText('Lyon')).toBeInTheDocument();
    expect(terrasse!.querySelector('[data-weather-glyph="clear"]')).not.toBeNull();

    // `A4Manquantes.dc.html`: the dashed marker and « Ajouter », no arrow.
    const add = within(balcon!).getByRole('button', { name: 'Add a city for Balcon sud' });
    expect(add).toHaveTextContent('Add');
    expect(add).not.toHaveTextContent('→');
    fireEvent.click(add);
    expect(onLocate).toHaveBeenCalledWith('g2');
  });

  it('treats a garden the aggregate does not know as not located', () => {
    const onLocate = vi.fn();
    const [, balcon] = renderTable({ status: 'ready', byGarden: new Map() }, onLocate);

    expect(
      within(balcon!).getByRole('button', { name: 'Add a city for Balcon sud' })
    ).toBeInTheDocument();
  });

  it('draws a marker without a gesture when nobody can open the dialog', () => {
    const [terrasse] = renderTable({ status: 'ready', byGarden: new Map([['g1', null]]) });

    expect(within(terrasse!).getByText('Not located')).toBeInTheDocument();
    expect(within(terrasse!).queryByRole('button')).toBeNull();
  });

  it('shows the place and a dash — never an invented figure — when the provider had nothing', () => {
    const [terrasse] = renderTable({
      status: 'ready',
      byGarden: new Map([
        ['g1', locationFixture({ status: 'unavailable', current: null, days: [] })],
      ]),
    });

    expect(within(terrasse!).getByText('Lyon')).toBeInTheDocument();
    expect(within(terrasse!).getByText('—')).toBeInTheDocument();
    expect(within(terrasse!).queryByText(/°/)).toBeNull();
  });

  it('converts the cell to °F under the imperial system — the product’s one toggle', () => {
    localStorage.setItem('smartcrops.unitSystem', 'imperial');
    const [terrasse] = renderTable({
      status: 'ready',
      byGarden: new Map([['g1', locationFixture()]]),
    });

    expect(within(terrasse!).getByText('75°')).toBeInTheDocument();
  });
});
