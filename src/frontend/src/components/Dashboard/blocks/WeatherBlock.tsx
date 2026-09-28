import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import DashboardBlock from '../DashboardBlock';
import InviteState from '../InviteState';
import MissingDataMark from '../MissingDataMark';
import { BLOCK_ICONS } from '../blockIcons';
import WeatherAlerts from './WeatherAlerts';
import WeatherBar from './WeatherBar';
import WeatherDays from './WeatherDays';
import WeatherGlyph from './WeatherGlyph';
import WeatherHero from './WeatherHero';
import WeatherHours from './WeatherHours';
import WeatherInvite from './WeatherInvite';
import WeatherPlace from './WeatherPlace';
import { cityList, displayTemperature, frenchElides } from './weatherFormat';
import { gardenerSentence, weatherChips } from './weatherRules';
import { localDateOf, upcomingHours, weekScale, weekdayShort } from './weatherTime';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import {
  DASHBOARD_SPACING,
  DASHBOARD_TYPE,
  DASHBOARD_WEATHER,
} from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { DashboardSize } from '../../../types/Dashboard';
import type { DashboardGardenData } from '../../../types/DashboardData';
import type { DashboardWeatherData, WeatherLocation } from '../../../types/DashboardWeather';
import { formatRelativeDate } from '../../../utils/formatRelativeDate';

/**
 * SMA-448, lot F4 — how many of the account's cities the widget shows, the
 * formula's say (`FormulaCapabilities.weather`, V3-02): the Gardener ONE
 * fixed city, the Expert every one. A difference of interface, never a
 * refusal of the server (contract v3, R8's written exception): the aggregate
 * serves every city to both, and the Gardener's widget names the ones it
 * leaves out.
 */
export type WeatherCities = 'single' | 'all';

interface Props {
  size: DashboardSize;
  editing?: boolean;
  weather: DashboardWeatherData;
  /** One fixed city (the Gardener) or every city (the Expert) — see {@link WeatherCities}. */
  cities: WeatherCities;
  /**
   * « Voir toutes vos villes » — the honest line's link, on the Large card of
   * a single-city formula: the page opens the formula choice screen on it,
   * where every city is the Expert's. Without it the line has no link.
   */
  onSeeAllCities?: (opener: HTMLElement) => void;
  /** The aggregate's gardens — for the names the invitation lists. */
  gardens: DashboardGardenData[];
  loading: boolean;
  loadError: boolean;
  /** A replacement is in flight while the error is still on screen: Retry says so by disabling itself. */
  refreshing?: boolean;
  onRetry: () => void;
  /** Opens the location dialog — on the PROFILE default when `null`. */
  onLocate: (gardenId: string | null) => void;
  /** The widget's own invitation WROTE the profile default — the page re-reads as after a write (round 4, F1). */
  onLocated: () => void;
}

/**
 * SMA-336 PR 3b/5 — the weather widget at its three sizes (pre-flight § F.1,
 * `A5MeteoTailles.dc.html`), the one card of the dashboard WITHOUT a title row
 * (arbitrage Q1, `_spec.md:108`): the place line is its title, in every state,
 * and `DashboardBlock` takes `headless` for it alone.
 *
 * Rule 3 of the design contract, size by size: Small shows the place, the hero,
 * the condition, « Aujourd'hui » and the day's bar on the week's scale; Medium
 * adds the six slots and the gardener's band; Large adds the place tabs, the
 * five days, the alert line and the units. Same data, more of it.
 *
 * The four mandatory states (§ 7): a skeleton while the aggregate loads, an
 * error with Retry, the honest empties — no garden, weather unavailable — and
 * the INVITATION, in two forms: none located (the field in the card) and some
 * located (the « 1/3 localisé » chip on the place line; in Large the short
 * invitation REPLACES the band, the alerts and the units, `_spec.md` § 10.25).
 *
 * Small and Medium show the FIRST place of `locations[]` (arbitrage Q8 — the
 * « jardin suivi » option is deferred); Large shows a tab per place — to a
 * formula that shows EVERY city (`cities: 'all'`, the Expert). A single-city
 * formula (the Gardener, SMA-448 lot F4, V3-02 variant B) shows the first
 * place at every size, fixed, and says on its Medium and Large cards which
 * cities it leaves out — the honest line, « Vos jardins d’Annecy et de
 * Grenoble ne sont pas affichés ici. » — so a reader of three cities never
 * takes one city's rain for the weather of all. « Now » is the place's
 * `localTime`; °F and mph follow `useUnitSystem`; the stale note is the one
 * line of the card that reads the browser clock, to say how old the last
 * known weather is.
 */
