import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import DashboardBlock from '../DashboardBlock';
import InviteState from '../InviteState';
import MissingDataMark from '../MissingDataMark';
import { BLOCK_ICONS } from '../blockIcons';
import WeatherAlerts from './WeatherAlerts';
import WeatherBar from './WeatherBar';
import WeatherDays from './WeatherDays';
import WeatherHero from './WeatherHero';
import WeatherHours from './WeatherHours';
import WeatherInvite from './WeatherInvite';
import WeatherPlace from './WeatherPlace';
import { displayTemperature } from './weatherFormat';
import { gardenerSentence, weatherChips } from './weatherRules';
import { localDateOf, upcomingHours, weekScale } from './weatherTime';
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

interface Props {
  size: DashboardSize;
  editing?: boolean;
  weather: DashboardWeatherData;
  /** The aggregate's gardens — for the names the invitation lists. */
  gardens: DashboardGardenData[];
  loading: boolean;
  loadError: boolean;
  /** A replacement is in flight while the error is still on screen: Retry says so by disabling itself. */
  refreshing?: boolean;
  onRetry: () => void;
  /** Opens the location dialog — on the PROFILE default when `null`. */
  onLocate: (gardenId: string | null) => void;
  /** The widget's own invitation wrote the profile default — the page re-fetches. */
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
 * « jardin suivi » option is deferred); Large shows a tab per place. « Now »
 * is the place's `localTime`; °F and mph follow `useUnitSystem`; the stale note
 * is the one line of the card that reads the browser clock, to say how old the
 * last known weather is.
 */
export default function WeatherBlock({
  size,
  editing,
  weather,
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
  // than to an empty panel.
  const active =
    locations.find((location) => location.key === selectedKey) ?? locations[0] ?? null;

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

  /** The « 1/3 localisé » chip — `.pill.n` on the place line, and a button: it opens the dialog. */
  const locatedChip = partial ? (
    <Box
      component="button"
      type="button"
      data-weather-located
      aria-label={t('dashboard.blocks.weather.locatedAction', {
        located: locatedGardens,
        total: totalGardens,
      })}
      onClick={() => onLocate(null)}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: DASHBOARD_TYPE.chipHeight,
        px: '10px',
        borderRadius: '999px',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: DASHBOARD_TYPE.chip,
        lineHeight: 1,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        backgroundColor: tk.pillBg,
        color: tk.pillText,
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

  /** `.gard` — the gardener's band: full width, `--inv-bg`, radius 12, 11 / 16, 16 px / 600, a 20 px glyph. */
  const band = (location: WeatherLocation) => {
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
          py: `${DASHBOARD_WEATHER.bandPaddingY}px`,
          px: `${DASHBOARD_WEATHER.bandPaddingX}px`,
          fontSize: DASHBOARD_WEATHER.bandText,
          lineHeight: 1.35,
          fontWeight: 600,
          color: 'text.secondary',
          flexShrink: 0,
        }}
      >
        <Icon aria-hidden sx={{ fontSize: DASHBOARD_WEATHER.bandIcon, color: 'primary.main', flexShrink: 0 }} />
        <span>{t(`dashboard.blocks.weather.sentence.${sentence}`)}</span>
      </Box>
    );
  };

  const divider = <Box sx={{ height: DASHBOARD_WEATHER.divider, backgroundColor: 'borderSubtle', flexShrink: 0 }} />;

  /** A place the server could not describe: its line, and an honest statement. */
  const unavailable = (location: WeatherLocation) => (
    <>
      <WeatherPlace name={location.name} trailing={locatedChip} />
      <InviteState
        icon={<WeatherIcon />}
        message={t('dashboard.blocks.weather.unavailable')}
        variant="catalogue"
      />
    </>
  );

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

  /** The head shared by Medium and Large: the hero column beside the six slots. */
  const head = (location: WeatherLocation, fixed: boolean) => (
    <Box
      data-weather-head
      sx={{
        display: 'flex',
        gap: '24px',
        minHeight: 0,
        ...(fixed ? { height: DASHBOARD_WEATHER.largeHead, flex: '0 0 auto' } : { flex: 1 }),
      }}
    >
      <WeatherHero
        location={location}
        current={location.current!}
        size={size}
        system={system}
        trailing={locatedChip}
      />
      <WeatherHours hours={upcomingHours(location)} system={system} />
    </Box>
  );

  const mediumBody = (location: WeatherLocation) => {
    if (!location.current) return unavailable(location);
    const note = staleNote(location);
    return (
      <>
        {head(location, false)}
        {band(location)}
        {note && subLine(note)}
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
              note={note ? subLine(note) : undefined}
            />
          </>
        )}
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

  const tabs = locations.length > 1 && (
    <Box
      role="tablist"
      aria-label={t('dashboard.blocks.weather.places')}
      onKeyDown={onTabKeyDown}
      sx={{ display: 'flex', gap: `${DASHBOARD_WEATHER.tabGap}px`, flexWrap: 'wrap', flexShrink: 0 }}
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
            aria-controls={`${tabId(location.key)}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => setSelectedKey(location.key)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
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
            {count > 1
              ? t('dashboard.blocks.weather.tab', {
                  place: location.name,
                  gardens: t('dashboard.blocks.weather.tabGardens', { count }),
                })
              : location.name}
          </Box>
        );
      })}
    </Box>
  );

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
      regionLabel={!loading && !loadError && active ? active.name : title}
    >
      {body()}
    </DashboardBlock>
  );
}
