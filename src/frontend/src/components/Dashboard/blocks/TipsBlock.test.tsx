import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../../contexts/UnitSystemContext';
import { rulesFor } from '../../../test/dashboardDom';
import { gardenFixture, varietyFixture } from '../../../test/fixtures/dashboard';
import { placement } from '../../../test/fixtures/placements';
import { dayFixture, linkFixture, locationFixture, weekFixture, weatherFixture } from '../../../test/fixtures/weather';
import { EMPTY_WEATHER_DATA, type DashboardWeatherData } from '../../../types/DashboardWeather';
import type { DashboardGardenData } from '../../../types/DashboardData';
import { gardenViewOf, type GardenView } from '../../../utils/gardenStats';
import TipsBlock from './TipsBlock';
import { gardenAdvice } from './gardenAdvice';

// The real `gardenAdvice`, wrapped so its calls can be counted (round 1, S-1):
// every suite below still runs the true derivation.
vi.mock('./gardenAdvice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gardenAdvice')>();
  return { ...actual, gardenAdvice: vi.fn(actual.gardenAdvice) };
});

// SMA-336 PR 4b/5 — « Conseils » against `A2Novice.dc.html` (Small),
// `Main.dc.html` (Medium: two tips, « +1 conseil → »), `A4Manquantes.dc.html`
// (one tip, the orientation invitation, « +1 conseil → ») and
// `A3Expert.dc.html` (Large: grouped by garden, « Pourquoi », « rien à
// signaler »).
//
// The scene, in Lyon on the artboards' dry Saturday (rain on Tuesday):
//   Terrasse        — oriented south, a tall wall on A3; a tomato on B3 (shaded
//                     in the evening → « prefers full sun »), a basil on B1
//                     (Frequent → the watering tip), a hydrangea on D1 (a shade
//                     lover in full sun → « prefers part shade »): THREE tips.
//   Balcon sud      — no orientation, a tomato: the A4 invitation, no tip —
//                     in the Large card, in its own group (round 1, S-3).
//   Potager du fond — oriented, a sage (Low) only, no city: checked, nothing
//                     to say → « Nothing to report ».

const tomato = varietyFixture({ plantId: 'tomato', commonName: 'Tomato', sunlightHoursMin: 8, sunlightHoursMax: 12 });
const hydrangea = varietyFixture({ plantId: 'hydrangea', commonName: 'Hydrangea', sunlightHoursMin: 4, sunlightHoursMax: 6 });
const basil = varietyFixture({ plantId: 'basil', commonName: 'Basil', wateringNeedLevel: 'Frequent', sunlightHoursMin: 6, sunlightHoursMax: 8 });
const mint = varietyFixture({ plantId: 'mint', commonName: 'Mint', wateringNeedLevel: 'High', sunlightHoursMin: 4, sunlightHoursMax: 8 });
const sage = varietyFixture({ plantId: 'sage', commonName: 'Sage', wateringNeedLevel: 'Low', sunlightHoursMin: 6, sunlightHoursMax: 8 });
const mystery = varietyFixture({ plantId: 'mystery', commonName: 'Mystery' });
const varieties = [tomato, hydrangea, basil, mint, sage, mystery];

const plant = (plantId: string, row: number, col: number) =>
  placement({ id: `${plantId}-${row}-${col}`, plantId, startRow: row, startCol: col });