export default function WeatherBlock({
  size,
  editing,
  weather,
  cities,
  onSeeAllCities,
  gardens,
  loading,
  loadError,
  refreshing = false,
  onRetry,
  onLocate,
  onLocated,
}: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  const { system } = useUnitSystem();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const title = t('dashboard.blocks.weather.title');
  const WeatherIcon = BLOCK_ICONS.weather;

  const locations = weather.locations;
  // A key that disappeared on a re-fetch falls back to the first place rather
  // than to an empty panel. A single-city formula shows the first place and
  // nothing else: a tab chosen under the other formula does not survive the
  // switch (lot F4).
  const active =
    (cities === 'all' ? locations.find((location) => location.key === selectedKey) : undefined) ??
    locations[0] ??
    null;
  /** The cities a single-city formula leaves out — the ones the honest line names. */
  const otherCities =
    cities === 'single' && active
      ? locations.filter((location) => location.key !== active.key).map((location) => location.name)
      : [];

  // The chip counts GARDENS, not places (§ F.4): « 1/3 localisé » on an account
  // of three gardens reading one place.
  const totalGardens = weather.gardens.length;
  const locatedGardens = weather.gardens.filter((link) => link.locationKey !== null).length;
  const partial = locatedGardens > 0 && locatedGardens < totalGardens;
  const missingNames = weather.gardens
    .filter((link) => link.locationKey === null)
    .map((link) => gardens.find((garden) => garden.id === link.gardenId)?.name)
    .filter((name): name is string => typeof name === 'string');

  const gardensOn = (key: string) =>
    weather.gardens.filter((link) => link.locationKey === key).length;

  /** `.pill.n` — the neutral pill: the « 1/3 localisé » chip, the Full width's summary and its columns' garden counts. */
  const pillSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: DASHBOARD_TYPE.chipHeight,
    px: '10px',
    borderRadius: '999px',
    fontSize: DASHBOARD_TYPE.chip,
    lineHeight: 1,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    backgroundColor: tk.pillBg,
    color: tk.pillText,
    flexShrink: 0,
  } as const;

  /** The « 1/3 localisé » chip — `.pill.n` on the place line, and a button: it opens the dialog. */
  const locatedChip = partial ? (
    <Box
      component="button"
      type="button"
      data-weather-located
      data-pill
      aria-label={t('dashboard.blocks.weather.locatedAction', {
        located: locatedGardens,
        total: totalGardens,
      })}
      onClick={() => onLocate(null)}
      sx={{
        ...pillSx,
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <LocationOnOutlinedIcon aria-hidden sx={{ fontSize: 14 }} />
      {t('dashboard.blocks.weather.located', { located: locatedGardens, total: totalGardens })}
    </Box>
  ) : undefined;

  /** « Dernière météo connue · il y a 2 h » for a stale place; null otherwise. */
  const staleNote = (location: WeatherLocation): string | null => {
    if (location.status !== 'stale' || !location.fetchedAt) return null;
    const instant = Date.parse(location.fetchedAt);
    if (Number.isNaN(instant)) return null;
    return t('dashboard.blocks.weather.stale', {
      when: formatRelativeDate(new Date(instant), new Date(), i18n.language),
    });
  };

  const subLine = (text: string) => (
    <Typography sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}>
      {text}
    </Typography>
  );

  /**
   * « Données météo : WeatherAPI.com » — the provider's credit, at the foot of
   * the Large card (arbitrage Q12, SMA-336 PR 3b/5 step 10): the terms ask a
   * free-tier user to credit the provider by name, and crediting a source is
   * right at any tier. A 14 px secondary line, never smaller (§ 2).
   */
  const attribution = (
    <Typography
      component="span"
      data-weather-attribution
      sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary', whiteSpace: 'nowrap' }}
    >
      {t('dashboard.blocks.weather.attribution')}
    </Typography>
  );

  /**
   * `.gard` — the gardener's band: full width, `--inv-bg`, radius 12, 11 / 16,
   * 16 px / 600, a 20 px glyph. `compact` is the Full width's column form
   * (V3-02, `.gard.sm`): a 17 px glyph, the secondary 14 px, 8 / 12.
   */
  const band = (location: WeatherLocation, compact = false) => {
    const sentence = gardenerSentence(location);
    if (!sentence) return null;
    const Icon = sentence === 'frostTonight' ? AcUnitOutlinedIcon : WaterDropOutlinedIcon;
    return (
      <Box
        data-weather-band
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: `${DASHBOARD_WEATHER.bandGap}px`,
          backgroundColor: tk.invBg,
          borderRadius: `${DASHBOARD_WEATHER.bandRadius}px`,
          py: compact ? '8px' : `${DASHBOARD_WEATHER.bandPaddingY}px`,
          px: compact ? '12px' : `${DASHBOARD_WEATHER.bandPaddingX}px`,
          fontSize: compact ? DASHBOARD_TYPE.secondary : DASHBOARD_WEATHER.bandText,
          lineHeight: 1.35,
          fontWeight: 600,
          color: 'text.secondary',
          flexShrink: 0,
        }}
      >
        <Icon aria-hidden sx={{ fontSize: compact ? 17 : DASHBOARD_WEATHER.bandIcon, color: 'primary.main', flexShrink: 0 }} />
        <span>{t(`dashboard.blocks.weather.sentence.${sentence}`)}</span>
      </Box>
    );
  };

  /**
   * `.dv` — the 1 px rule between the band and the five days. In PIXELS, spelled
   * out (round 1, V20): MUI's `sx` runs every sizing value through
   * `sizingTransform`, which reads a number in `(0, 1]` as a FRACTION — so
   * `height: 1` was emitted as `height: 100%`, and this « rule » stood the full
   * height of the card's column, painted `borderSubtle` (a saturated green on
   * the night card), with `flexShrink: 0`. The five rows behind it kept their
   * DOM and lost their space. `WeatherBlock.visibility.test.tsx` pins the pixel.
   */
  const divider = (
    <Box
      sx={{
        height: `${DASHBOARD_WEATHER.divider}px`,
        backgroundColor: 'borderSubtle',
        flexShrink: 0,
      }}
    />
  );

  /**
   * The place line's gesture (round 1, V21 b): the name is a button that opens
   * the location dialog on the profile default — the SAME dialog the gear's
   * « Localisation… » opens — in every state the line is drawn in.
   */
  const editPlace = () => onLocate(null);
  const editPlaceLabel = (location: WeatherLocation) =>
    t('dashboard.blocks.weather.editLocation', { place: location.name });

  /**
   * SMA-448, lot F4 — the honest line of a single-city formula (V3-02
   * variant B; A-N1: on the Medium AND the Large card): « Vos jardins
   * d’Annecy et de Grenoble ne sont pas affichés ici. », every city left out
   * named (`cityList`, never « 2 autres »), a 16 px info glyph before it, the
   * secondary 14 px (V11's floor — the mock-up's 13 px is not taken). On the
   * Large card the line ends with « Voir toutes vos villes », a link the page
   * answers by opening the formula choice screen. Nothing on Small: the card
   * has no room for a sentence, and its one place reads as one place.
   *
   * The Medium card is PINNED at 273 px (A-N10) and its head needs 136: the
   * line has ONE line there, measured — with four long names the sentence
   * wrapped and the hero's « 29° / 16° » ran 7 px over the band (the page
   * harness, W5). So the Medium form leads with what matters and names the
   * cities after: « Non affichés ici : Annecy, Grenoble et Valence », on one
   * line, ellipsized at its tail — the names, never the statement — with the
   * whole sentence as its title. Every name stays in the text.
   */
  const honestLine = (withLink: boolean) => {
    if (otherCities.length === 0) return null;
    const ofCity = (name: string) =>
      t(
        frenchElides(name) ? 'dashboard.blocks.weather.cityOfVowel' : 'dashboard.blocks.weather.cityOf',
        { place: name }
      );
    const sentence = t('dashboard.blocks.weather.otherCities', {
      places: cityList(otherCities, i18n.language, ofCity),
    });
    const oneLine = !withLink;
    return (
      <Box
        data-weather-honest
        title={oneLine ? sentence : undefined}
        sx={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flexShrink: 0, minWidth: 0 }}
      >
        <InfoOutlinedIcon aria-hidden sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0, mt: '2px' }} />
        <Typography
          component="span"
          sx={{
            fontSize: DASHBOARD_TYPE.secondary,
            lineHeight: 1.4,
            color: 'text.secondary',
            minWidth: 0,
            ...(oneLine ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
          }}
        >
          {oneLine
            ? t('dashboard.blocks.weather.otherCitiesShort', {
                places: cityList(otherCities, i18n.language, (name) => name),
              })
            : sentence}
          {withLink && onSeeAllCities && (
            <>
              {' '}
              <Box
                component="button"
                type="button"
                data-weather-honest-link
                onClick={(event: MouseEvent<HTMLButtonElement>) => onSeeAllCities(event.currentTarget)}
                sx={{
                  background: 'none',
                  border: 0,
                  p: 0,
                  m: 0,
                  font: 'inherit',
                  fontWeight: 700,
                  color: 'primary.main',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                  whiteSpace: 'nowrap',
                  borderRadius: '4px',
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                {t('dashboard.blocks.weather.seeAllCities')}
              </Box>
            </>
          )}
        </Typography>
      </Box>
    );
  };

  /** « Réessayer » — the same re-read the load error offers, disabled while one is in flight. */
  const retryButton = (
    <Button data-weather-retry size="small" variant="outlined" onClick={onRetry} disabled={refreshing} sx={{ mt: '8px' }}>
      {t('dashboard.retry')}
    </Button>
  );

  /**
   * A place the server could not describe: its line, an honest statement —
   * and « Réessayer » (SMA-448 lot F4, Alexandre 22/09 18:52). Under a
   * single-city formula the honest line still names the cities left out; the
   * Expert's Small and Medium cards keep their navigator over the statement.
   */
  const unavailable = (location: WeatherLocation) => (
    <>
      {selectorNames && size !== 'large' ? (
        navigator(location)
      ) : (
        <WeatherPlace
          name={location.name}
          trailing={locatedChip}
          onEdit={editPlace}
          editLabel={editPlaceLabel(location)}
        />
      )}
      <InviteState
        icon={<WeatherIcon />}
        message={t('dashboard.blocks.weather.unavailable')}
        variant="invite"
        action={retryButton}
      />
      {size !== 'small' && honestLine(size === 'large')}
    </>
  );

  /**
   * SMA-448, lot F4 — the Expert's COMPACT CITY NAVIGATOR of the Small and
   * Medium cards (V3-02; contract v3 § 4.6, A-N2): two chevrons, the city's
   * name — the same door to the location dialog as the place line, V21 b —
   * its rank « 1 / 6 » and, on the Medium card, the pagination dots; on the
   * Small card the width does not carry the dots, and the rank alone says
   * there is more to see. It TAKES THE PLACE of the place line, which it
   * names, so the card never writes the name twice. A named group, never a
   * dropdown; the chevrons wrap around, like the tabs' arrow keys.
   * Nothing when the account reads one city: the place line, as ever.
   */
  const navigator = (location: WeatherLocation) => {
    const index = locations.findIndex((candidate) => candidate.key === location.key);
    const count = locations.length;
    const go = (step: number) => setSelectedKey(locations[(index + step + count) % count]!.key);
    const chevronSx = {
      width: 26,
      height: 26,
      borderRadius: '8px',
      border: 'none',
      p: 0,
      flexShrink: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'surfaceSubtle',
      color: 'text.secondary',
      cursor: 'pointer',
      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
    } as const;
    return (
      <Box
        data-weather-nav
        role="group"
        aria-label={t('dashboard.blocks.weather.changeCity')}
        sx={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexShrink: 0, maxWidth: '100%' }}
      >
        <Box
          component="button"
          type="button"
          data-weather-nav-prev
          aria-label={t('dashboard.blocks.weather.previousCity')}
          onClick={() => go(-1)}
          sx={chevronSx}
        >
          <ChevronLeftIcon aria-hidden sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: '0 1 auto' }}>
          <WeatherPlace name={location.name} onEdit={editPlace} editLabel={editPlaceLabel(location)} />
        </Box>
        {/* The figure for the eye, the sentence for the ear (G5's recipe). */}
        <Typography
          component="span"
          data-weather-rank
          sx={{
            fontSize: DASHBOARD_TYPE.secondary,
            fontWeight: 700,
            color: 'text.secondary',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <span aria-hidden>{t('dashboard.blocks.weather.rank', { index: index + 1, count })}</span>
          <Box component="span" sx={visuallyHidden}>
            {t('dashboard.blocks.weather.rankLabel', { index: index + 1, count })}
          </Box>
        </Typography>
        {size !== 'small' && (
          <Box data-weather-dots aria-hidden sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            {locations.map((candidate, at) => (
              <Box
                key={candidate.key}
                data-weather-dot={at === index ? 'on' : 'off'}
                sx={{
                  width: at === index ? 14 : 5,
                  height: 5,
                  borderRadius: at === index ? '3px' : '50%',
                  backgroundColor: at === index ? 'primary.main' : tk.chipBorder,
                }}
              />
            ))}
          </Box>
        )}
        <Box
          component="button"
          type="button"
          data-weather-nav-next
          aria-label={t('dashboard.blocks.weather.nextCity')}
          onClick={() => go(1)}
          sx={chevronSx}
        >
          <ChevronRightIcon aria-hidden sx={{ fontSize: 18 }} />
        </Box>
        {locatedChip && <Box sx={{ ml: 'auto', flexShrink: 0 }}>{locatedChip}</Box>}
      </Box>
    );
  };

  /** Whether the Expert's selector — the navigator or the tabs — names the city, so the head does not. */
  const selectorNames = cities === 'all' && locations.length > 1;

  const smallBody = (location: WeatherLocation) => {
    if (!location.current) return unavailable(location);
    const today = location.days[0];
    const scale = weekScale(location.days);
    const note = staleNote(location);
    return (
      <WeatherHero
        location={location}
        current={location.current}
        size="small"
        system={system}
        trailing={locatedChip}
        onEditPlace={editPlace}
        editPlaceLabel={editPlaceLabel(location)}
        // The navigator takes the place line's place on the Small card (lot F4).
        {...(selectorNames ? { place: navigator(location) } : {})}
        footer={
          today && scale ? (
            <>
              {/* `.sub` « Aujourd'hui » — added at round 2 bis because four
                  blocks left three voids of 41 px (`_spec.md` § 6); on a stale
                  place it is where the age of the data is said. */}
              {subLine(note ?? t('dashboard.blocks.weather.todayLine'))}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Typography
                  component="span"
                  sx={{ fontSize: DASHBOARD_WEATHER.minMax, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                >
                  {t('dashboard.blocks.weather.degrees', {
                    value: displayTemperature(today.minTempC, system),
                  })}
                </Typography>
                <WeatherBar day={today} scale={scale} />
                <Typography
                  component="span"
                  sx={{ fontSize: DASHBOARD_WEATHER.minMax, fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}
                >
                  {t('dashboard.blocks.weather.degrees', {
                    value: displayTemperature(today.maxTempC, system),
                  })}
                </Typography>
              </Box>
            </>
          ) : undefined
        }
      />
    );
  };

  /**
   * The head shared by Medium and Large: the hero column beside the six slots
   * — and STACKED on a phone (SMA-336 mobile lot, step 3; pre-flight D2,
   * arbitrage 1): hero on the full width, then the six slots on the full
   * width, then the band. Under 600 px the 160 / 200 px hero column left the
   * six slots 104 / 64 px at 360 — « 14 h15 h16 h », icons on icons, V36 —
   * a WIDTH no row height could cure. Stacked and on an auto-height row (step
   * 1), the four weather states measured at zero overlap. From `sm` up every
   * declaration is the one the artboard has: the row, its 24 px gap, the
   * 136 px fixed head of the Large card (`_spec.md` § 10.26).
   */
  const head = (location: WeatherLocation, fixed: boolean) => (
    <Box
      data-weather-head
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: `${DASHBOARD_WEATHER.stackGap}px`, sm: '24px' },
        minHeight: 0,
        ...(fixed
          ? { height: { xs: 'auto', sm: DASHBOARD_WEATHER.largeHead }, flex: '0 0 auto' }
          : { flex: { xs: '0 0 auto', sm: 1 } }),
      }}
    >
      <WeatherHero
        location={location}
        current={location.current!}
        size={size}
        system={system}
        trailing={locatedChip}
        onEditPlace={editPlace}
        editPlaceLabel={editPlaceLabel(location)}
        // The selector above the head — the Medium navigator, the Large tabs
        // — names the city: the head does not write it again (lot F4, V3-02).
        {...(selectorNames ? { place: null } : {})}
      />
      <WeatherHours hours={upcomingHours(location)} system={system} />
    </Box>
  );

  const mediumBody = (location: WeatherLocation) => {
    if (!location.current) return unavailable(location);
    const note = staleNote(location);
    return (
      <>
        {selectorNames && navigator(location)}
        {head(location, false)}
        {band(location)}
        {note && subLine(note)}
        {honestLine(false)}
      </>
    );
  };

  const largeBody = (location: WeatherLocation) => {
    if (!location.current) return unavailable(location);
    const today = localDateOf(location);
    const note = staleNote(location);
    return (
      <>
        {head(location, true)}
        {partial ? (
          <>
            {divider}
            <WeatherDays days={location.days} today={today} system={system} />
            {/* The short invitation REPLACES the band, the alert line and the
                units (`_spec.md` § 10.25): the card is full at 516 px. */}
            <WeatherInvite
              variant="partial"
              missing={missingNames}
              total={totalGardens}
              onSaved={onLocated}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>{attribution}</Box>
          </>
        ) : (
          <>
            {band(location)}
            {divider}
            <WeatherDays days={location.days} today={today} system={system} />
            <WeatherAlerts
              line={weatherChips(location.days, location.alerts)}
              today={today}
              system={system}
              note={
                <>
                  {note && subLine(note)}
                  {attribution}
                </>
              }
            />
          </>
        )}
        {honestLine(true)}
      </>
    );
  };

  /**
   * The place tabs of the Large card, `.wx-tab` (l. 221-223): 28 px pills,
   * padding 0 13, radius 15, 14 px / 700; the active one on `--tint` in the
   * primary colour. `role="tablist"` / `tab`, `aria-selected`, roving tabindex
   * and the arrow keys, Home and End — 28 px pills rather than MUI's 48 px Tabs.
   */
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = locations.findIndex((location) => location.key === active?.key);
    if (index < 0) return;
    const last = locations.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    setSelectedKey(locations[next]!.key);
    tabRefs.current[next]?.focus();
  };

  const tabId = (key: string) => `weather-tab-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;

  // Tabs are the Expert's: a single-city formula draws ONE city (lot F4).
  // The tab carries « Lyon · 4 jardins » up to three cities; beyond, the
  // name alone, so six cities hold on ONE row (V3-02 — two rows would cost
  // the five days a day). The row never wraps: a tab shrinks and ellipsizes
  // before the row breaks, and every city stays on it. The « 1/3 localisé »
  // chip ends the row, since the tabs took the place line's place.
  const withCount = locations.length <= 3;
  const tabs = cities === 'all' && locations.length > 1 && (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexShrink: 0 }}>
      <Box
        role="tablist"
        aria-label={t('dashboard.blocks.weather.places')}
        onKeyDown={onTabKeyDown}
        sx={{ display: 'flex', gap: `${DASHBOARD_WEATHER.tabGap}px`, flexWrap: 'nowrap', minWidth: 0 }}
      >
        {locations.map((location, index) => {
          const selected = location.key === active?.key;
          const count = gardensOn(location.key);
          return (
            <Box
              component="button"
              type="button"
              role="tab"
              key={location.key}
              id={tabId(location.key)}
              ref={(node: HTMLButtonElement | null) => {
                tabRefs.current[index] = node;
              }}
              aria-selected={selected}
              // Only the ACTIVE place has a panel in the DOM (the one
              // `role="tabpanel"` below): pointing an unselected tab at an absent
              // id is an unresolvable IDREF — axe `aria-valid-attr-value`
              // (round 1, G4 — GitHub 4008082515). The ARIA tabs pattern allows
              // omitting `aria-controls` when the panel is not rendered.
              {...(selected ? { 'aria-controls': `${tabId(location.key)}-panel` } : {})}
              tabIndex={selected ? 0 : -1}
              onClick={() => setSelectedKey(location.key)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                minWidth: 0,
                height: DASHBOARD_WEATHER.tab,
                px: `${DASHBOARD_WEATHER.tabPaddingX}px`,
                borderRadius: `${DASHBOARD_WEATHER.tabRadius}px`,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: DASHBOARD_WEATHER.tabText,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                backgroundColor: selected ? tk.tint : 'transparent',
                color: selected ? 'primary.dark' : 'text.secondary',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {withCount && count > 1
                  ? t('dashboard.blocks.weather.tab', {
                      place: location.name,
                      gardens: t('dashboard.blocks.weather.tabGardens', { count }),
                    })
                  : location.name}
              </Box>
            </Box>
          );
        })}
      </Box>
      {locatedChip && <Box sx={{ ml: 'auto', flexShrink: 0 }}>{locatedChip}</Box>}
    </Box>
  );

  /** The pin, the name (15 / 800) and the « N jardins » pill of a Full-width city (V3-02, `.city-hd`). */
  const cityHeader = (location: WeatherLocation) => (
    <Box data-weather-city-head sx={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <LocationOnOutlinedIcon aria-hidden sx={{ fontSize: DASHBOARD_WEATHER.placeIcon, color: 'text.secondary', flexShrink: 0 }} />
      <Typography
        component="span"
        data-weather-city-name
        sx={{
          fontSize: DASHBOARD_TYPE.gardenName,
          fontWeight: 800,
          color: 'text.primary',
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {location.name}
      </Typography>
      <Box component="span" data-pill sx={{ ...pillSx, ml: 'auto' }}>
        {t('dashboard.blocks.weather.tabGardens', { count: gardensOn(location.key) })}
      </Box>
    </Box>
  );

  /** The garden names of a Full-width city, in full — they wrap, never an ellipsis (V3-02). */
  const cityGardens = (location: WeatherLocation) => {
    const names = weather.gardens
      .filter((link) => link.locationKey === location.key)
      .map((link) => gardens.find((garden) => garden.id === link.gardenId)?.name)
      .filter((name): name is string => typeof name === 'string');
    return (
      <Typography
        data-weather-city-gardens
        sx={{ fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.4, color: 'text.secondary', overflowWrap: 'anywhere' }}
      >
        {names.join(', ')}
      </Typography>
    );
  };

  /** The four next days of a Full-width column, compact: 26 px rows — the day, its glyph, « max / min ». */
  const compactDays = (location: WeatherLocation) => (
    <Box
      component="ul"
      data-weather-city-days
      sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', listStyle: 'none', m: 0, p: 0 }}
    >
      {location.days.slice(1, 5).map((day) => (
        <Box
          component="li"
          key={day.date}
          data-weather-city-day={day.date}
          sx={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: 26, minWidth: 0 }}
        >
          <Typography
            component="span"
            sx={{ width: 44, flexShrink: 0, fontSize: DASHBOARD_TYPE.secondary, fontWeight: 700, color: 'text.secondary' }}
          >
            {weekdayShort(day.date, i18n.language) ?? day.date}
          </Typography>
          <WeatherGlyph code={day.conditionCode} isDay={true} px={20} label={day.conditionText} />
          <Typography
            component="span"
            sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
          >
            {t('dashboard.blocks.weather.minMax', {
              max: t('dashboard.blocks.weather.degrees', { value: displayTemperature(day.maxTempC, system) }),
              min: t('dashboard.blocks.weather.degrees', { value: displayTemperature(day.minTempC, system) }),
            })}
          </Typography>
        </Box>
      ))}
    </Box>
  );

  /** One column of the Full width (V3-02, `.city`): the header, the gardens, now, the band, the four next days. */
  const cityColumn = (location: WeatherLocation) => {
    const today = location.days[0];
    return (
      <Box
        key={location.key}
        data-weather-city={location.key}
        sx={{ display: 'flex', flexDirection: 'column', gap: '9px', minWidth: 0 }}
      >
        {cityHeader(location)}
        {cityGardens(location)}
        {location.current ? (
          <>
            <Box data-weather-city-now sx={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <WeatherGlyph code={location.current.conditionCode} isDay={location.current.isDay} px={36} />
              <Typography
                component="span"
                data-weather-temperature
                sx={{
                  fontSize: 40,
                  lineHeight: 1,
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'text.primary',
                  flexShrink: 0,
                }}
              >
                {t('dashboard.blocks.weather.degrees', { value: displayTemperature(location.current.tempC, system) })}
              </Typography>
              <Box sx={{ minWidth: 0 }}>
                {location.current.conditionText && (
                  <Typography
                    sx={{
                      fontSize: DASHBOARD_TYPE.secondary,
                      fontWeight: 600,
                      color: 'text.secondary',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {location.current.conditionText}
                  </Typography>
                )}
                {today && (
                  <Typography sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    {t('dashboard.blocks.weather.minMax', {
                      max: t('dashboard.blocks.weather.degrees', { value: displayTemperature(today.maxTempC, system) }),
                      min: t('dashboard.blocks.weather.degrees', { value: displayTemperature(today.minTempC, system) }),
                    })}
                  </Typography>
                )}
              </Box>
            </Box>
            {band(location, true)}
            {compactDays(location)}
          </>
        ) : (
          <Typography data-weather-city-unavailable sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}>
            {t('dashboard.blocks.weather.unavailable')}
          </Typography>
        )}
      </Box>
    );
  };

  /**
   * SMA-448, lot F4 — the Expert's FULL WIDTH (V3-02; contract v3 § 4.6):
   * every city at once. A neutral summary pill « 6 villes · 12 jardins » —
   * not a tab, not a title: the one card without a title row (arbitrage Q1)
   * has no place line that could name several cities. Then one column per
   * city, four per row at most and the next ones on a second row at the same
   * width — the card grows, the Full width has no floor (A-N10) — a 1 px
   * rule between the columns of a row, never before the first; on a phone a
   * vertical list, a rule above each city but the first. One city alone
   * reads in full — the hero, the six slots, the five days, the band, the
   * chips — spread over the width: the width shows MORE, never a void.
   * « Réessayer » once at the foot when a city could not be described.
   */
  const wideBody = (): ReactNode => {
    const summary = (
      <Box data-weather-summary sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
        <Box component="span" data-pill sx={pillSx}>
          {t('dashboard.blocks.weather.summary', {
            cities: t('dashboard.blocks.weather.summaryCities', { count: locations.length }),
            gardens: t('dashboard.blocks.weather.tabGardens', { count: locatedGardens }),
          })}
        </Box>
        {locatedChip && <Box sx={{ ml: 'auto', flexShrink: 0 }}>{locatedChip}</Box>}
      </Box>
    );
    const credit = (
      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Typography component="span" data-weather-units sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {t(`dashboard.blocks.weather.units.${system}`)}
        </Typography>
        {attribution}
      </Box>
    );

    if (locations.length === 1) {
      const location = locations[0]!;
      const today = localDateOf(location);
      const note = staleNote(location);
      return (
        <>
          {summary}
          <Box data-weather-city={location.key} sx={{ display: 'flex', flexDirection: 'column', gap: `${DASHBOARD_SPACING.gap}px`, minWidth: 0 }}>
            {cityHeader(location)}
            {location.current ? (
              <>
                {/* The head every card draws — the hero beside the six slots
                    from 600 px, stacked on a phone — and the five days: on a
                    420 px column beside the head from 900 px, under it on the
                    full width below. The head is its OWN box, as on the
                    Medium card: the hero and the slots take `height: 100%`
                    of it, and in one box with the days — a column at 600 px,
                    or a wrapped row — that percentage read the whole box, and
                    the slots and the days ran out of the card (W5's measure
                    at 600 px). */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    gap: { xs: `${DASHBOARD_WEATHER.stackGap}px`, md: '24px' },
                    alignItems: 'stretch',
                    minWidth: 0,
                  }}
                >
                  <Box
                    data-weather-head
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      gap: { xs: `${DASHBOARD_WEATHER.stackGap}px`, sm: '24px' },
                      flex: { xs: '0 0 auto', md: 1 },
                      minWidth: 0,
                    }}
                  >
                    <WeatherHero location={location} current={location.current} size="large" system={system} place={null} />
                    <WeatherHours hours={upcomingHours(location)} system={system} />
                  </Box>
                  <Box sx={{ width: { xs: '100%', md: 420 }, flexShrink: 0, minWidth: 0, display: 'flex' }}>
                    <WeatherDays days={location.days} today={today} system={system} />
                  </Box>
                </Box>
                {band(location)}
                {divider}
                <WeatherAlerts
                  line={weatherChips(location.days, location.alerts)}
                  today={today}
                  system={system}
                  note={
                    <>
                      {note && subLine(note)}
                      {attribution}
                    </>
                  }
                />
              </>
            ) : (
              <InviteState icon={<WeatherIcon />} message={t('dashboard.blocks.weather.unavailable')} variant="invite" action={retryButton} />
            )}
          </Box>
        </>
      );
    }

    const perRow = { sm: Math.min(locations.length, 2), md: Math.min(locations.length, 4) };
    const anyUnavailable = locations.some((location) => !location.current);
    return (
      <>
        {summary}
        <Box
          data-weather-cities
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: `repeat(${perRow.sm}, minmax(0, 1fr))`,
              md: `repeat(${perRow.md}, minmax(0, 1fr))`,
            },
            gap: { xs: '16px', sm: '20px' },
            // The phone's list: a rule above each city but the first.
            '& > [data-weather-city]:not(:first-of-type)': {
              borderTop: { xs: '1px solid', sm: 'none' },
              borderTopColor: 'borderSubtle',
              pt: { xs: '16px', sm: 0 },
            },
            // A row's columns, a rule between them — never before the first
            // column of a row, or the second row would carry an orphan rule.
            [`& > [data-weather-city]:not(:nth-of-type(${perRow.sm}n+1))`]: {
              borderLeft: { sm: '1px solid', md: 'none' },
              borderLeftColor: 'borderSubtle',
              pl: { sm: '20px', md: 0 },
            },
            [`& > [data-weather-city]:not(:nth-of-type(${perRow.md}n+1))`]: {
              borderLeft: { md: '1px solid' },
              borderLeftColor: 'borderSubtle',
              pl: { md: '20px' },
            },
          }}
        >
          {locations.map(cityColumn)}
        </Box>
        {divider}
        <Box data-weather-foot sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
          {anyUnavailable && retryButton}
          {credit}
        </Box>
      </>
    );
  };

  const body = (): ReactNode => {
    if (loading) {
      return (
        <Box data-weather-skeleton sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Skeleton variant="text" width={90} height={17} />
          <Skeleton variant="rounded" width={150} height={size === 'small' ? DASHBOARD_WEATHER.temperatureSmall : DASHBOARD_WEATHER.temperature} />
          <Skeleton variant="text" width={120} height={16} />
        </Box>
      );
    }

    if (loadError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}>
            {t('dashboard.blocks.weather.loadError')}
          </Typography>
          <Button size="small" onClick={onRetry} disabled={refreshing} sx={{ alignSelf: 'flex-start' }}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      );
    }

    if (locations.length === 0 || !active) {
      if (totalGardens === 0) {
        return (
          <InviteState
            icon={<WeatherIcon />}
            message={t('dashboard.blocks.weather.noGardens')}
            variant="catalogue"
          />
        );
      }
      if (size === 'small') {
        // The Small card has no room for the field: the marker and the gesture
        // that opens the dialog (`_spec.md:126-127`).
        return (
          <Box sx={{ m: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <MissingDataMark label={t('dashboard.blocks.weather.title')} />
            <Button
              variant="outlined"
              size="small"
              startIcon={<LocationOnOutlinedIcon />}
              onClick={() => onLocate(null)}
            >
              {t('dashboard.blocks.weather.addCity')}
            </Button>
          </Box>
        );
      }
      return <WeatherInvite variant="full" missing={missingNames} total={totalGardens} onSaved={onLocated} />;
    }

    // The Full width is the Expert's (A-N11) — every city at once; a single-city
    // formula handed it reads its Large, the most it draws.
    if (size === 'wide' && cities === 'all') return wideBody();

    const content =
      size === 'small' ? smallBody(active) : size === 'medium' ? mediumBody(active) : largeBody(active);

    if (size === 'large' && tabs) {
      return (
        <>
          {tabs}
          <Box
            role="tabpanel"
            id={`${tabId(active.key)}-panel`}
            aria-labelledby={tabId(active.key)}
            sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: `${DASHBOARD_SPACING.gap}px` }}
          >
            {content}
          </Box>
        </>
      );
    }
    return content;
  };

  return (
    <DashboardBlock
      blockKey="weather"
      title={title}
      size={size}
      editing={editing}
      headless
      // Named by its city — or, in the Full width of several cities, by the widget's own name.
      regionLabel={
        !loading && !loadError && active
          ? size === 'wide' && cities === 'all' && locations.length > 1
            ? title
            : active.name
          : title
      }
    >
      {body()}
    </DashboardBlock>
  );
}
