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

  it('a LOCATED cell is a button that opens the dialog pre-targeted on its garden (V21 c)', () => {
    // Round 1, V21: PR 3b/5 opened the dialog from an UNLOCATED cell only; a
    // garden already located had no door to an override or to « Revenir à la
    // ville du profil ». The whole cell — pill and place — is the door now,
    // named with the garden since several rows carry it.
    const onLocate = vi.fn();
    const [terrasse, balcon] = renderTable(
      { status: 'ready', byGarden: new Map([['g1', locationFixture()], ['g2', locationFixture({ current: null })]]) },
      onLocate
    );

    const door = within(terrasse!).getByRole('button', { name: 'Change the location of Terrasse' });
    expect(door).toHaveTextContent('24°');
    expect(door).toHaveTextContent('Lyon');
    door.focus();
    expect(document.activeElement).toBe(door);
    fireEvent.click(door);
    expect(onLocate).toHaveBeenCalledWith('g1');

    // A located garden the provider is silent about has the same door.
    fireEvent.click(within(balcon!).getByRole('button', { name: 'Change the location of Balcon sud' }));
    expect(onLocate).toHaveBeenLastCalledWith('g2');
    // No `<p>` inside the `<button>`: phrasing content only.
    expect(door.querySelector('p')).toBeNull();
  });

  it('draws the located cell as plain text when nobody can open the dialog', () => {
    const [terrasse] = renderTable({ status: 'ready', byGarden: new Map([['g1', locationFixture()]]) });

    expect(within(terrasse!).getByText('24°')).toBeInTheDocument();
    expect(within(terrasse!).queryByRole('button')).toBeNull();
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
    const dash = within(terrasse!).getByText('—');
    expect(dash).toBeInTheDocument();
    expect(within(terrasse!).queryByText(/°/)).toBeNull();
    // The dash is for the eye; the ear gets the column's own words (round 1, G1).
    expect(dash).toHaveAttribute('aria-hidden', 'true');
    expect(within(terrasse!).getByText('No weather')).toBeInTheDocument();
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