const oriented = (over: Partial<DashboardGardenData> = {}): DashboardGardenData =>
  gardenFixture({
    config: { orientation: 'S', gardenType: 'terrace', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
    ...over,
  });

const terrasse = oriented({
  id: 'g1',
  name: 'Terrasse',
  cellsJson: JSON.stringify([{ row: 2, col: 0, infrastructure: 'wall' }]),
  placements: [plant('tomato', 2, 1), plant('basil', 0, 1), plant('hydrangea', 0, 3)],
  placementCount: 3,
});
const balcon = gardenFixture({
  id: 'g2',
  name: 'Balcon sud',
  config: { orientation: null, gardenType: 'balcony', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
  placements: [plant('tomato', 0, 0)],
  placementCount: 1,
});
const potager = oriented({
  id: 'g3',
  name: 'Potager du fond',
  config: { orientation: 'S', gardenType: 'inground', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
  placements: [plant('sage', 0, 0)],
  placementCount: 1,
});

/** Terrasse in Lyon on the artboards' week; the two others without a city. */
const weather = (over: Partial<DashboardWeatherData> = {}): DashboardWeatherData =>
  weatherFixture(
    [locationFixture({ days: weekFixture() })],
    [
      linkFixture({ gardenId: 'g1' }),
      linkFixture({ gardenId: 'g2', locationKey: null, source: null }),
      linkFixture({ gardenId: 'g3', locationKey: null, source: null }),
    ],
    over
  );

const viewsOf = (gardens: DashboardGardenData[]): ReadonlyMap<string, GardenView> =>
  new Map(gardens.map((garden) => [garden.id, gardenViewOf(garden)]));

type Props = React.ComponentProps<typeof TipsBlock>;

function renderBlock(over: Partial<Props> = {}, language = 'en') {
  localStorage.setItem('smartcrops-language', language);
  const gardens = over.gardens ?? [terrasse, balcon, potager];
  const props: Props = {
    size: 'medium',
    gardens,
    views: viewsOf(gardens),
    varieties,
    weather: weather(),
    loading: false,
    loadError: false,
    onRetry: vi.fn(),
    onExpand: vi.fn(),
    ...over,
  };
  const utils = render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <LanguageProvider>
          <UnitSystemProvider>
            <TipsBlock {...props} />
          </UnitSystemProvider>
        </LanguageProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
  const card = document.querySelector('[data-widget="tips"]') as HTMLElement;
  const rerender = (next: Partial<Props>) =>
    utils.rerender(
      <MemoryRouter>
        <ThemeProvider theme={createTheme()}>
          <LanguageProvider>
            <UnitSystemProvider>
              <TipsBlock {...props} {...next} />
            </UnitSystemProvider>
          </LanguageProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  return { card, widget: within(card), props, rerender };
}

const rows = (card: HTMLElement) => [...card.querySelectorAll('[data-tips-tip]')];

/**
 * The card's ONE live region (round 2, S-4), and a counter of the changes
 * made to its text: what a screen reader would be handed. `takeRecords()`
 * is synchronous, so each step of a test reads the records it caused.
 */
function liveRegion(card: HTMLElement) {
  const regions = card.querySelectorAll('[aria-live], [role="status"], [role="alert"]');
  expect(regions).toHaveLength(1);
  const region = regions[0] as HTMLElement;
  expect(region).toHaveAttribute('role', 'status');
  expect(region).toHaveAttribute('aria-live', 'polite');
  expect(region).toHaveAttribute('data-tips-status');
  // No region ABOVE the card either: one announcement, never two.
  expect(card.parentElement?.closest('[aria-live], [role="status"], [role="alert"]') ?? null).toBeNull();
  const observer = new MutationObserver(() => {});
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  return { region, changes: () => observer.takeRecords().length };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('TipsBlock — the chip and the lists come from ONE function', () => {
  it('prints in the chip exactly as many tips as gardenAdvice derives and the Large card lists', () => {
    const gardens = [terrasse, balcon, potager];
    const { card } = renderBlock({ size: 'large' });
    const expected = gardenAdvice(gardens, viewsOf(gardens), varieties, weather());

    expect(expected.tips).toHaveLength(3);
    expect(card.querySelector('[data-tips-chip]')).toHaveTextContent('3 tips');
    expect(rows(card)).toHaveLength(3);
  });
});

describe('TipsBlock — the derivation runs per input, not per render (S-1)', () => {
  it('a « Why » toggle and a same-props render re-run nothing; a new forecast re-runs it once', () => {
    // Round 1, S-1 (Extension `fc64eee0` / `7b0512aa`): `gardenAdvice` walks
    // every garden and every placement and builds three catalog maps; the
    // « Pourquoi » and V26 states change none of its four inputs.
    vi.mocked(gardenAdvice).mockClear();
    const { widget, rerender } = renderBlock({ size: 'large' });
    expect(gardenAdvice).toHaveBeenCalledTimes(1);

    fireEvent.click(widget.getAllByRole('button', { name: 'Why' })[0]!);
    expect(widget.getAllByRole('button', { name: 'Why' })[0]).toHaveAttribute('aria-expanded', 'true');
    expect(gardenAdvice).toHaveBeenCalledTimes(1);

    rerender({});
    expect(gardenAdvice).toHaveBeenCalledTimes(1);

    rerender({ weather: weather() });
    expect(gardenAdvice).toHaveBeenCalledTimes(2);
  });
});

describe('TipsBlock — the sentences name the variety, the cell and the garden', () => {
  it('« prefers full sun — shaded in the afternoon », « prefers part shade », « no rain before Tuesday »', () => {
    const { card } = renderBlock({ size: 'large' });
    const texts = rows(card).map((row) => row.textContent);

    expect(texts[0]).toContain('Your Tomato (B3, Terrasse) prefers full sun — this cell is shaded in the afternoon.');
    expect(texts[1]).toContain('Your Hydrangea (D1, Terrasse) prefers part shade — this cell is in full sun at noon.');
    expect(texts[2]).toContain('Your Basil (B1, Terrasse) likes an always-moist soil — no rain before Tuesday.');
  });

  it('a watering tip about two varieties lists both, and agrees in number', () => {
    const two = oriented({ id: 'g1', name: 'Terrasse', placements: [plant('basil', 0, 1), plant('mint', 1, 0)] });
    const { card } = renderBlock({ size: 'small', gardens: [two] });

    expect(card.querySelector('[data-tips-first]')).toHaveTextContent(
      'Your Basil and Mint (B1, Terrasse) like an always-moist soil — no rain before Tuesday.'
    );
  });

  it('« no rain expected this week » when the forecast holds no rainy day', () => {
    const dryWeek = weatherFixture(
      [locationFixture({ days: weekFixture().map((day) => dayFixture({ ...day, chanceOfRain: 0, totalPrecipMm: 0 })) })],
      [linkFixture({ gardenId: 'g1' })]
    );
    const { card } = renderBlock({ size: 'large', gardens: [terrasse], weather: dryWeek });

    expect(rows(card)[2]).toHaveTextContent('Your Basil (B1, Terrasse) likes an always-moist soil — no rain expected this week.');
  });

  it('says when the forecast is the place’s last known one (the G2 rule)', () => {
    const stale = weatherFixture([locationFixture({ days: weekFixture(), status: 'stale' })], [linkFixture({ gardenId: 'g1' })]);
    const { card } = renderBlock({ size: 'large', gardens: [terrasse], weather: stale });

    const watering = card.querySelector('[data-tips-tip="watering"]')!;
    expect(watering).toHaveAttribute('data-tips-stale');
    expect(watering).toHaveTextContent('(last known weather)');
  });

  it('in French, the artboard’s own words', () => {
    const { card } = renderBlock({ size: 'large' }, 'fr');
    const texts = rows(card).map((row) => row.textContent);

    expect(card.querySelector('[data-tips-chip]')).toHaveTextContent('3 conseils');
    expect(texts[0]).toContain('Votre Tomato (B3, Terrasse) préfère le plein soleil — cette case est à l’ombre l’après-midi.');
    expect(texts[1]).toContain('Votre Hydrangea (D1, Terrasse) préfère la mi-ombre — cette case est en plein soleil à midi.');
    expect(texts[2]).toContain('Votre Basil (B1, Terrasse) aime une terre toujours fraîche — pas de pluie avant mardi.');
    expect(texts[0]).toContain('Voir la case B3 →');
    expect(texts[0]).toContain('Pourquoi');
    expect(card).toHaveTextContent('Rien à signaler — vos plantes sont là où elles aiment être.');
    expect(card).toHaveTextContent('Sans l’orientation de « Balcon sud », impossible de comparer l’exposition — Configurer le jardin →');
  });
});

describe('TipsBlock — Small (A2Novice.dc.html l. 316-319)', () => {
  it('« 3 tips » in the key-number size, the first tip, and « See cell B3 → » to the garden’s planner', () => {
    const { card, widget } = renderBlock({ size: 'small' });

    expect(card.querySelector('[data-tips-count]')).toHaveTextContent('3 tips');
    expect(card.querySelector('[data-tips-first]')).toHaveTextContent('Your Tomato (B3, Terrasse) prefers full sun');
    const link = widget.getByRole('link', { name: 'See cell B3 →' });
    // Arbitrage Q4: the planner, with no cell in the route (SMA-440 anchors it).
    expect(link).toHaveAttribute('href', '/gardens/g1/planner');
    expect(card.querySelector('[data-tips-chip]')).toBeNull();
    // No room for the A4 invitation on a Small card (the ④a pattern): « Balcon sud » is in the scene and says nothing here.
    expect(card.querySelector('[data-tips-invite]')).toBeNull();
  });

  it('with no tip: the honest sentence, no key number, no chip', () => {
    const { card } = renderBlock({ size: 'small', gardens: [potager] });

    expect(card.querySelector('[data-tips-count]')).toBeNull();
    expect(card.querySelector('[data-tips-nothing]')).toHaveTextContent('Nothing to report — your plants are where they like to be.');
    expect(card.querySelector('[data-tips-chip]')).toBeNull();
  });
});

describe('TipsBlock — Medium (Main.dc.html l. 295-309, A4Manquantes.dc.html l. 327-335)', () => {
  it('lists two tips — a disc, the sentence, « See cell → » — and « +1 tip → » that grows the widget', () => {
    const onExpand = vi.fn();
    const { card, widget } = renderBlock({ gardens: [terrasse, potager], onExpand });

    expect(rows(card)).toHaveLength(2);
    expect(widget.getByRole('link', { name: 'See cell B3 →' })).toHaveAttribute('href', '/gardens/g1/planner');
    expect(widget.getByRole('link', { name: 'See cell D1 →' })).toBeInTheDocument();
    expect(card.querySelector('[data-tips-why]')).toBeNull();
    fireEvent.click(widget.getByRole('button', { name: '+1 tip →' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('with a garden whose orientation is unknown: ONE tip, the A4 invitation, « +2 tips → »', () => {
    const { card, widget } = renderBlock();

    expect(rows(card)).toHaveLength(1);
    const invite = card.querySelector('[data-tips-invite="g2"]')!;
    expect(invite).toHaveTextContent('Without the orientation of “Balcon sud”, the exposure can’t be compared — Set up the garden →');
    expect(within(invite as HTMLElement).getByRole('link', { name: 'Set up the garden →' })).toHaveAttribute('href', '/gardens/g2/planner');
    expect(widget.getByRole('button', { name: '+2 tips →' })).toBeInTheDocument();
  });

  it('counts the plants whose exposure the catalog does not know, in a foot with no gesture (D2)', () => {
    const withUnknown = oriented({ id: 'g1', name: 'Terrasse', placements: [plant('mystery', 0, 0), plant('mystery', 0, 1), plant('hydrangea', 0, 2)] });
    const { card } = renderBlock({ gardens: [withUnknown] });

    expect(card.querySelector('[data-tips-unknown]')).toHaveTextContent('2 plants with no known exposure');
    expect(within(card.querySelector('[data-tips-unknown]') as HTMLElement).queryByRole('link')).toBeNull();
  });

  it('with no tip and a garden that was checked: « Nothing to report »', () => {
    const { card } = renderBlock({ gardens: [potager] });

    expect(card).toHaveTextContent('Nothing to report — your plants are where they like to be.');
    expect(card.querySelector('[data-tips-more]')).toBeNull();
  });

  // Round 4, S-7 (GitHub `4054339776`): with no tip and a garden whose
  // orientation is unknown, the card drew the empty panel ABOVE the
  // invitation — « Nothing to report — your plants are where they like to
  // be » beside a garden whose plants were NOT checked, in a one-row card
  // that clips what overflows. The invitation alone says what there is to
  // say; the panel yields to it.
  it('with no tip and a garden whose orientation is unknown: the invitation alone, no empty panel (S-7)', () => {
    // A checked garden with nothing to say, and one that could not be checked.
    const { card } = renderBlock({ gardens: [potager, balcon] });

    expect(card.querySelector('[data-invite-panel]')).toBeNull();
    expect(card).not.toHaveTextContent('Nothing to report');
    expect(card).not.toHaveTextContent('No tip for now');
    const invite = card.querySelector('[data-tips-invite="g2"]')!;
    expect(invite).toHaveTextContent('Without the orientation of “Balcon sud”, the exposure can’t be compared — Set up the garden →');
    expect(within(invite as HTMLElement).getByRole('link', { name: 'Set up the garden →' })).toHaveAttribute('href', '/gardens/g2/planner');
    expect(card.querySelector('[data-tips-more]')).toBeNull();

    // The same with NO garden checked at all: the invitation, not « No tip for now ».
    cleanup();
    const alone = renderBlock({ gardens: [balcon] });
    expect(alone.card.querySelector('[data-invite-panel]')).toBeNull();
    expect(alone.card).not.toHaveTextContent('No tip for now');
    expect(alone.card.querySelector('[data-tips-invite="g2"]')).not.toBeNull();
  });

  it('with no tip and NO garden without orientation: the « Nothing to report » panel is still there — it yields only to an invitation', () => {
    const { card } = renderBlock({ gardens: [potager] });

    const panel = card.querySelector('[data-invite-panel]');
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent('Nothing to report — your plants are where they like to be.');
    expect(card.querySelector('[data-tips-invite]')).toBeNull();
  });
});

describe('TipsBlock — Large (A3Expert.dc.html l. 315-334)', () => {
  it('groups by garden with the type glyph, the name and the chip; « nothing to report » for a checked garden', () => {
    const { card } = renderBlock({ size: 'large' });

    const groups = [...card.querySelectorAll('[data-tips-group]')].map((node) => node.getAttribute('data-tips-group'));
    expect(groups).toEqual(['g1', 'g2', 'g3']);
    const terrasseGroup = card.querySelector('[data-tips-group="g1"]') as HTMLElement;
    expect(within(terrasseGroup).getByRole('heading', { level: 3, name: 'Terrasse' })).toBeInTheDocument();
    expect(terrasseGroup.querySelector('[data-tips-group-chip]')).toHaveTextContent('3 tips');
    expect(terrasseGroup.querySelector('svg[data-testid="DeckIcon"]')).not.toBeNull();
    const potagerGroup = card.querySelector('[data-tips-group="g3"]') as HTMLElement;
    expect(potagerGroup.querySelector('[data-tips-group-chip]')).toHaveTextContent('nothing to report');
    expect(potagerGroup.querySelector('[data-tips-nothing="g3"]')).toHaveTextContent('Nothing to report — your plants are where they like to be.');
    expect(potagerGroup.querySelector('svg[data-testid="GrassIcon"]')).not.toBeNull();
  });

  it('a garden whose orientation is unknown has its group, carrying the invitation where « nothing to report » would go (S-3)', () => {
    const { card } = renderBlock({ size: 'large' });

    const balconGroup = card.querySelector('[data-tips-group="g2"]') as HTMLElement;
    expect(within(balconGroup).getByRole('heading', { level: 3, name: 'Balcon sud' })).toBeInTheDocument();
    const invite = balconGroup.querySelector('[data-tips-invite="g2"]')!;
    expect(invite).toHaveTextContent('Without the orientation of “Balcon sud”, the exposure can’t be compared — Set up the garden →');
    expect(within(invite as HTMLElement).getByRole('link', { name: 'Set up the garden →' })).toHaveAttribute('href', '/gardens/g2/planner');
    // Nothing was checked, so no verdict: neither « nothing to report » nor a chip (T6).
    expect(balconGroup.querySelector('[data-tips-nothing="g2"]')).toBeNull();
    expect(balconGroup.querySelector('[data-tips-group-chip]')).toBeNull();
    expect(balconGroup.querySelector('[data-tips-tip]')).toBeNull();
    // ONE invitation for that garden, and it is the one in the group.
    expect(card.querySelectorAll('[data-tips-invite="g2"]')).toHaveLength(1);
  });

  it('a garden whose orientation is unknown but whose basil is thirsty keeps BOTH its tip and its invitation in its group', () => {
    // The watering family needs no orientation; the exposure family does — the invitation still stands beside the tip.
    const cour = gardenFixture({
      id: 'g4',
      name: 'Cour',
      config: { orientation: null, gardenType: 'inground', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
      placements: [plant('basil', 0, 1)],
      placementCount: 1,
    });
    const located = weatherFixture([locationFixture({ days: weekFixture() })], [linkFixture({ gardenId: 'g4' })]);
    const { card } = renderBlock({ size: 'large', gardens: [cour], weather: located });

    const group = card.querySelector('[data-tips-group="g4"]') as HTMLElement;
    expect(group.querySelector('[data-tips-group-chip]')).toHaveTextContent('1 tip');
    expect(group.querySelector('[data-tips-tip="watering"]')).toHaveTextContent('Your Basil (B1, Cour) likes an always-moist soil — no rain before Tuesday.');
    expect(group.querySelector('[data-tips-invite="g4"]')).not.toBeNull();
    // The tip comes first, the invitation after it.
    expect(group.querySelector('[data-tips-tip]')!.compareDocumentPosition(group.querySelector('[data-tips-invite]')!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('three gardens without orientation: every invitation scrolls WITH the groups, and only the foot stays under the zone (S-3, measured)', () => {
    // Round 1, S-3 (GitHub `4035502545`): drawn under the scrolling zone with
    // `flexShrink: 0`, three invitations left the zone — the only shrinkable
    // item, `min-height: 0` — 0 px tall on a phone (328 × 420) and 245 px of
    // its 285 on a desktop (630 × 566); with six, 13 px on a desktop. The tips
    // were not clipped, they were evicted. jsdom lays nothing out, so this
    // asserts the cause: nothing outside the zone grows with the invitations.
    const unoriented = (id: string, name: string, extra: ReturnType<typeof plant>[] = []) =>
      gardenFixture({
        id,
        name,
        config: { orientation: null, gardenType: 'balcony', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
        placements: [plant('tomato', 0, 0), ...extra],
        placementCount: 1 + extra.length,
      });
    const gardens = [terrasse, unoriented('u1', 'Balcon sud', [plant('mystery', 0, 1)]), unoriented('u2', 'Balcon nord'), unoriented('u3', 'Rebord')];
    const { card } = renderBlock({ size: 'large', gardens });

    const zone = card.querySelector('[data-tips-groups]') as HTMLElement;
    // The zone keeps the O2 / V26 shape: compact, shrinkable, its own scroll.
    const rules = rulesFor(zone).replace(/\s+/g, '');
    expect(rules).toContain('flex:01auto');
    expect(rules).toContain('min-height:0');
    expect(rules).toContain('overflow-y:auto');
    // Every invitation is IN the zone, in the group of its garden.
    const invites = [...card.querySelectorAll('[data-tips-invite]')];
    expect(invites.map((node) => node.getAttribute('data-tips-invite'))).toEqual(['u1', 'u2', 'u3']);
    for (const invite of invites) {
      expect(zone.contains(invite)).toBe(true);
      expect(invite.closest('[data-tips-group]')).toHaveAttribute('data-tips-group', invite.getAttribute('data-tips-invite')!);
    }
    expect([...zone.querySelectorAll('[data-tips-group]')].map((node) => node.getAttribute('data-tips-group'))).toEqual(['g1', 'u1', 'u2', 'u3']);
    // Under the zone: the foot alone — no invitation, no panel — and after it in document order.
    // (The card's live region, `data-tips-status`, is out of the flow and above the zone: not a layout sibling.)
    const siblings = [...zone.parentElement!.children].filter((node) => node !== zone && !node.hasAttribute('data-tips-status'));
    expect(siblings).toHaveLength(1);
    expect(siblings[0]).toHaveAttribute('data-tips-unknown');
    expect(siblings[0]).toHaveTextContent('1 plant with no known exposure');
    expect(zone.compareDocumentPosition(siblings[0]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // The three tips are all listed, in the Terrasse group.
    expect(rows(card)).toHaveLength(3);
  });

  it('three gardens without orientation and no other: the zone holds their three groups, no global panel outside it', () => {
    const unoriented = (id: string, name: string) =>
      gardenFixture({
        id,
        name,
        config: { orientation: null, gardenType: 'balcony', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
        placements: [plant('tomato', 0, 0)],
        placementCount: 1,
      });
    const { card } = renderBlock({ size: 'large', gardens: [unoriented('u1', 'Balcon sud'), unoriented('u2', 'Balcon nord'), unoriented('u3', 'Rebord')] });

    const zone = card.querySelector('[data-tips-groups]') as HTMLElement;
    expect(zone.children).toHaveLength(3);
    expect([...zone.querySelectorAll('[data-tips-invite]')]).toHaveLength(3);
    expect([...zone.parentElement!.children].filter((node) => node !== zone && !node.hasAttribute('data-tips-status'))).toHaveLength(0);
    expect(card.querySelector('[data-invite-panel]')).toBeNull();
    expect(card).not.toHaveTextContent('No tip for now');
    expect(card).not.toHaveTextContent('Nothing to report');
  });

  it('every « Why » is folded at rest, unfolds the rule, and folds back', () => {
    const { card, widget } = renderBlock({ size: 'large' });

    const whys = widget.getAllByRole('button', { name: 'Why' });
    expect(whys).toHaveLength(3);
    for (const why of whys) expect(why).toHaveAttribute('aria-expanded', 'false');
    const panels = [...card.querySelectorAll('[data-tips-why-panel]')];
    for (const panel of panels) expect(panel).toHaveAttribute('hidden');

    fireEvent.click(whys[0]!);
    expect(whys[0]).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(whys[0]!.getAttribute('aria-controls')!)!;
    expect(panel).not.toHaveAttribute('hidden');
    expect(panel).toHaveTextContent(
      'The catalog recommends at least 8 h of sun a day for this plant. In summer, cell B3 is shaded in the afternoon — computed exposure: Morning.'
    );
    // The other two stay folded: the state is per tip.
    expect(whys[1]).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(whys[0]!);
    expect(whys[0]).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('hidden');
  });

  it('the « Why » of the two other kinds names the measure', () => {
    const { card, widget } = renderBlock({ size: 'large' });
    const whys = widget.getAllByRole('button', { name: 'Why' });

    fireEvent.click(whys[1]!);
    fireEvent.click(whys[2]!);
    const panels = [...card.querySelectorAll('[data-tips-why-panel]')];
    expect(panels[1]).toHaveTextContent('The catalog recommends 4 to 6 h of sun a day for this plant. In summer, cell D1 is in full sun at noon — computed exposure: Full sun.');
    expect(panels[2]).toHaveTextContent('High watering need in the catalog. Weather of Lyon: 3 dry days from today, first rain Tuesday.');
  });

  it('the « Why » button is described by its tip’s sentence, so three « Why » are not one', () => {
    const { widget } = renderBlock({ size: 'large' });
    const why = widget.getAllByRole('button', { name: 'Why' })[0]!;

    const described = document.getElementById(why.getAttribute('aria-describedby')!);
    expect(described).toHaveTextContent('Your Tomato (B3, Terrasse) prefers full sun');
  });

  it('past ten tips, a named button deploys the rest into the same zone and folds back (the ④a pattern)', () => {
    // Twelve shade lovers, each on its own full-sun cell of a 4 × 3 garden.
    const many = Array.from({ length: 12 }, (_, i) =>
      varietyFixture({ plantId: `shade-${i}`, commonName: `Shade ${i}`, sunlightHoursMin: 4, sunlightHoursMax: 6 })
    );
    const crowded = oriented({
      id: 'g1',
      name: 'Terrasse',
      placements: many.map((variety, i) => plant(variety.plantId, Math.floor(i / 4), i % 4)),
      placementCount: 12,
    });
    const { card, widget } = renderBlock({ size: 'large', gardens: [crowded], varieties: many, weather: EMPTY_WEATHER_DATA });

    expect(card.querySelector('[data-tips-chip]')).toHaveTextContent('12 tips');
    expect(rows(card)).toHaveLength(10);
    const more = widget.getByRole('button', { name: 'Show the 2 other tips' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    const zone = document.getElementById(more.getAttribute('aria-controls')!)!;
    expect(zone).toHaveAttribute('data-tips-groups');
    // The button stays under the zone (the ④a principle, unchanged by S-3).
    expect(zone.contains(more)).toBe(false);

    fireEvent.click(more);
    expect(rows(card)).toHaveLength(12);
    expect(widget.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(widget.getByRole('button', { name: 'Show less' }));
    expect(rows(card)).toHaveLength(10);
  });
});

describe('TipsBlock — a failure is announced once, by a region that was already there (S-4)', () => {
  // Round 2, S-4 (Extension `95084e7e` / `fc363e9a`): the weather note
  // appeared after the request failed and no live region announced it. The
  // `WeatherInvite` recipe: a `role="status" aria-live="polite"` region
  // mounted EMPTY from the first render — a region born with its text is
  // read unreliably — whose text becomes the sentence on screen, once.
  it('the weather note: nothing at first render, its own sentence when it appears, nothing when it is gone', () => {
    const { card, rerender } = renderBlock({ gardens: [terrasse] });
    const { region, changes } = liveRegion(card);
    expect(region).toHaveTextContent('');
    expect(card.querySelector('[data-tips-weather-note]')).toBeNull();

    rerender({ weather: EMPTY_WEATHER_DATA, weatherError: true });
    expect(changes()).toBeGreaterThan(0);
    const note = card.querySelector('[data-tips-weather-note]') as HTMLElement;
    expect(region.textContent).toBe(note.firstElementChild!.textContent);
    expect(region.textContent).toBe('Weather unavailable — the watering tips can’t be checked for now.');

    // The same state again: the text does not move, so nothing is re-announced.
    rerender({ weather: EMPTY_WEATHER_DATA, weatherError: true });
    expect(changes()).toBe(0);

    rerender({ weather: EMPTY_WEATHER_DATA, weatherError: false });
    expect(region).toHaveTextContent('');
  });

  it('the fatal branch: nothing while the plans load, its own sentence once they fail', () => {
    const { card, rerender } = renderBlock({ size: 'large', loading: true });
    const { region, changes } = liveRegion(card);
    expect(region).toHaveTextContent('');

    rerender({ loading: false, loadError: true });
    expect(changes()).toBeGreaterThan(0);
    expect(region.textContent).toBe('Couldn’t load the tips.');
    expect(card).toHaveTextContent('Couldn’t load the tips.');

    rerender({ loading: false, loadError: true });
    expect(changes()).toBe(0);
  });

  it('a Small card, which draws no weather note, announces none', () => {
    const { card, rerender } = renderBlock({ size: 'small', gardens: [terrasse] });
    const { region, changes } = liveRegion(card);

    rerender({ weather: EMPTY_WEATHER_DATA, weatherError: true });
    expect(card.querySelector('[data-tips-weather-note]')).toBeNull();
    expect(region).toHaveTextContent('');
    expect(changes()).toBe(0);
  });

  it('a weather failure that lands while the plans still load is announced only once they do', () => {
    const { card, rerender } = renderBlock({ gardens: [terrasse], loading: true, weather: EMPTY_WEATHER_DATA, weatherError: true });
    const { region, changes } = liveRegion(card);
    expect(region).toHaveTextContent('');

    rerender({ loading: false, weather: EMPTY_WEATHER_DATA, weatherError: true });
    expect(changes()).toBeGreaterThan(0);
    expect(region.textContent).toBe('Weather unavailable — the watering tips can’t be checked for now.');
  });
});

describe('TipsBlock — the region is born EMPTY, whatever state the card mounts in (round 3, S-5)', () => {
  // GitHub `4052436613`: two paths the round-2 tests never took. (1) The card
  // MOUNTS with the error already true — the page's grid mounts once the
  // preferences land, and a widget shown again is remounted — so the region
  // was born WITH its text, the very case the recipe calls unreliable. (2) A
  // « Try again » that fails again left the text as it was, so nothing was
  // said. The document is watched from BEFORE the card exists: the records
  // say in what order the DOM was written.
  const watchDocument = () => {
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, characterData: true, subtree: true, characterDataOldValue: true });
    return () => {
      const records = observer.takeRecords();
      observer.disconnect();
      return records;
    };
  };

  /**
   * The region's text must arrive in a write of its own, AFTER the record
   * that put the region in the document, onto a region that held nothing.
   */
  const bornEmptyThenWritten = (records: MutationRecord[], region: HTMLElement) => {
    const inserted = records.findIndex((record) =>
      [...record.addedNodes].some((node) => node === region || node.contains(region))
    );
    expect(inserted).toBeGreaterThanOrEqual(0);
    const writes = records.filter((record) => region.contains(record.target));
    expect(writes.length).toBeGreaterThan(0);
    expect(records.indexOf(writes[0]!)).toBeGreaterThan(inserted);
    const first = writes[0]!;
    if (first.type === 'characterData') expect(first.oldValue).toBe('');
    else expect(first.removedNodes).toHaveLength(0);
  };

  it('mounted with the plans already failed: nothing at the first render, the sentence in a later write', () => {
    const stop = watchDocument();
    const { card } = renderBlock({ loadError: true });
    const records = stop();
    const { region } = liveRegion(card);

    expect(region.textContent).toBe('Couldn’t load the tips.');
    bornEmptyThenWritten(records, region);
  });

  it('mounted with the forecast already failed: the same, for the weather note', () => {
    const stop = watchDocument();
    const { card } = renderBlock({ gardens: [terrasse], weather: EMPTY_WEATHER_DATA, weatherError: true });
    const records = stop();
    const { region } = liveRegion(card);

    expect(region.textContent).toBe('Weather unavailable — the watering tips can’t be checked for now.');
    bornEmptyThenWritten(records, region);
  });

  it('a « Try again » that fails again is said again: emptied while the request is out, filled once when it fails', () => {
    const { card, rerender } = renderBlock({ gardens: [terrasse] });
    const { region } = liveRegion(card);
    rerender({ weather: EMPTY_WEATHER_DATA, weatherError: true });
    expect(region.textContent).toBe('Weather unavailable — the watering tips can’t be checked for now.');

    const observer = new MutationObserver(() => {});
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    // The retry is out: the region is emptied — a removal, which is not announced.
    rerender({ weather: EMPTY_WEATHER_DATA, weatherError: true, refreshing: true });
    expect(region).toBeEmptyDOMElement();
    expect(observer.takeRecords().every((record) => record.addedNodes.length === 0)).toBe(true);

    // It failed again, the same error: ONE write, hence one announcement — never two for one change.
    rerender({ weather: EMPTY_WEATHER_DATA, weatherError: true, refreshing: false });
    const filled = observer.takeRecords();
    observer.disconnect();
    expect(region.textContent).toBe('Weather unavailable — the watering tips can’t be checked for now.');
    expect(filled).toHaveLength(1);
    expect(filled[0]!.addedNodes).toHaveLength(1);
  });
});

describe('TipsBlock — states', () => {
  it('loading: a skeleton and no chip; then the rows once the plans land', () => {
    const { card, rerender } = renderBlock({ size: 'large', loading: true });

    expect(card.querySelector('[data-tips-skeleton]')).not.toBeNull();
    expect(card.querySelector('[data-tips-chip]')).toBeNull();
    expect(rows(card)).toHaveLength(0);

    rerender({ loading: false });
    expect(card.querySelector('[data-tips-skeleton]')).toBeNull();
    expect(card.querySelector('[data-tips-chip]')).toHaveTextContent('3 tips');
    expect(rows(card)).toHaveLength(3);
  });

  it('error: the sentence and a « Try again » that calls onRetry', () => {
    const onRetry = vi.fn();
    const { card, widget } = renderBlock({ loadError: true, onRetry });

    expect(card).toHaveTextContent('Couldn’t load the tips.');
    fireEvent.click(widget.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(card.querySelector('[data-tips-chip]')).toBeNull();
  });

  it('no plant placed anywhere: the honest empty state, not « nothing to report »', () => {
    const { card } = renderBlock({ gardens: [gardenFixture({ id: 'g9', placements: [] })] });

    expect(card).toHaveTextContent('No plant placed yet — tips arrive with your plantings.');
    expect(card).not.toHaveTextContent('Nothing to report');
  });

  it('a garden that could not be checked and has no tip: « No tip for now », never a misleading zero (T6)', () => {
    // A basil (Frequent) and no city: the watering family was not checked.
    const unchecked = oriented({ id: 'g1', name: 'Terrasse', placements: [plant('basil', 0, 1)] });
    const { card } = renderBlock({ gardens: [unchecked], weather: EMPTY_WEATHER_DATA });

    expect(card).toHaveTextContent('No tip for now — the exposure or the watering of your gardens can’t be assessed yet.');
    expect(card).not.toHaveTextContent('Nothing to report');
  });

  it('a WEATHER outage keeps the exposure tips, says the watering half is out, and « Try again » retries (S-2)', () => {
    // Round 1, S-2 (Extension `3e914892`): the page passed the gardens'
    // failure alone as `loadError`, so a weather-only failure kept the block
    // on its normal path and the weather half of `onRetry` was unreachable.
    const onRetry = vi.fn();
    const { card } = renderBlock({ gardens: [terrasse], weather: EMPTY_WEATHER_DATA, weatherError: true, onRetry });

    // The plans alone give these two; the basil's watering tip is not derived.
    expect(rows(card).map((row) => row.getAttribute('data-tips-tip'))).toEqual(['sunLover', 'shadeLover']);
    expect(card.querySelector('[data-tips-chip]')).toHaveTextContent('2 tips');
    const note = card.querySelector('[data-tips-weather-note]') as HTMLElement;
    expect(note).toHaveTextContent('Weather unavailable — the watering tips can’t be checked for now.');
    fireEvent.click(within(note).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    // Not the fatal branch, not a skeleton.
    expect(card).not.toHaveTextContent('Couldn’t load the tips.');
    expect(card.querySelector('[data-tips-skeleton]')).toBeNull();
  });

  it('the outage note is under the zone in Large — once — and absent from Small, whose tips stand', () => {
    const large = renderBlock({ size: 'large', gardens: [terrasse], weather: EMPTY_WEATHER_DATA, weatherError: true });
    const zone = large.card.querySelector('[data-tips-groups]') as HTMLElement;
    const notes = large.card.querySelectorAll('[data-tips-weather-note]');
    expect(notes).toHaveLength(1);
    expect(zone.contains(notes[0]!)).toBe(false);
    expect(zone.compareDocumentPosition(notes[0]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(rows(large.card)).toHaveLength(2);

    cleanup();
    const small = renderBlock({ size: 'small', gardens: [terrasse], weather: EMPTY_WEATHER_DATA, weatherError: true });
    expect(small.card.querySelector('[data-tips-weather-note]')).toBeNull();
    expect(small.card.querySelector('[data-tips-count]')).toHaveTextContent('2 tips');
  });

  it('with nothing to derive during the outage: the honest sentence AND the note; while a retry runs, its button waits', () => {
    // A basil (Frequent) alone: the exposure family has nothing to say and
    // the watering family could not be checked — « No tip for now » (T6),
    // and the reason with its retry.
    const thirsty = oriented({ id: 'g1', name: 'Terrasse', placements: [plant('basil', 0, 1)] });
    const { card, widget, rerender } = renderBlock({ gardens: [thirsty], weather: EMPTY_WEATHER_DATA, weatherError: true });

    expect(card).toHaveTextContent('No tip for now — the exposure or the watering of your gardens can’t be assessed yet.');
    expect(card.querySelector('[data-tips-weather-note]')).not.toBeNull();
    expect(widget.getByRole('button', { name: 'Try again' })).toBeEnabled();
    rerender({ refreshing: true });
    expect(widget.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it('a healthy forecast draws no outage note', () => {
    const { card } = renderBlock({ size: 'large' });

    expect(card.querySelector('[data-tips-weather-note]')).toBeNull();
  });

  it('mentions no price, no quota and no plan', () => {
    const { card } = renderBlock({ size: 'large' });

    expect(card.textContent).not.toMatch(/quota|abonnement|subscription|pricing|tarif|plan\b/i);
  });
});
