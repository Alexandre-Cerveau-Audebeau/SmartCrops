import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../../contexts/UnitSystemContext';
import { fetchProfile } from '../../../services/profileApi';
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
import { rulesFor } from '../../../test/dashboardDom';
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

function renderBlock(over: Partial<Props> = {}) {
  localStorage.setItem('smartcrops-language', 'en');
  const props: Props = {
    size: 'large' as DashboardSize,
    weather: allLyon(),
    gardens,
    loading: false,
    loadError: false,
    onRetry: vi.fn(),
    onLocate: vi.fn(),
    onLocated: vi.fn(),
    ...over,
  };
  render(
    <ThemeProvider theme={createTheme()}>
      <LanguageProvider>
        <UnitSystemProvider>
          <WeatherBlock {...props} />
        </UnitSystemProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
  const card = document.querySelector('[data-widget="weather"]') as HTMLElement;
  return { card, widget: within(card), props };
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
    const rainy = within(rows[0] as HTMLElement).getByText('80%');
    const dry = within(rows[1] as HTMLElement).getByText('50%');
    expect(rulesFor(rainy)).toContain('color:#4677AB');
    expect(rulesFor(dry)).not.toContain('color:#4677AB');
    expect(widget.getByLabelText('Chance of rain unknown')).toHaveTextContent('—');
    expect(rows[2]).not.toHaveTextContent('0%');
  });

  it('shows an official alert as a chip with its headline in the tooltip, dropping the derived twin', () => {
    const { widget } = renderBlock({
      size: 'large',
      weather: weatherFixture(
        [locationFixture({ alerts: [alertFixture({ event: 'Vent violent', headline: 'Vigilance orange vent violent' })] })],
        [linkFixture()]
      ),
    });

    expect(widget.getByLabelText('Official alert: Vigilance orange vent violent')).toHaveTextContent('Vent violent');
    expect(widget.queryByText(/Strong wind/)).toBeNull();
  });

  it('follows the imperial system: °F and mph, from the one global toggle', () => {
    localStorage.setItem('smartcrops.unitSystem', 'imperial');
    const { card, widget } = renderBlock({ size: 'large' });

    expect(card.querySelector('[data-weather-temperature]')).toHaveTextContent('75°');
    expect(widget.getByText('84° / 61°')).toBeInTheDocument();
    expect(widget.getByText('Strong wind Tuesday · 34 mph')).toBeInTheDocument();
    expect(card.querySelector('[data-weather-units]')).toHaveTextContent('°F · mph');
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

    fireEvent.click(tabs[1]!);

    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(card).toHaveAttribute('aria-label', 'Annecy');
    expect(card.querySelector('[data-weather-temperature]')).toHaveTextContent('21°');
    const panel = widget.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', tabs[1]!.id);
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
    expect(widget.queryByLabelText('City or postal code')).toBeNull();
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
    expect(widget.queryByLabelText('City or postal code')).toBeNull();
  });

  it('Medium, none located: the sentence, the field, a disabled « Use » and the note', () => {
    const { widget } = renderBlock({ size: 'medium', weather: unlocated() });

    expect(widget.getByText('The weather needs to know where your gardens are.')).toBeInTheDocument();
    expect(widget.getByLabelText('City or postal code')).toBeInTheDocument();
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

    expect((widget.getByLabelText('City or postal code') as HTMLInputElement).value).toBe('Annecy');
    expect(saveProfileLocation).not.toHaveBeenCalled();
    expect(widget.getByRole('button', { name: 'Use' })).toBeDisabled();
  });

  it('hides the profile link when the profile city is blank', async () => {
    const { widget } = renderBlock({ size: 'medium', weather: unlocated() });

    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());
    expect(widget.queryByRole('button', { name: 'Use my profile city' })).toBeNull();
  });

  it('« Use » writes the PROFILE default with the picked place, then asks for a re-fetch', async () => {
    vi.useFakeTimers();
    const onLocated = vi.fn();
    vi.mocked(searchLocations).mockResolvedValue([pickFixture()]);
    const { widget } = renderBlock({ size: 'medium', weather: unlocated(), onLocated });

    const input = widget.getByLabelText('City or postal code');
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
    expect(widget.getByLabelText('City or postal code')).toBeInTheDocument();
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
    expect(widget.queryByLabelText('City or postal code')).toBeNull();
    expect(widget.getByText('No rain expected — water in the evening.')).toBeInTheDocument();
  });
});
