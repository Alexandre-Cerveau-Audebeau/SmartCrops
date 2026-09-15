import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../../contexts/UnitSystemContext';
import { createAppTheme } from '../../../theme';
import { contrast, resolveColor, type Rgb } from '../../../test/contrast';
import { rulesFor } from '../../../test/dashboardDom';
import { gardenFixture } from '../../../test/fixtures/dashboard';
import { ECULLY_GARDEN_IDS, weatherRealFixture } from '../../../test/fixtures/weather-real';
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

// SMA-336 PR 3b/5, round 1 (V20) — the five days were IN the DOM and INVISIBLE.
//
// Measured by Alexandre on the Large card, night theme: `ul[data-weather-days]`
// held its five complete rows, and a solid green rectangle stood where they
// should have been. jsdom lays nothing out, so this file asserts what the
// browser would compute from the DECLARATIONS Emotion emits — on the real
// response of the server, under BOTH themes of the product (`createAppTheme`,
// not MUI's bare default: `borderSubtle` and the night palette have to
// resolve for the assertions to mean anything):
//
//   1. every row is displayed, visible, opaque, at least 44 px high;
//   2. no other child of the card's column claims the full height or grows —
//      the rows' `ul` is the ONE element that takes the leftover space;
//   3. the day label and the two temperatures read at WCAG AA (4,5:1) over the
//      background they actually sit on;
//   4. the units line and the provider credit are there, and readable too.
//
// Proof by failure: written red on `299eb63` — the 1 px divider above the days
// was declared `height: 1`, which MUI's sizing transform writes as
// `height: 100%` — then green.

const gardens = ECULLY_GARDEN_IDS.map((id, index) =>
  gardenFixture({ id, name: ['Terrasse', 'Balcon sud', 'Potager du fond'][index]! })
);

type Props = React.ComponentProps<typeof WeatherBlock>;

