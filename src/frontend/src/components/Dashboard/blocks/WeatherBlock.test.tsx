import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../../contexts/UnitSystemContext';
import { fetchProfile, type UserProfile } from '../../../services/profileApi';
import { saveProfileLocation, searchLocations } from '../../../services/weatherApi';
import { gardenFixture } from '../../../test/fixtures/dashboard';
import {
  alertFixture,
  dayFixture,
  linkFixture,
  locationFixture,
  pickFixture,
  weatherFixture,
} from '../../../test/fixtures/weather';
import { declaredAtBreakpoint, rulesFor } from '../../../test/dashboardDom';
import { deferred } from '../../../test/responses';
import type { DashboardSize } from '../../../types/Dashboard';
import { EMPTY_WEATHER_DATA, type DashboardWeatherData } from '../../../types/DashboardWeather';
import { LOCATION_SEARCH_DEBOUNCE_MS } from '../locationTools';
import WeatherBlock from './WeatherBlock';

vi.mock('../../../services/weatherApi', () => ({
  fetchDashboardWeather: vi.fn(),
  searchLocations: vi.fn(),
  saveGardenLocation: vi.fn(),
  clearGardenLocation: vi.fn(),
  saveProfileLocation: vi.fn(),
  clearProfileLocation: vi.fn(),
}));

vi.mock('../../../services/profileApi', () => ({ fetchProfile: vi.fn() }));

// SMA-336 PR 3b/5 — the weather widget against `A5MeteoTailles.dc.html` and
// `A4Manquantes.dc.html`: three sizes, the mandatory states, the place tabs at
// the keyboard, the week's scale, the unit system, and the invitations. The
// fixture is the artboards' Lyon on Saturday 12 September 2026 at 14:30.

const gardens = [
  gardenFixture({ id: 'g1', name: 'Terrasse' }),
  gardenFixture({ id: 'g2', name: 'Balcon sud' }),
  gardenFixture({ id: 'g3', name: 'Potager du fond' }),
];

/** Every garden reading Lyon through the profile default. */
const allLyon = (): DashboardWeatherData =>
  weatherFixture(
    [locationFixture()],
    gardens.map((garden) => linkFixture({ gardenId: garden.id }))
  );

/** Terrasse on its own Lyon, the two others unlocated, no profile default — the A4 state. */
const partial = (): DashboardWeatherData =>
  weatherFixture(
    [locationFixture()],
    [
      linkFixture({ gardenId: 'g1', source: 'garden' }),
      linkFixture({ gardenId: 'g2', locationKey: null, source: null }),
      linkFixture({ gardenId: 'g3', locationKey: null, source: null }),
    ]
  );

/** Two places: Lyon read by two gardens, Annecy by one. */
const twoPlaces = (): DashboardWeatherData =>
  weatherFixture(
    [
      locationFixture(),
      locationFixture({ key: '45.90,6.13', name: 'Annecy', current: { ...locationFixture().current!, tempC: 21 } }),
    ],
    [
      linkFixture({ gardenId: 'g1' }),
      linkFixture({ gardenId: 'g2' }),
      linkFixture({ gardenId: 'g3', locationKey: '45.90,6.13', source: 'garden' }),
    ]
  );

/** No garden located, no profile default. */
const unlocated = (): DashboardWeatherData =>
  weatherFixture(
    [],
    gardens.map((garden) => linkFixture({ gardenId: garden.id, locationKey: null, source: null }))
  );

type Props = React.ComponentProps<typeof WeatherBlock>;

function renderBlock(over: Partial<Props> = {}, language: 'en' | 'fr' = 'en') {
  localStorage.setItem('smartcrops-language', language);
  const props: Props = {
    size: 'large' as DashboardSize,
    weather: allLyon(),
    // Every city, the Expert's — the widget these artboards drew (lot F4
    // added the Gardener's single city; its own describe below).
    cities: 'all',
    gardens,
    loading: false,
    loadError: false,
    onRetry: vi.fn(),
    onLocate: vi.fn(),
    onLocated: vi.fn(),
    ...over,
  };
  const tree = (current: Props) => (
    <ThemeProvider theme={createTheme()}>
      <LanguageProvider>
        <UnitSystemProvider>
          <WeatherBlock {...current} />
        </UnitSystemProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
  const view = render(tree(props));
  const card = document.querySelector('[data-widget="weather"]') as HTMLElement;
  /** The same widget with some props changed — a formula switch under a mounted card. */
  const rerender = (next: Partial<Props>) => view.rerender(tree({ ...props, ...next }));
  return { card, widget: within(card), props, rerender };
}

beforeEach(() => {
  vi.mocked(fetchProfile).mockReset();
  vi.mocked(fetchProfile).mockResolvedValue({
    email: 'a@example.test',
    displayName: null,
    firstName: null,
    lastName: null,
    city: null,
    hasPassword: true,
  });
  vi.mocked(searchLocations).mockReset();
  vi.mocked(saveProfileLocation).mockReset();
  vi.mocked(saveProfileLocation).mockResolvedValue(undefined);
});

afterEach(() => {
  // Unmount FIRST (SMA-452 § 13): this hook runs before Testing Library's
  // automatic cleanup (vitest's `sequence.hooks = 'stack'`); the tree is
  // unmounted on the clock it ran on and with its unit system, and only then
  // are they put back.
  cleanup();
  localStorage.removeItem('smartcrops.unitSystem');
  vi.useRealTimers();
});

describe('WeatherBlock — the place is the title (arbitrage Q1)', () => {
  it('has no h2 and names itself as a region by its place', () => {
    const { card, widget } = renderBlock({ size: 'small' });

    expect(widget.queryByRole('heading')).toBeNull();
    expect(card).toHaveAttribute('role', 'region');
    expect(card).toHaveAttribute('aria-label', 'Lyon');
    expect(widget.getByText('Lyon')).toBeInTheDocument();
    expect(widget.queryByText('Weather')).toBeNull();
  });

  it('falls back to the widget title while nothing is loaded', () => {
    const { card } = renderBlock({ loading: true, weather: EMPTY_WEATHER_DATA });

    expect(card).toHaveAttribute('aria-label', 'Weather');
  });
});

describe('WeatherBlock — Small (A5 l. 285-291)', () => {
  it('shows the place, the 44 px temperature, the condition, max / min, « Today » and the day’s bar', () => {
    const { card, widget } = renderBlock({ size: 'small' });

    const temperature = card.querySelector('[data-weather-temperature]') as HTMLElement;
    expect(temperature).toHaveTextContent('24°');
    expect(rulesFor(temperature)).toContain('font-size:44px');
    expect(widget.getByText('Ensoleillé')).toBeInTheDocument();
    expect(widget.getByText('29° / 16°')).toBeInTheDocument();
    expect(widget.getByText('Today')).toBeInTheDocument();
    expect(card.querySelector('[data-weather-bar]')).not.toBeNull();
    // Nothing of the larger sizes.
    expect(card.querySelector('[data-weather-hours]')).toBeNull();
    expect(card.querySelector('[data-weather-band]')).toBeNull();
    expect(card.querySelector('[data-weather-days]')).toBeNull();
  });

  it('draws the day’s bar on the WEEK’s scale — 16–29 on 9–29 masks 35 % before and nothing after', () => {
    const { card } = renderBlock({ size: 'small' });

    const [before, after] = [...card.querySelector('[data-weather-bar]')!.children] as HTMLElement[];
    expect(rulesFor(before!)).toContain('width:35%');
    expect(rulesFor(after!)).toContain('width:0%');
  });
});

describe('WeatherBlock — Medium (A5 l. 292-295)', () => {
  it('adds the six slots from the place’s own hour and the gardener’s band, temperature at 56 px', () => {
    const { card, widget } = renderBlock({ size: 'medium' });

    const temperature = card.querySelector('[data-weather-temperature]') as HTMLElement;
    expect(rulesFor(temperature)).toContain('font-size:56px');

    const slots = [...card.querySelectorAll('[data-weather-hours] li')];
    expect(slots).toHaveLength(6);
    // localTime 14:30 → 2 PM … 7 PM, not the browser's clock.
    expect(slots[0]).toHaveTextContent('2 PM');
    expect(slots[5]).toHaveTextContent('7 PM');

    expect(card.querySelector('[data-weather-band]')).toHaveTextContent(
      'No rain expected — water in the evening.'
    );
    expect(widget.queryByRole('tablist')).toBeNull();
    expect(card.querySelector('[data-weather-days]')).toBeNull();
  });

  it('straddles midnight when the place is at 21 h', () => {
    const { card } = renderBlock({
      size: 'medium',
      weather: weatherFixture([locationFixture({ localTime: '2026-09-12 21:10' })], [linkFixture()]),
    });

    const slots = [...card.querySelectorAll('[data-weather-hours] li')].map((li) => li.textContent);
    expect(slots[0]).toContain('9 PM');
    expect(slots[3]).toContain('12 AM');
    expect(slots[5]).toContain('2 AM');
  });
});

describe('WeatherBlock — Large (A5 l. 296-319)', () => {
  it('fixes the head at 136 px and adds the five days, the alert line and the units', () => {
    const { card, widget } = renderBlock({ size: 'large' });

    expect(rulesFor(card.querySelector('[data-weather-head]')!)).toContain('height:136px');

    const rows = [...card.querySelectorAll('[data-weather-days] li')];
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('Today');
    expect(rows[1]).toHaveTextContent('Sun');
    expect(rows[3]).toHaveTextContent('Tue');
    expect(rows[3]).toHaveTextContent('80%');
    expect(rows[3]).toHaveTextContent('9°');
    expect(rows[3]).toHaveTextContent('17°');

    expect(widget.getByText('Strong wind Tuesday · 55 km/h')).toBeInTheDocument();
    expect(card.querySelector('[data-weather-units]')).toHaveTextContent('°C · km/h');
    // One place: no tabs, the head keeps its 136 px.
    expect(widget.queryByRole('tablist')).toBeNull();
  });

  it('credits the provider at the foot of the Large card (arbitrage Q12)', () => {
    const { card } = renderBlock({ size: 'large' });

    expect(card.querySelector('[data-weather-attribution]')).toHaveTextContent(
      'Weather data: WeatherAPI.com'
    );
  });

  it.each(['small', 'medium'] as const)('carries no credit line on the %s card', (size) => {
    const { card } = renderBlock({ size });

    expect(card.querySelector('[data-weather-attribution]')).toBeNull();
  });

  it('keeps the credit under the partial invitation too', () => {
    const { card } = renderBlock({ size: 'large', weather: partial() });

    expect(card.querySelector('[data-weather-attribution]')).toHaveTextContent('WeatherAPI.com');
  });

  it('prints the probability in the rain colour above 50 %, and a named dash when unknown', () => {
    const { card, widget } = renderBlock({
      size: 'large',
      weather: weatherFixture(
        [
          locationFixture({
            days: [
              dayFixture({ date: '2026-09-12', chanceOfRain: 80 }),
              dayFixture({ date: '2026-09-13', chanceOfRain: 50 }),
              dayFixture({ date: '2026-09-14', chanceOfRain: null }),
            ],
          }),
        ],
        [linkFixture()]
      ),
    });

    const rows = [...card.querySelectorAll('[data-weather-days] li')];
    // The COLOURED node is the Typography around the figure: its class carries the rule.
    const rainy = within(rows[0] as HTMLElement).getByText('80%').parentElement!;
    const dry = within(rows[1] as HTMLElement).getByText('50%').parentElement!;
    expect(rulesFor(rainy)).toContain('color:#4677AB');
    expect(rulesFor(dry)).not.toContain('color:#4677AB');
    // The unknown chance: a dash for the eye, the sentence for the ear (E5 / E6
    // — no `aria-label` on a generic span).
    const unknown = within(rows[2] as HTMLElement);
    expect(unknown.getByText('—')).toHaveAttribute('aria-hidden', 'true');
    expect(unknown.getByText('Chance of rain unknown')).toBeInTheDocument();
    expect(widget.queryByLabelText('Chance of rain unknown')).toBeNull();
    expect(rows[2]).not.toHaveTextContent('0%');
  });

  it('names every figure of a row for assistive technology: the chance, the minimum, the maximum (G5)', () => {
    // GitHub 4008082523: a row read « Tue, Sunny, 80%, 9°, 17° » with nothing
    // saying which degree was which. The visible figures are hidden from AT,
    // the sentences sit off-screen — the accessible text comes from content.
    const { card } = renderBlock({ size: 'large' });

    const tuesday = within(card.querySelectorAll('[data-weather-days] li')[3] as HTMLElement);
    expect(tuesday.getByText('80%')).toHaveAttribute('aria-hidden', 'true');
    expect(tuesday.getByText('80% chance of rain')).toBeInTheDocument();
    expect(tuesday.getByText('9°')).toHaveAttribute('aria-hidden', 'true');
    expect(tuesday.getByText('minimum 9 degrees')).toBeInTheDocument();
    expect(tuesday.getByText('17°')).toHaveAttribute('aria-hidden', 'true');
    expect(tuesday.getByText('maximum 17 degrees')).toBeInTheDocument();
  });

  it('shows an official alert as a chip with its headline in the tooltip, dropping the derived twin', () => {
    const { widget } = renderBlock({
      size: 'large',
      weather: weatherFixture(
        [locationFixture({ alerts: [alertFixture({ event: 'Vent violent', headline: 'Vigilance orange vent violent' })] })],
        [linkFixture()]
      ),
    });

    // A NAMED GROUP that takes the focus, so the tooltip with the full headline
    // opens from the keyboard too (G3 / E3 / E4).
    const chip = widget.getByRole('group', { name: 'Official alert: Vigilance orange vent violent' });
    expect(chip).toHaveTextContent('Vent violent');
    expect(chip).toHaveAttribute('tabindex', '0');
    chip.focus();
    expect(document.activeElement).toBe(chip);
    expect(widget.queryByText(/Strong wind/)).toBeNull();
  });

  it('follows the imperial system: °F and mph, from the one global toggle', () => {
    localStorage.setItem('smartcrops.unitSystem', 'imperial');
    const { card, widget } = renderBlock({ size: 'large' });

    expect(card.querySelector('[data-weather-temperature]')).toHaveTextContent('75°');
    expect(widget.getByText('84° / 61°')).toBeInTheDocument();
    expect(widget.getByText('Strong wind Tuesday · 34 mph')).toBeInTheDocument();
    expect(card.querySelector('[data-weather-units]')).toHaveTextContent('°F · mph');
    // The spoken figures of the rows follow the same toggle (G5): Tuesday's 9 °C minimum.
    const tuesday = card.querySelectorAll('[data-weather-days] li')[3] as HTMLElement;
    expect(within(tuesday).getByText('minimum 48 degrees')).toBeInTheDocument();
  });
});

describe('WeatherBlock — the place tabs (F.3)', () => {
  it('draws a tab per place, « Lyon · 2 gardens » first and selected, and switches on click', () => {
    const { widget, card } = renderBlock({ size: 'large', weather: twoPlaces() });

    const tablist = widget.getByRole('tablist', { name: 'Places' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Lyon · 2 gardens', 'Annecy']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    expect(card).toHaveAttribute('aria-label', 'Lyon');
    // ONE panel in the DOM, so only the selected tab points at it (G4): an
    // unselected tab's `aria-controls` would be an IDREF to nothing.
    expect(tabs[0]).toHaveAttribute('aria-controls', widget.getByRole('tabpanel').id);
    expect(tabs[1]).not.toHaveAttribute('aria-controls');

    fireEvent.click(tabs[1]!);

    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(card).toHaveAttribute('aria-label', 'Annecy');
    expect(card.querySelector('[data-weather-temperature]')).toHaveTextContent('21°');
    const panel = widget.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', tabs[1]!.id);
    expect(tabs[1]).toHaveAttribute('aria-controls', panel.id);
    expect(tabs[0]).not.toHaveAttribute('aria-controls');
  });

  it('moves with the arrow keys, Home and End, and carries the focus', () => {
    const { widget } = renderBlock({ size: 'large', weather: twoPlaces() });
    const tablist = widget.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    tabs[0]!.focus();

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(tabs[0]);

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('lets a long place name ellipsize instead of pushing the chip out of the hero column (G6)', () => {
    // GitHub 4008082531: the name span declared `nowrap` / `overflow: hidden` /
    // `ellipsis` but, as a flex item at `min-width: auto`, never shrank — a
    // long stored name pushed the « 1/3 localisé » BUTTON past the 160 / 200 px
    // column, where the card's `overflow: hidden` clipped it out of reach.
    const long = 'Saint-Rémy-en-Bouzemont-Saint-Genest-et-Isson';
    const { card, widget } = renderBlock({
      size: 'large',
      weather: weatherFixture(
        [locationFixture({ name: long })],
        [
          linkFixture({ gardenId: 'g1', source: 'garden' }),
          linkFixture({ gardenId: 'g2', locationKey: null, source: null }),
          linkFixture({ gardenId: 'g3', locationKey: null, source: null }),
        ]
      ),
    });

    const name = within(card.querySelector('[data-weather-place]') as HTMLElement).getByText(long);
    const rules = rulesFor(name).replace(/\s+/g, '');
    expect(rules).toContain('min-width:0');
    expect(rules).toContain('text-overflow:ellipsis');
    expect(rules).toContain('white-space:nowrap');
    expect(widget.getByRole('button', { name: '1/3 located — add a city' })).toBeInTheDocument();
  });

  it('the place name is a BUTTON that opens the location dialog on the profile default (V21 b), in every state', () => {
    // Round 1, V21: PR 3b/5 had three doors to ADD a location and none to
    // change one. The title line — the place — is now the door, a discreet
    // link that a keyboard reaches, in the fed states and in the unavailable
    // one alike.
    const onLocate = vi.fn();
    const { card } = renderBlock({ size: 'large', onLocate });

    const place = card.querySelector('[data-weather-place]') as HTMLElement;
    const door = within(place).getByRole('button', { name: 'Lyon — change the location' });
    expect(door).toHaveTextContent('Lyon');
    expect(door).not.toHaveAttribute('tabindex', '-1');
    door.focus();
    expect(document.activeElement).toBe(door);
    const rules = rulesFor(door).replace(/\s+/g, '');
    expect(rules).toContain('cursor:pointer');
    expect(rules).toContain('text-decoration:underlinedotted');
    expect(rules).toContain('min-width:0');

    fireEvent.click(door);
    expect(onLocate).toHaveBeenCalledWith(null);
  });

  it('…and in the unavailable state too', () => {
    const onLocate = vi.fn();
    const { widget } = renderBlock({
      size: 'medium',
      onLocate,
      weather: weatherFixture(
        [locationFixture({ status: 'unavailable', current: null, days: [], localTime: null })],
        [linkFixture()]
      ),
    });

    fireEvent.click(widget.getByRole('button', { name: 'Lyon — change the location' }));
    expect(onLocate).toHaveBeenCalledWith(null);
  });

  it('Small and Medium show the FIRST place and no tabs (arbitrage Q8)', () => {
    const { widget, card } = renderBlock({ size: 'medium', weather: twoPlaces() });

    expect(widget.queryByRole('tablist')).toBeNull();
    expect(card).toHaveAttribute('aria-label', 'Lyon');
    expect(widget.queryByText('Annecy')).toBeNull();
  });
});

describe('WeatherBlock — the mandatory states', () => {
  it('loading: a skeleton, no figure', () => {
    const { card, widget } = renderBlock({ loading: true, weather: EMPTY_WEATHER_DATA });

    expect(card.querySelector('[data-weather-skeleton]')).not.toBeNull();
    expect(widget.queryByText(/°/)).toBeNull();
  });

  it('error: the sentence and a Retry that disables itself while a request is out', () => {
    const onRetry = vi.fn();
    const { widget } = renderBlock({ loadError: true, weather: EMPTY_WEATHER_DATA, onRetry });

    expect(widget.getByText('Couldn’t load the weather.')).toBeInTheDocument();
    fireEvent.click(widget.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error while refreshing: Retry is disabled', () => {
    const { widget } = renderBlock({ loadError: true, refreshing: true, weather: EMPTY_WEATHER_DATA });

    expect(widget.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it('no garden at all: an honest statement, no field', () => {
    const { widget } = renderBlock({ weather: EMPTY_WEATHER_DATA, gardens: [] });

    expect(widget.getByText('Create a garden to see the weather where it is.')).toBeInTheDocument();
    expect(widget.queryByLabelText('City')).toBeNull();
  });

  it('unavailable: the place line stays, and the statement replaces the figures', () => {
    const { widget, card } = renderBlock({
      size: 'large',
      weather: weatherFixture(
        [locationFixture({ status: 'unavailable', current: null, days: [], localTime: null })],
        [linkFixture()]
      ),
    });

    expect(widget.getByText('Lyon')).toBeInTheDocument();
    expect(widget.getByText('Weather temporarily unavailable.')).toBeInTheDocument();
    expect(card.querySelector('[data-weather-temperature]')).toBeNull();
  });

  it('unavailable: « Try again » re-reads the aggregate, and disables itself while a re-read is out (SMA-448 lot F4, Alexandre 22/09)', () => {
    const unavailableLyon = () =>
      weatherFixture(
        [locationFixture({ status: 'unavailable', current: null, days: [], localTime: null })],
        [linkFixture()]
      );
    const onRetry = vi.fn();
    const { card } = renderBlock({ size: 'medium', weather: unavailableLyon(), onRetry });

    const panel = card.querySelector('[data-invite-panel]') as HTMLElement;
    const retry = within(panel).getByRole('button', { name: 'Try again' });
    expect(retry).toBe(card.querySelector('[data-weather-retry]'));
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    cleanup();

    const refreshing = renderBlock({ size: 'medium', weather: unavailableLyon(), onRetry, refreshing: true });
    expect(refreshing.widget.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it('stale: the last known weather is shown with its age', () => {
    const { widget } = renderBlock({
      size: 'medium',
      weather: weatherFixture([locationFixture({ status: 'stale' })], [linkFixture()]),
    });

    expect(widget.getByText(/^Last known weather · /)).toBeInTheDocument();
    expect(widget.getByText('24°')).toBeInTheDocument();
  });
});

describe('WeatherBlock — the invitations (F.4)', () => {
  it('Small, none located: a marker and « Add a city » that opens the dialog on the profile', () => {
    const onLocate = vi.fn();
    const { widget } = renderBlock({ size: 'small', weather: unlocated(), onLocate });

    fireEvent.click(widget.getByRole('button', { name: 'Add a city' }));

    expect(onLocate).toHaveBeenCalledWith(null);
    expect(widget.queryByLabelText('City')).toBeNull();
  });

  it('Medium, none located: the sentence, the field, a disabled « Use » and the note', () => {
    const { widget } = renderBlock({ size: 'medium', weather: unlocated() });

    expect(widget.getByText('The weather needs to know where your gardens are.')).toBeInTheDocument();
    expect(widget.getByLabelText('City')).toBeInTheDocument();
    expect(widget.getByRole('button', { name: 'Use' })).toBeDisabled();
    expect(
      widget.getByText('One city is enough for all your gardens; you will be able to set one per garden in Settings.')
    ).toBeInTheDocument();
    expect(widget.queryByText('Coming soon')).toBeNull();
  });

  it('offers « Use my profile city » only when the profile has one, and it only PRE-FILLS the field (Q2)', async () => {
    vi.mocked(fetchProfile).mockResolvedValue({
      email: 'a@example.test',
      displayName: null,
      firstName: null,
      lastName: null,
      city: 'Annecy',
      hasPassword: true,
    });
    const { widget } = renderBlock({ size: 'medium', weather: unlocated() });

    const link = await widget.findByRole('button', { name: 'Use my profile city' });
    fireEvent.click(link);

    expect((widget.getByLabelText('City') as HTMLInputElement).value).toBe('Annecy');
    expect(saveProfileLocation).not.toHaveBeenCalled();
    expect(widget.getByRole('button', { name: 'Use' })).toBeDisabled();
  });

  it('hides the profile link when the profile city is blank', async () => {
    // The profile HELD, then landed inside `act` (SMA-452 § 12): the link is
    // also absent before the profile arrives, so a read then proves nothing.
    const read = deferred<UserProfile>();
    vi.mocked(fetchProfile).mockReturnValue(read.promise);
    const { widget } = renderBlock({ size: 'medium', weather: unlocated() });

    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());
    await act(async () =>
      read.resolve({
        email: 'a@example.test',
        displayName: null,
        firstName: null,
        lastName: null,
        city: null,
        hasPassword: true,
      })
    );
    expect(widget.queryByRole('button', { name: 'Use my profile city' })).toBeNull();
  });

  it('« Use » writes the PROFILE default with the picked place, then asks for a re-fetch', async () => {
    vi.useFakeTimers();
    const onLocated = vi.fn();
    vi.mocked(searchLocations).mockResolvedValue([pickFixture()]);
    const { widget } = renderBlock({ size: 'medium', weather: unlocated(), onLocated });

    const input = widget.getByLabelText('City');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Lyon' } });
    act(() => vi.advanceTimersByTime(LOCATION_SEARCH_DEBOUNCE_MS));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('option', { name: 'Lyon, Auvergne-Rhône-Alpes, France' }));
    fireEvent.click(widget.getByRole('button', { name: 'Use' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveProfileLocation).toHaveBeenCalledWith(pickFixture());
    expect(onLocated).toHaveBeenCalledTimes(1);
  });

  it('Large, partly located: the « 1/3 located » chip on the place line and the short invitation REPLACING band, alerts and units', () => {
    const onLocate = vi.fn();
    const { widget, card } = renderBlock({ size: 'large', weather: partial(), onLocate });

    const chip = widget.getByRole('button', { name: '1/3 located — add a city' });
    expect(chip).toHaveTextContent('1/3 located');
    expect(card.querySelector('[data-weather-place]')).toContainElement(chip);

    expect(widget.getByText('Balcon sud and Potager du fond have no location.')).toBeInTheDocument();
    expect(widget.getByText('One city is enough for your 3 gardens.')).toBeInTheDocument();
    expect(widget.getByLabelText('City')).toBeInTheDocument();
    expect(widget.getByRole('button', { name: 'Use' })).toBeDisabled();

    // Replaced, not added to (_spec.md § 10.25).
    expect(card.querySelector('[data-weather-band]')).toBeNull();
    expect(card.querySelector('[data-weather-alerts]')).toBeNull();
    expect(card.querySelector('[data-weather-units]')).toBeNull();
    // The head, the divider and the five days stay.
    expect(card.querySelectorAll('[data-weather-days] li')).toHaveLength(5);

    fireEvent.click(chip);
    expect(onLocate).toHaveBeenCalledWith(null);
  });

  it('counts GARDENS in the chip, not places', () => {
    const { widget } = renderBlock({
      size: 'large',
      weather: weatherFixture(
        [locationFixture()],
        [
          linkFixture({ gardenId: 'g1', source: 'garden' }),
          linkFixture({ gardenId: 'g2', source: 'garden' }),
          linkFixture({ gardenId: 'g3', locationKey: null, source: null }),
        ]
      ),
    });

    expect(widget.getByText('2/3 located')).toBeInTheDocument();
  });

  it('lists one, three and many missing gardens the way the language does', () => {
    const many = [
      ...gardens,
      gardenFixture({ id: 'g4', name: 'Serre' }),
      gardenFixture({ id: 'g5', name: 'Verger' }),
    ];
    const { widget } = renderBlock({
      size: 'large',
      gardens: many,
      weather: weatherFixture(
        [locationFixture()],
        [
          linkFixture({ gardenId: 'g1', source: 'garden' }),
          ...many.slice(1).map((garden) => linkFixture({ gardenId: garden.id, locationKey: null, source: null })),
        ]
      ),
    });

    expect(widget.getByText('Balcon sud, Potager du fond, and 2 others have no location.')).toBeInTheDocument();
    expect(widget.getByText('1/5 located')).toBeInTheDocument();
  });

  it('Medium, partly located: the chip alone opens the dialog — no field in the card', () => {
    const onLocate = vi.fn();
    const { widget } = renderBlock({ size: 'medium', weather: partial(), onLocate });

    fireEvent.click(widget.getByRole('button', { name: '1/3 located — add a city' }));

    expect(onLocate).toHaveBeenCalledWith(null);
    expect(widget.queryByLabelText('City')).toBeNull();
    expect(widget.getByText('No rain expected — water in the evening.')).toBeInTheDocument();
  });
});

// ── SMA-336 mobile lot, step 3 (pre-flight D2, arbitrage 1): the head STACKS
// under 600 px — hero on the full width, the six slots under it — and keeps
// every desktop declaration from `sm` up. Asserted on the DECLARATIONS Emotion
// emits per breakpoint, the way the breakpoint suite of the page does; the
// chevauchements themselves are measured in a real engine by
// `src/test/layout/dashboardLayout.test.tsx`.

/** The value a property takes inside one `@media (min-width:…)` block of a node's rules — the shared probe. */
const atBreakpoint = declaredAtBreakpoint;

describe('WeatherBlock — the head stacks on a phone and stays a row from 600px (mobile lot, step 3)', () => {
  it('Medium: a column under 600px, a row with the 24px gap above it', () => {
    const { card } = renderBlock({ size: 'medium' });
    const head = card.querySelector('[data-weather-head]')!;

    expect(atBreakpoint(head, '0px', 'flex-direction')).toBe('column');
    expect(atBreakpoint(head, '600px', 'flex-direction')).toBe('row');
    expect(atBreakpoint(head, '0px', 'gap')).toBe('12px');
    expect(atBreakpoint(head, '600px', 'gap')).toBe('24px');
    // Content-sized on the phone's auto-height row; the leftover height from 600px.
    expect(atBreakpoint(head, '0px', 'flex')).toBe('0 0 auto');
    expect(atBreakpoint(head, '600px', 'flex')).toBe('1');
  });

  it('Large: the 136px fixed head is the desktop’s alone — auto under 600px', () => {
    const { card } = renderBlock({ size: 'large' });
    const head = card.querySelector('[data-weather-head]')!;

    expect(atBreakpoint(head, '0px', 'height')).toBe('auto');
    expect(atBreakpoint(head, '600px', 'height')).toBe('136px');
    expect(atBreakpoint(head, '0px', 'flex-direction')).toBe('column');
    expect(atBreakpoint(head, '600px', 'flex-direction')).toBe('row');
  });

  it('the hero column is the full width and its own height on a phone, 160 / 200px and 100% from 600px', () => {
    const { card } = renderBlock({ size: 'medium' });
    const hero = card.querySelector('[data-weather-hero]')!;
    expect(atBreakpoint(hero, '0px', 'width')).toBe('100%');
    expect(atBreakpoint(hero, '600px', 'width')).toBe('160px');
    expect(atBreakpoint(hero, '0px', 'height')).toBe('auto');
    expect(atBreakpoint(hero, '600px', 'height')).toBe('100%');

    cleanup();
    // With the « 1/3 localisé » chip the desktop column is 200px (A4); the phone is still the full width.
    const partialCard = renderBlock({ size: 'medium', weather: partial() }).card;
    const partialHero = partialCard.querySelector('[data-weather-hero]')!;
    expect(atBreakpoint(partialHero, '0px', 'width')).toBe('100%');
    expect(atBreakpoint(partialHero, '600px', 'width')).toBe('200px');
  });

  it('keeps SIX slot columns at every width (arbitrage 1), at content height on a phone and 92–124px centred from 600px', () => {
    const { card } = renderBlock({ size: 'medium' });
    const hours = card.querySelector('[data-weather-hours]')!;
    const slot = hours.querySelector('li')!;

    // The six columns are declared outside any media query: the same at 360 and at 1280.
    expect(rulesFor(hours).replace(/\s/g, '')).toContain('grid-template-columns:repeat(6,minmax(0,1fr))');
    expect(hours.querySelectorAll('li')).toHaveLength(6);
    expect(atBreakpoint(slot, '0px', 'min-height')).toBe('0');
    expect(atBreakpoint(slot, '600px', 'min-height')).toBe('92px');
    expect(atBreakpoint(slot, '0px', 'height')).toBe('auto');
    expect(atBreakpoint(slot, '600px', 'height')).toBe('100%');
    expect(rulesFor(slot)).toContain('max-height:124px');
  });
});

// ── SMA-336 mobile lot, step 3 — the desktop defect the pre-flight traced as
// constat 12: on a Large card with « 2/3 localisé », the partial invitation
// with its field is ≈ 160 px where `_spec.md` § 10.25 budgeted 122, and the
// five days ran under it. The days now yield WHOLE rows, by measure
// (`useRowBudget`): the geometry is stubbed here, the pixels are measured by
// the layout harness.
describe('WeatherBlock — the days yield whole rows to the partial invitation, by measure (mobile lot, step 3)', () => {
  class ManualResizeObserver {
    static instances: ManualResizeObserver[] = [];
    readonly targets = new Set<Element>();
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      ManualResizeObserver.instances.push(this);
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
    }
    fire() {
      this.callback([], this as unknown as ResizeObserver);
    }
  }

  /** The list answers `listHeight`, every day row 44 px, everything else zero. */
  function stubDaysGeometry(listHeight: { value: number }) {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const height = this.hasAttribute('data-weather-days')
        ? listHeight.value
        : this.hasAttribute('data-weather-day')
          ? 44
          : 0;
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) } as DOMRect;
    };
    return () => {
      Element.prototype.getBoundingClientRect = original;
    };
  }

  const listHeight = { value: 150 };
  let restore: () => void;

  beforeEach(() => {
    ManualResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', ManualResizeObserver);
    restore = stubDaysGeometry(listHeight);
    listHeight.value = 150;
  });

  afterEach(() => {
    // Unmount FIRST (SMA-452 § 13): the card measures with the stubbed
    // geometry and observer until it is gone — only then do they go back.
    cleanup();
    restore();
    vi.unstubAllGlobals();
  });

  /** The day rows within the measured budget. */
  const visibleDays = (card: HTMLElement) =>
    [...card.querySelectorAll('[data-weather-day]')].filter((row) => !row.hasAttribute('data-weather-day-hidden'));
  /** The day rows hidden whole beyond it. */
  const hiddenDays = (card: HTMLElement) => [...card.querySelectorAll('[data-weather-day-hidden]')];

  it('with 150px for the list, three 44px days are shown and the last two are hidden WHOLE — out of sight and out of the reading', () => {
    const { card } = renderBlock({ size: 'large', weather: partial() });

    expect(card.querySelectorAll('[data-weather-day]')).toHaveLength(5);
    expect(visibleDays(card).map((row) => row.getAttribute('data-weather-day'))).toEqual([
      '2026-09-12', '2026-09-13', '2026-09-14',
    ]);
    const hidden = hiddenDays(card);
    expect(hidden).toHaveLength(2);
    for (const row of hidden) {
      expect(row).toHaveAttribute('aria-hidden', 'true');
      expect(rulesFor(row)).toContain('visibility:hidden');
    }
    // The hidden rows are INSIDE the list, which clips: nothing runs under the invitation.
    expect(rulesFor(card.querySelector('[data-weather-days]')!)).toContain('overflow:hidden');
    // The invitation itself is there, whole, after the list.
    expect(card.querySelector('[data-weather-invite="partial"]')).not.toBeNull();
  });

  it('shows the five days again when the list has room for them — the observer fires, the rows come back', () => {
    const { card } = renderBlock({ size: 'large', weather: partial() });
    expect(hiddenDays(card)).toHaveLength(2);

    listHeight.value = 230;
    act(() => {
      for (const instance of ManualResizeObserver.instances) instance.fire();
    });

    expect(hiddenDays(card)).toHaveLength(0);
    expect(visibleDays(card)).toHaveLength(5);
  });

  // SMA-437 lot 1, PR A, step A7b — the Tips card's defect, and the same rule
  // here: a list too short for one whole row drew « Auj. » anyway, cut
  // through its glyphs. Whole rows only, even the first.
  it('hides even « Auj. » when the list cannot hold one whole row — never a day cut through its glyphs', () => {
    listHeight.value = 20;
    const { card } = renderBlock({ size: 'large', weather: partial() });

    expect(visibleDays(card)).toHaveLength(0);
    expect(hiddenDays(card)).toHaveLength(5);
    // The invitation is still there, whole, after the list.
    expect(card.querySelector('[data-weather-invite="partial"]')).not.toBeNull();
  });

  it('hides nothing where nothing is measured — jsdom’s zero rects show all five days, as before', () => {
    restore();
    restore = () => {};
    const { card } = renderBlock({ size: 'large', weather: partial() });
    expect(hiddenDays(card)).toHaveLength(0);
    expect(card.querySelectorAll('[data-weather-day]')).toHaveLength(5);
  });
});

// SMA-448, lot F4, step W2 — THE GARDENER'S ONE CITY (V3-02, variant B;
// contract v3 § 4.6, A-N1): a single-city formula shows the FIRST place at
// every size, fixed, no tabs, and says on its Medium and Large cards which
// cities it leaves out — every one of them, named, in the language's own
// list — with, on the Large card, the link that opens the formula choice
// screen. The Expert (`cities: 'all'`) keeps the tabs of F.3 above and never
// reads the line. Never a refusal of the server (R8's written exception):
// the aggregate is the same for both.
describe('WeatherBlock — one fixed city for a single-city formula (SMA-448, lot F4, W2)', () => {
  /** Lyon, Annecy and Grenoble, one garden each. */
  const threePlaces = (): DashboardWeatherData =>
    weatherFixture(
      [
        locationFixture(),
        locationFixture({ key: '45.90,6.13', name: 'Annecy' }),
        locationFixture({ key: '45.19,5.72', name: 'Grenoble' }),
      ],
      [
        linkFixture({ gardenId: 'g1' }),
        linkFixture({ gardenId: 'g2', locationKey: '45.90,6.13', source: 'garden' }),
        linkFixture({ gardenId: 'g3', locationKey: '45.19,5.72', source: 'garden' }),
      ]
    );

  it('Large, two places: no tabs, the first place alone, and the honest line with its link', () => {
    const onSeeAllCities = vi.fn();
    const { widget, card } = renderBlock({ size: 'large', cities: 'single', weather: twoPlaces(), onSeeAllCities });

    expect(widget.queryByRole('tablist')).toBeNull();
    expect(widget.queryByRole('tab')).toBeNull();
    expect(card).toHaveAttribute('aria-label', 'Lyon');
    expect(card.querySelector('[data-weather-temperature]')).toHaveTextContent('24°');
    expect(widget.queryByText('21°')).toBeNull();

    const honest = card.querySelector('[data-weather-honest]') as HTMLElement;
    expect(honest).toHaveTextContent('Your gardens in Annecy are not shown here. See all your cities');
    const link = within(honest).getByRole('button', { name: 'See all your cities' });
    expect(link).toBe(honest.querySelector('[data-weather-honest-link]'));
    fireEvent.click(link);
    expect(onSeeAllCities).toHaveBeenCalledTimes(1);
    expect(onSeeAllCities).toHaveBeenCalledWith(link);
  });

  it('Medium: the line without its link; Small: no line — the card has no room for a sentence', () => {
    const onSeeAllCities = vi.fn();
    const medium = renderBlock({ size: 'medium', cities: 'single', weather: twoPlaces(), onSeeAllCities });
    expect(medium.widget.queryByRole('tablist')).toBeNull();
    expect(medium.card).toHaveAttribute('aria-label', 'Lyon');
    const honest = medium.card.querySelector('[data-weather-honest]') as HTMLElement;
    // The Medium form: the statement first, the names after, on ONE line
    // (the card is pinned at 273 px — W5's measure); the whole sentence as
    // its title.
    expect(honest).toHaveTextContent('Not shown here: Annecy');
    expect(honest).toHaveAttribute('title', 'Your gardens in Annecy are not shown here.');
    expect(rulesFor(honest.querySelector('span')!).replace(/\s+/g, '')).toContain('text-overflow:ellipsis');
    expect(honest.querySelector('[data-weather-honest-link]')).toBeNull();
    expect(medium.widget.queryByRole('button', { name: 'See all your cities' })).toBeNull();
    cleanup();

    const small = renderBlock({ size: 'small', cities: 'single', weather: twoPlaces(), onSeeAllCities });
    expect(small.widget.queryByRole('tablist')).toBeNull();
    expect(small.card).toHaveAttribute('aria-label', 'Lyon');
    expect(small.widget.queryByText('Annecy')).toBeNull();
    expect(small.card.querySelector('[data-weather-honest]')).toBeNull();
  });

  it('one place: nothing left out, no line — an account of one city reads as before', () => {
    const { card, widget } = renderBlock({ size: 'large', cities: 'single', weather: allLyon(), onSeeAllCities: vi.fn() });

    expect(card).toHaveAttribute('aria-label', 'Lyon');
    expect(card.querySelector('[data-weather-honest]')).toBeNull();
    expect(widget.queryByRole('tablist')).toBeNull();
  });

  it('names EVERY city left out — three places: « Annecy and Grenoble », and no link without a page to open the choice on', () => {
    const { card } = renderBlock({ size: 'large', cities: 'single', weather: threePlaces() });

    expect(card.querySelector('[data-weather-honest]')).toHaveTextContent(
      'Your gardens in Annecy and Grenoble are not shown here.'
    );
    expect(card.querySelector('[data-weather-honest-link]')).toBeNull();
  });

  it('in French, with the preposition each name takes: « Vos jardins d’Annecy et de Grenoble ne sont pas affichés ici. »', () => {
    const { card } = renderBlock({ size: 'large', cities: 'single', weather: threePlaces(), onSeeAllCities: vi.fn() }, 'fr');

    expect(card.querySelector('[data-weather-honest]')).toHaveTextContent(
      'Vos jardins d’Annecy et de Grenoble ne sont pas affichés ici. Voir toutes vos villes'
    );
  });

  it('the place the server could not describe, Large: the line still says which cities are not here', () => {
    const { card, widget } = renderBlock({
      size: 'large',
      cities: 'single',
      weather: weatherFixture(
        [
          locationFixture({ status: 'unavailable', current: null, days: [], localTime: null }),
          locationFixture({ key: '45.90,6.13', name: 'Annecy' }),
        ],
        [linkFixture({ gardenId: 'g1' }), linkFixture({ gardenId: 'g2', locationKey: '45.90,6.13', source: 'garden' })]
      ),
      onSeeAllCities: vi.fn(),
    });

    expect(widget.getByText('Weather temporarily unavailable.')).toBeInTheDocument();
    expect(widget.queryByRole('tablist')).toBeNull();
    expect(card.querySelector('[data-weather-honest]')).toHaveTextContent('Your gardens in Annecy are not shown here.');
  });

  it('every city (the Expert), Large: the tabs, and never the line', () => {
    const { widget, card } = renderBlock({ size: 'large', cities: 'all', weather: twoPlaces(), onSeeAllCities: vi.fn() });

    expect(widget.getByRole('tablist', { name: 'Places' })).toBeInTheDocument();
    expect(card.querySelector('[data-weather-honest]')).toBeNull();
  });

  it('the city is FIXED: a tab chosen under « every city » does not survive the switch to one city', () => {
    const { widget, card, rerender } = renderBlock({ size: 'large', cities: 'all', weather: twoPlaces() });
    fireEvent.click(within(widget.getByRole('tablist')).getAllByRole('tab')[1]!);
    expect(card).toHaveAttribute('aria-label', 'Annecy');

    rerender({ cities: 'single' });

    expect(card).toHaveAttribute('aria-label', 'Lyon');
    expect(widget.queryByRole('tablist')).toBeNull();
    expect(card.querySelector('[data-weather-honest]')).toHaveTextContent('Your gardens in Annecy are not shown here.');
  });
});

// SMA-448, lot F4, step W3 — THE EXPERT: EVERY CITY (V3-02; contract v3 § 4.6,
// A-N2, A-N11): the compact navigator on the Small and Medium cards — two
// chevrons, the name, the rank, the dots on Medium alone — named tabs on the
// Large card, « Lyon · 2 gardens » up to three cities and the name alone
// beyond, on ONE row; and the Full width, every city at once in columns, or
// the full reading of one city. The selector names the city, so the head does
// not write it again.
describe('WeatherBlock — every city, the Expert (SMA-448, lot F4, W3)', () => {
  /** Five gardens: the three of the file, Verger and Serre. */
  const gardensFive = [...gardens, gardenFixture({ id: 'g4', name: 'Verger' }), gardenFixture({ id: 'g5', name: 'Serre' })];
  /** `count` cities — Lyon read by g1 and g2 through the profile, then one garden per city (g3 in Annecy, g4 in Grenoble…). */
  const cityList = (count: number): DashboardWeatherData => {
    const names = ['Lyon', 'Annecy', 'Grenoble', 'Valence', 'Chambéry', 'Vienne'];
    const places = names.slice(0, count).map((name, index) =>
      index === 0
        ? locationFixture()
        : locationFixture({ key: `45.${index},5.0${index}`, name, current: { ...locationFixture().current!, tempC: 20 + index } })
    );
    const links = places
      .slice(1)
      .map((place, index) => linkFixture({ gardenId: `g${index + 3}`, locationKey: place.key, source: 'garden' }));
    return weatherFixture(places, [linkFixture({ gardenId: 'g1' }), linkFixture({ gardenId: 'g2' }), ...links]);
  };
  const nav = (card: HTMLElement) => card.querySelector('[data-weather-nav]') as HTMLElement | null;
  const dotsOf = (card: HTMLElement) =>
    [...card.querySelectorAll('[data-weather-dot]')].map((dot) => dot.getAttribute('data-weather-dot'));
  const compact = (rules: string) => rules.replace(/[ \n]+/g, '');

  it('Small, two places: the navigator takes the place line — chevrons, the name as the V21 b door, the rank « 1 / 2 », no dots — and the next chevron shows Annecy', () => {
    const onLocate = vi.fn();
    const { card, widget } = renderBlock({ size: 'small', cities: 'all', weather: twoPlaces(), onLocate });

    const group = widget.getByRole('group', { name: 'Change city' });
    expect(group).toBe(nav(card));
    expect(card.querySelectorAll('[data-weather-place]')).toHaveLength(1);
    expect(nav(card)!.querySelector('[data-weather-place]')).not.toBeNull();
    expect(card.querySelector('[data-weather-rank]')).toHaveTextContent('1 / 2');
    expect(within(group).getByText('City 1 of 2')).toBeInTheDocument();
    expect(card.querySelector('[data-weather-dots]')).toBeNull();
    expect(widget.queryByRole('tablist')).toBeNull();
    expect(card).toHaveAttribute('aria-label', 'Lyon');

    fireEvent.click(within(group).getByRole('button', { name: 'Lyon — change the location' }));
    expect(onLocate).toHaveBeenCalledWith(null);

    fireEvent.click(within(group).getByRole('button', { name: 'Next city' }));
    expect(card).toHaveAttribute('aria-label', 'Annecy');
    expect(card.querySelector('[data-weather-temperature]')).toHaveTextContent('21°');
    expect(card.querySelector('[data-weather-rank]')).toHaveTextContent('2 / 2');

    // Wraps around, like the tabs' arrow keys.
    fireEvent.click(within(group).getByRole('button', { name: 'Next city' }));
    expect(card).toHaveAttribute('aria-label', 'Lyon');
    fireEvent.click(within(group).getByRole('button', { name: 'Previous city' }));
    expect(card).toHaveAttribute('aria-label', 'Annecy');
  });

  it('Medium, three places: the navigator above the head with three dots, the active one wide; the head writes no place line', () => {
    const { card, widget } = renderBlock({ size: 'medium', cities: 'all', weather: cityList(3), gardens: gardensFive });

    const group = widget.getByRole('group', { name: 'Change city' });
    expect(dotsOf(card)).toEqual(['on', 'off', 'off']);
    expect(card.querySelector('[data-weather-rank]')).toHaveTextContent('1 / 3');
    // The navigator names the city; the head does not repeat it (V3-02).
    expect(card.querySelectorAll('[data-weather-place]')).toHaveLength(1);
    expect(card.querySelector('[data-weather-head] [data-weather-place]')).toBeNull();
    expect(card.querySelector('[data-weather-hours]')).not.toBeNull();

    fireEvent.click(within(group).getByRole('button', { name: 'Previous city' }));
    expect(card).toHaveAttribute('aria-label', 'Grenoble');
    expect(dotsOf(card)).toEqual(['off', 'off', 'on']);
  });

  it('one place: no navigator at any size — the place line, as ever', () => {
    for (const size of ['small', 'medium'] as const) {
      const { card, widget } = renderBlock({ size, cities: 'all', weather: allLyon() });
      expect(nav(card)).toBeNull();
      expect(widget.queryByRole('group', { name: 'Change city' })).toBeNull();
      expect(card.querySelector('[data-weather-place]')).not.toBeNull();
      cleanup();
    }
  });

  it('Large: the tabs carry the garden count up to three cities, the name alone beyond, on one row that never wraps — and no place line under them', () => {
    const three = renderBlock({ size: 'large', cities: 'all', weather: cityList(3), gardens: gardensFive });
    let tabs = within(three.widget.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Lyon · 2 gardens', 'Annecy', 'Grenoble']);
    expect(three.card.querySelector('[data-weather-place]')).toBeNull();
    expect(compact(rulesFor(three.widget.getByRole('tablist')))).toContain('flex-wrap:nowrap');
    cleanup();

    const four = renderBlock({ size: 'large', cities: 'all', weather: cityList(4), gardens: gardensFive });
    tabs = within(four.widget.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Lyon', 'Annecy', 'Grenoble', 'Valence']);
    // A tab shrinks and ellipsizes before the row breaks.
    expect(compact(rulesFor(tabs[0]!))).toContain('min-width:0');
    expect(compact(rulesFor(tabs[0]!.firstElementChild as HTMLElement))).toContain('text-overflow:ellipsis');
  });

  it('Large, partial: the « 2/3 located » chip ends the tabs row, since the tabs took the place line’s place', () => {
    const { card, widget } = renderBlock({
      size: 'large',
      cities: 'all',
      weather: weatherFixture(
        [locationFixture(), locationFixture({ key: '45.90,6.13', name: 'Annecy' })],
        [
          linkFixture({ gardenId: 'g1', source: 'garden' }),
          linkFixture({ gardenId: 'g2', locationKey: '45.90,6.13', source: 'garden' }),
          linkFixture({ gardenId: 'g3', locationKey: null, source: null }),
        ]
      ),
    });

    const chip = widget.getByRole('button', { name: '2/3 located — add a city' });
    expect(chip.parentElement!.previousElementSibling).toBe(widget.getByRole('tablist'));
    expect(card.querySelector('[data-weather-place]')).toBeNull();
  });

  it('Full width, three cities: the summary « 3 cities · 4 gardens », one column per city with its header, its gardens in full, its now, its band and four next days; the credit at the foot; the region named « Weather »', () => {
    const { card, widget } = renderBlock({ size: 'wide', cities: 'all', weather: cityList(3), gardens: gardensFive });

    expect(card.querySelector('[data-weather-summary]')).toHaveTextContent('3 cities · 4 gardens');
    expect(widget.queryByRole('tablist')).toBeNull();
    expect(nav(card)).toBeNull();
    const columns = [...card.querySelectorAll('[data-weather-cities] > [data-weather-city]')] as HTMLElement[];
    expect(columns.map((column) => column.querySelector('[data-weather-city-name]')!.textContent)).toEqual(['Lyon', 'Annecy', 'Grenoble']);
    expect(columns.map((column) => column.querySelector('[data-weather-city-gardens]')!.textContent)).toEqual([
      'Terrasse, Balcon sud',
      'Potager du fond',
      'Verger',
    ]);
    expect(columns.map((column) => column.querySelector('[data-weather-temperature]')!.textContent)).toEqual(['24°', '21°', '22°']);
    expect(columns.map((column) => column.querySelectorAll('[data-weather-city-day]').length)).toEqual([4, 4, 4]);
    expect(columns.map((column) => column.querySelector('[data-weather-band]') !== null)).toEqual([true, true, true]);
    expect(columns.map((column) => column.querySelector('[data-weather-city-head] [data-pill]')!.textContent)).toEqual([
      '2 gardens',
      '1 garden',
      '1 garden',
    ]);
    expect(card.querySelector('[data-weather-attribution]')).toHaveTextContent('WeatherAPI.com');
    expect(card.querySelector('[data-weather-units]')).toHaveTextContent('°C · km/h');
    expect(card.querySelector('[data-weather-retry]')).toBeNull();
    expect(card).toHaveAttribute('aria-label', 'Weather');
  });

  it('Full width, five cities: four per row at most, the fifth on a second row — the grid says so', () => {
    const { card } = renderBlock({ size: 'wide', cities: 'all', weather: cityList(5), gardens: gardensFive });

    const grid = card.querySelector('[data-weather-cities]') as HTMLElement;
    expect(grid.querySelectorAll('[data-weather-city]')).toHaveLength(5);
    expect(compact(rulesFor(grid))).toContain('grid-template-columns:1fr');
    expect(declaredAtBreakpoint(grid, '600px', 'grid-template-columns')).toBe('repeat(2, minmax(0, 1fr))');
    expect(declaredAtBreakpoint(grid, '900px', 'grid-template-columns')).toBe('repeat(4, minmax(0, 1fr))');
  });

  it('Full width, one city: the full reading spread over the width — the hero, the six slots, the five days, the band, the chips — under the summary « 1 city · 3 gardens »', () => {
    const { card, widget } = renderBlock({ size: 'wide', cities: 'all', weather: allLyon() });

    expect(card.querySelector('[data-weather-summary]')).toHaveTextContent('1 city · 3 gardens');
    expect(card.querySelector('[data-weather-cities]')).toBeNull();
    expect(card.querySelector('[data-weather-city-name]')).toHaveTextContent('Lyon');
    expect(card.querySelector('[data-weather-head]')).not.toBeNull();
    expect(card.querySelectorAll('[data-weather-hours] li')).toHaveLength(6);
    expect(card.querySelectorAll('[data-weather-day]')).toHaveLength(5);
    expect(card.querySelector('[data-weather-band]')).not.toBeNull();
    expect(card.querySelector('[data-weather-alerts]')).not.toBeNull();
    expect(card.querySelector('[data-weather-attribution]')).toHaveTextContent('WeatherAPI.com');
    // The header names the city once: no place line in the hero.
    expect(card.querySelector('[data-weather-place]')).toBeNull();
    expect(widget.queryByRole('tablist')).toBeNull();
    expect(card).toHaveAttribute('aria-label', 'Lyon');
  });

  it('Full width, a city the server could not describe: its column says so, and ONE « Try again » at the foot re-reads the aggregate', () => {
    const onRetry = vi.fn();
    const { card, widget } = renderBlock({
      size: 'wide',
      cities: 'all',
      onRetry,
      weather: weatherFixture(
        [
          locationFixture(),
          locationFixture({ key: '45.90,6.13', name: 'Annecy', status: 'unavailable', current: null, days: [], localTime: null }),
        ],
        [linkFixture({ gardenId: 'g1' }), linkFixture({ gardenId: 'g2' }), linkFixture({ gardenId: 'g3', locationKey: '45.90,6.13', source: 'garden' })]
      ),
    });

    const columns = [...card.querySelectorAll('[data-weather-city]')];
    expect(columns[1]!.querySelector('[data-weather-city-unavailable]')).toHaveTextContent('Weather temporarily unavailable.');
    expect(columns[1]!.querySelector('[data-weather-temperature]')).toBeNull();
    expect(card.querySelectorAll('[data-weather-retry]')).toHaveLength(1);
    fireEvent.click(widget.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('the Full width handed to a single-city formula reads its Large — one city, the honest line', () => {
    const { card, widget } = renderBlock({ size: 'wide', cities: 'single', weather: twoPlaces(), onSeeAllCities: vi.fn() });

    expect(card.querySelector('[data-weather-cities]')).toBeNull();
    expect(card.querySelector('[data-weather-summary]')).toBeNull();
    expect(widget.queryByRole('tablist')).toBeNull();
    expect(card.querySelector('[data-weather-honest]')).toHaveTextContent('Your gardens in Annecy are not shown here.');
  });
});