function renderLarge(mode: 'light' | 'dark') {
  // French, the product's no-choice default — the language of the response.
  const theme = createAppTheme(mode);
  const props: Props = {
    size: 'large',
    weather: weatherRealFixture(),
    gardens,
    loading: false,
    loadError: false,
    onRetry: vi.fn(),
    onLocate: vi.fn(),
    onLocated: vi.fn(),
  };
  render(
    <ThemeProvider theme={theme}>
      <LanguageProvider>
        <UnitSystemProvider>
          <WeatherBlock {...props} />
        </UnitSystemProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
  const card = document.querySelector('[data-widget="weather"]') as HTMLElement;
  const paper = resolveColor(theme.palette.background.paper, [255, 255, 255])!;
  return { card, paper };
}

const hasEmotionClass = (node: Element) => [...node.classList].some((name) => name.startsWith('css-'));

/** Every value Emotion declared for `property` on the node's own class, in order; none for a bare node. */
function declared(node: Element, property: string): string[] {
  if (!hasEmotionClass(node)) return [];
  const pattern = new RegExp(`(?:^|[{;])${property}:([^;}]+)`, 'g');
  return [...rulesFor(node).matchAll(pattern)].map((match) => match[1]!.trim());
}

/**
 * The background a node's text is painted over: `paper`, then every ancestor's
 * own `background-color` composited on top, outermost first — what the eye
 * sees behind the glyphs, not what the node declares for itself.
 */
function effectiveBackground(node: Element, card: Element, paper: Rgb): Rgb {
  const chain: Element[] = [];
  for (let current: Element | null = node; current && current !== card.parentElement; current = current.parentElement) {
    chain.unshift(current);
  }
  let background = paper;
  for (const ancestor of chain) {
    const own = declared(ancestor, 'background-color').at(-1);
    if (own) background = resolveColor(own, background) ?? background;
  }
  return background;
}

/** The text colour a node INHERITS: the nearest declaration up the tree, over its effective background. */
function textColor(node: Element, card: Element, paper: Rgb): Rgb {
  for (let current: Element | null = node; current && current !== card.parentElement; current = current.parentElement) {
    const own = declared(current, 'color').at(-1);
    if (!own) continue;
    const resolved = resolveColor(own, effectiveBackground(node, card, paper));
    if (!resolved) throw new Error(`Unreadable colour « ${own} »`);
    return resolved;
  }
  throw new Error(`No colour declared above <${node.tagName.toLowerCase()} class="${node.className}">`);
}

const AA = 4.5;

describe.each(['light', 'dark'] as const)('WeatherBlock — the five days are VISIBLE on the real response, %s theme (V20)', (mode) => {
  it('draws five rows, each displayed, visible, opaque and at least 44 px high', () => {
    const { card } = renderLarge(mode);

    const rows = [...card.querySelectorAll('[data-weather-days] li')];
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Auj.'),
      expect.stringContaining('Mar.'),
      expect.stringContaining('Mer.'),
      expect.stringContaining('Jeu.'),
      expect.stringContaining('Ven.'),
    ]);

    for (const row of rows) {
      const style = getComputedStyle(row);
      expect(style.display, 'display').not.toBe('none');
      expect(style.visibility, 'visibility').not.toBe('hidden');
      // Unset reads as the initial value: jsdom answers '' where a browser answers '1'.
      expect(Number(style.opacity || '1'), 'opacity').toBe(1);
      expect(style.minHeight, 'min-height').toBe('44px');
      expect(declared(row, 'height')).toEqual([]);
      expect(declared(row, 'max-height')).toEqual([]);
    }
  });

  it('lets the rows take the leftover height ALONE: no sibling in the column claims 100 % or grows', () => {
    const { card } = renderLarge(mode);

    const list = card.querySelector('[data-weather-days]')!;
    const column = list.parentElement!;
    const siblings = [...column.children].filter((child) => child !== list);
    expect(siblings.length).toBeGreaterThanOrEqual(3);

    for (const sibling of siblings) {
      const rules = rulesFor(sibling).replace(/\s+/g, '');
      expect(rules, `<${sibling.tagName.toLowerCase()} ${sibling.getAttributeNames().join(' ')}>`).not.toMatch(
        /(?:^|[{;])height:100%/
      );
      expect(rules).not.toMatch(/(?:^|[{;])flex-grow:1/);
      expect(rules).not.toMatch(/(?:^|[{;])flex:1(?:[;}]|\s)/);
    }
    expect(rulesFor(list).replace(/\s+/g, '')).toMatch(/(?:^|[{;])flex:1(?:[;}])/);

    // The 1 px rule between the band and the days is ONE pixel, not the card.
    const divider = list.previousElementSibling!;
    expect(declared(divider, 'height')).toEqual(['1px']);
  });

  it('prints the day label and the two temperatures at WCAG AA over what they sit on', () => {
    const { card, paper } = renderLarge(mode);

    for (const row of card.querySelectorAll('[data-weather-days] li')) {
      // The STYLED spans — the label (« Auj. », « Mar. »), the minimum and the
      // maximum; the bare `aria-hidden` / off-screen spans inside them inherit.
      const spans = [...row.querySelectorAll('span')].filter(
        (span) => hasEmotionClass(span) && /°|\.$/.test(span.textContent ?? '')
      );
      expect(spans.length).toBeGreaterThanOrEqual(3);
      for (const span of spans) {
        const ratio = contrast(textColor(span, card, paper), effectiveBackground(span, card, paper));
        expect(ratio, `« ${span.textContent} » (${mode})`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('shows the units line and the provider credit, readable', () => {
    const { card, paper } = renderLarge(mode);

    const units = card.querySelector('[data-weather-units]')!;
    const credit = card.querySelector('[data-weather-attribution]')!;
    expect(units).toHaveTextContent('°C · km/h');
    expect(credit).toHaveTextContent('Données météo : WeatherAPI.com');
    for (const node of [units, credit]) {
      const style = getComputedStyle(node);
      expect(style.display).not.toBe('none');
      expect(style.visibility).not.toBe('hidden');
      expect(contrast(textColor(node, card, paper), effectiveBackground(node, card, paper))).toBeGreaterThanOrEqual(AA);
    }
  });
});
