import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import type { SvgIconComponent } from '@mui/icons-material';
import BrightnessMediumOutlinedIcon from '@mui/icons-material/BrightnessMediumOutlined';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import DashboardBlock from '../DashboardBlock';
import IconDisc from '../IconDisc';
import InviteState from '../InviteState';
import { BLOCK_ICONS } from '../blockIcons';
import { gardenTypeIcon } from '../gardenTypeIcons';
import { gardenAdvice, type GardenAdvice, type Tip, type TipKind } from './gardenAdvice';
import { nameList } from './weatherFormat';
import { weekdayLong } from './weatherTime';
import { DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { DashboardSize } from '../../../types/Dashboard';
import type { DashboardGardenData, DashboardVarietyData } from '../../../types/DashboardData';
import type { DashboardWeatherData } from '../../../types/DashboardWeather';
import type { GardenView } from '../../../utils/gardenStats';

interface Props {
  size: DashboardSize;
  editing?: boolean;
  gardens: DashboardGardenData[];
  /** The page's one derivation per garden (`useGardenViews`) — the exposure tips read it, never re-derive it. */
  views: ReadonlyMap<string, GardenView>;
  varieties: DashboardVarietyData[];
  weather: DashboardWeatherData;
  /** The GARDENS aggregate is loading — without the plans there is nothing to derive, with or without a forecast. */
  loading: boolean;
  /** The GARDENS aggregate failed. */
  loadError: boolean;
  /**
   * The WEATHER aggregate failed (round 1, S-2 — Extension `3e914892`). NOT
   * blocking: the exposure family reads the plans and the catalog alone, so
   * its tips stand; the block says in one line that the watering family
   * could not be checked, with the « Réessayer » that `onRetry` already
   * carries for it — the ③b « indisponible » pattern of the To-do block.
   * Failure only, not loading: while the forecast loads there is nothing to
   * retry, and a thirsty garden is simply not « checked » yet (T6).
   */
  weatherError?: boolean;
  /** Either aggregate has a request out — the union the « Réessayer » buttons wait on (round 7 of ③b, S33). */
  refreshing?: boolean;
  /**
   * The GARDENS aggregate alone has a request out (round 5, S-8 — GitHub
   * `4055087124`): what the fatal sentence's announcement follows. Defaults
   * to `refreshing` for a caller that does not tell the aggregates apart.
   */
  gardensRefreshing?: boolean;
  /** The WEATHER aggregate alone has a request out: what the weather note's announcement follows. Same default. */
  weatherRefreshing?: boolean;
  onRetry: () => void;
  /** « +N conseils → »: the rest of the list is reached by growing the widget. */
  onExpand: () => void;
}

/**
 * The slots of a Medium card (`_spec.md` § 4 l. 74): « Conseils 2 conseils +
 * « +1 conseil → » (1 seul quand une invitation partage la carte) ». An
 * invitation takes a slot before a tip does — `A4Manquantes.dc.html` l. 327-335
 * draws ONE tip, the orientation invitation, then « +1 conseil → » — so the
 * card never grows past its six lines whatever the account holds.
 */
const MEDIUM_SLOTS = 2;

/**
 * Tips a Large card lists at rest — the frozen design's cap of TEN data rows
 * (`_spec.md` § 4 l. 77-82, verrou 11). Past it, the button below deploys the
 * rest into the same scrolling zone: the ④a pattern (`MonthBlock`, V26) —
 * named, `aria-expanded`, session-only, no transition.
 */
const LARGE_ROWS = 10;

/**
 * The glyph of each kind, matched path-for-path against the artboards
 * (pre-flight § B.0): `WbSunnyOutlined` before « préfèrent le plein soleil »
 * (`Main.dc.html` l. 297), `WaterDropOutlined` before « aime une terre
 * toujours fraîche » (l. 303), `BrightnessMediumOutlined` before « préfèrent
 * la mi-ombre » (`A3Expert.dc.html` l. 329, `_spec.md` § 7 l. 156).
 */
const TIP_ICONS: Record<TipKind, SvgIconComponent> = {
  sunLover: WbSunnyOutlinedIcon,
  shadeLover: BrightnessMediumOutlinedIcon,
  watering: WaterDropOutlinedIcon,
};

/**
 * SMA-336 PR 4b/5 — « Conseils », fed by the plans, the catalog and the
 * forecast through the ONE pure function `gardenAdvice`, which the header chip,
 * the three sizes and the gallery thumbnail all read.
 *
 * Small (`A2Novice.dc.html` l. 316-319): « 3 conseils » in the key-number
 * size, the first tip clamped to three lines (§ 10.12), « Voir la case F3 → »
 * on `margin-top: auto`. Medium (`Main.dc.html` l. 295-309): the chip, two
 * tips — a 34 px disc, the sentence, the link — spread on the height, then
 * « +1 conseil → »; with a garden whose orientation is unknown, one tip, the
 * A4 invitation row and « +1 conseil → ». Large (`A3Expert.dc.html`
 * l. 315-334): grouped by garden — the type glyph, the name, the chip
 * « 2 conseils » — each tip with « Voir la case F3 → » and a « Pourquoi »
 * that unfolds the rule, a 1 px divider between gardens, and « Rien à
 * signaler — vos plantes sont là où elles aiment être. » for a garden that
 * was checked and has nothing to say; a garden whose orientation is unknown
 * has its group too, carrying the A4 invitation in that place (round 1,
 * S-3); every « Pourquoi » folded at rest (`_spec.md` § 4 l. 79).
 *
 * « Voir la case F3 → » opens the garden's planner (arbitrage Q4): the planner
 * reads no cell from the route, so the cell is found by the axes there; the
 * anchoring is SMA-440's.
 *
 * The « Pourquoi » state lives in React for the session and nowhere else —
 * a reading position, not a preference (§ 7).
 */
export default function TipsBlock({
  size,
  editing,
  gardens,
  views,
  varieties,
  weather,
  loading,
  loadError,
  weatherError = false,
  refreshing = false,
  gardensRefreshing = refreshing,
  weatherRefreshing = refreshing,
  onRetry,
  onExpand,
}: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  const TipsIcon = BLOCK_ICONS.tips;
  /** The « Pourquoi » panels open in this session, by tip id. */
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  /** V26 — the Large list deployed past its ten rows. Session-only. */
  const [expanded, setExpanded] = useState(false);
  const idPrefix = useId();

  // ONE derivation for the chip, the lists, the groups and the invitations —
  // per input, not per render (round 1, S-1 — Extension `fc64eee0`): the
  // « Pourquoi » and V26 toggles below change no input of it, and each pass
  // walks every garden and every placement and rebuilds three catalog maps.
  const advice = useMemo(() => gardenAdvice(gardens, views, varieties, weather), [gardens, views, varieties, weather]);
  const { tips, byGarden, gardensWithoutOrientation, unknownExposure } = advice;

  const toggleWhy = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const plannerPath = (gardenId: string) => `/gardens/${gardenId}/planner`;

  const others = (count: number) => t('dashboard.blocks.weather.others', { count });

  /** The sentence of a tip — the artboards' own, with the variety, the cell and the garden. */
  const sentence = (tip: Tip): string => {
    const shared = { cell: tip.cell, garden: tip.gardenName };
    switch (tip.kind) {
      case 'sunLover':
        return t('dashboard.blocks.tips.sunLover', {
          ...shared,
          plant: tip.names[0],
          when: t(`dashboard.blocks.tips.shadedAt.${tip.shadedAt}`),
        });
      case 'shadeLover':
        return t('dashboard.blocks.tips.shadeLover', { ...shared, plant: tip.names[0] });
      case 'watering': {
        const plants = nameList(tip.names, i18n.language, others);
        const text =
          tip.nextRainDay === null
            ? t('dashboard.blocks.tips.wateringNoRain', { ...shared, plants, count: tip.names.length })
            : t('dashboard.blocks.tips.watering', {
                ...shared,
                plants,
                count: tip.names.length,
                day: weekdayLong(tip.nextRainDay, i18n.language) ?? tip.nextRainDay,
              });
        return tip.stale ? t('dashboard.blocks.tips.stale', { tip: text }) : text;
      }
    }
  };

  /** The « Pourquoi » — the rule and the measure, in one sentence. */
  const why = (tip: Tip): string => {
    switch (tip.kind) {
      case 'sunLover':
        return t('dashboard.blocks.tips.whySunLover', {
          hours: tip.sunlightHoursMin,
          cell: tip.cell,
          when: t(`dashboard.blocks.tips.shadedAt.${tip.shadedAt}`),
          exposure: t(`dashboard.exposure.short.${tip.category}`),
        });
      case 'shadeLover':
        return t('dashboard.blocks.tips.whyShadeLover', {
          min: tip.sunlightHoursMin,
          max: tip.sunlightHoursMax,
          cell: tip.cell,
          exposure: t(`dashboard.exposure.short.${tip.category}`),
        });
      case 'watering':
        return t('dashboard.blocks.tips.whyWatering', {
          place: tip.placeName,
          days: t('dashboard.blocks.tips.dryDays', { count: tip.dryDays }),
          rain:
            tip.nextRainDay === null
              ? t('dashboard.blocks.tips.noRainKnown')
              : t('dashboard.blocks.tips.firstRain', {
                  day: weekdayLong(tip.nextRainDay, i18n.language) ?? tip.nextRainDay,
                }),
        });
    }
  };

  /** `.lnk` « Voir la case F3 → » — a link to the garden's planner (Q4). */
  const seeCell = (tip: Tip) => (
    <Link
      component={RouterLink}
      to={plannerPath(tip.gardenId)}
      data-tips-see-cell={tip.cell}
      underline="hover"
      sx={{ fontSize: DASHBOARD_TYPE.link, fontWeight: 700, whiteSpace: 'nowrap' }}
    >
      {t('dashboard.blocks.tips.seeCell', { cell: tip.cell })}
    </Link>
  );

  /**
   * One tip: the 34 px disc, then the sentence and its line of links —
   * `Main.dc.html` l. 296-301 (`gap: 12px; align-items: flex-start`, the
   * column `gap: 4px`, the link row `gap: 16px`). With `withWhy`, the
   * « Pourquoi » of the Large card (`A3Expert.dc.html` l. 320): 15 px / 700 in
   * the secondary colour, an 18 px chevron, unfolding the rule beneath.
   */
  const row = (tip: Tip, withWhy: boolean) => {
    const Icon = TIP_ICONS[tip.kind];
    const text = sentence(tip);
    const isOpen = open.has(tip.id);
    const sentenceId = `${idPrefix}-${tip.id}-s`;
    const panelId = `${idPrefix}-${tip.id}-w`;
    return (
      <Box
        component="li"
        key={tip.id}
        data-tips-tip={tip.kind}
        data-tips-stale={tip.kind === 'watering' && tip.stale ? '' : undefined}
        sx={{ display: 'flex', gap: '12px', alignItems: 'flex-start', minWidth: 0 }}
      >
        <IconDisc size={34} iconSize={18}>
          <Icon />
        </IconDisc>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Typography
            id={sentenceId}
            sx={{ fontSize: DASHBOARD_TYPE.body, lineHeight: 1.45, color: 'text.secondary' }}
          >
            {text}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {seeCell(tip)}
            {withWhy && (
              <Button
                data-tips-why
                variant="text"
                size="small"
                onClick={() => toggleWhy(tip.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-describedby={sentenceId}
                endIcon={
                  <ExpandMoreIcon
                    sx={{
                      // The chevron turns with the panel; no transition is
                      // attached, so there is nothing for
                      // `prefers-reduced-motion` to neutralise (the V26 rule).
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                    }}
                  />
                }
                sx={{
                  p: 0,
                  minWidth: 0,
                  fontSize: DASHBOARD_TYPE.link,
                  fontWeight: 700,
                  color: 'text.secondary',
                  textTransform: 'none',
                  '& .MuiButton-endIcon': { ml: '5px', '& .MuiSvgIcon-root': { fontSize: 18 } },
                }}
              >
                {t('dashboard.blocks.tips.why')}
              </Button>
            )}
          </Box>
          {withWhy && (
            /* Always in the tree, `hidden` when folded, so `aria-controls`
               names an element that exists — and no animation to suppress. */
            <Typography
              id={panelId}
              data-tips-why-panel
              hidden={!isOpen}
              sx={{ fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.45, color: 'text.secondary' }}
            >
              {why(tip)}
            </Typography>
          )}
        </Box>
      </Box>
    );
  };

  /**
   * « Sans l'orientation de « Balcon sud », impossible de comparer
   * l'exposition — Configurer le jardin → » (`A4Manquantes.dc.html` l. 333):
   * `.inv` with `align-items: center; padding: 10px 14px`, a 30 px disc and a
   * 17 px `HelpOutline`, the link inline in the sentence. The link opens the
   * garden's planner, where the configuration dialog lives (pre-flight
   * § B.1.5: no route opens the dialog itself). In the Medium card it takes
   * a slot in the flow; in the Large card it sits in its garden's group.
   */
  const invitation = (garden: DashboardGardenData) => (
    <Box
      key={garden.id}
      data-tips-invite={garden.id}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        p: '10px 14px',
        borderRadius: '12px',
        backgroundColor: tk.invBg,
        border: `1.5px dashed ${tk.invBd}`,
        flexShrink: 0,
      }}
    >
      <IconDisc size={30} iconSize={17}>
        <HelpOutlineIcon />
      </IconDisc>
      <Typography
        component="div"
        sx={{ flex: 1, minWidth: 0, fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.5, color: 'text.secondary' }}
      >
        {t('dashboard.blocks.tips.noOrientation', { garden: garden.name })}
        <Link
          component={RouterLink}
          to={plannerPath(garden.id)}
          underline="hover"
          sx={{ fontSize: DASHBOARD_TYPE.link, fontWeight: 700, whiteSpace: 'normal' }}
        >
          {t('dashboard.blocks.tips.configure')}
        </Link>
      </Typography>
    </Box>
  );

  /** « N plantes sans exposition connue » — a `.sub` foot, counted (D2), no gesture: the Library cannot take that datum. */
  const unknownFoot = unknownExposure > 0 && (
    <Typography
      data-tips-unknown
      sx={{
        mt: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: DASHBOARD_TYPE.secondary,
        lineHeight: 1.45,
        color: 'text.secondary',
        flexShrink: 0,
      }}
    >
      <InfoOutlinedIcon aria-hidden sx={{ fontSize: 16, flexShrink: 0 }} />
      {t('dashboard.blocks.tips.unknownExposure', { count: unknownExposure })}
    </Typography>
  );

  /**
   * « Météo indisponible — les conseils d'arrosage ne peuvent pas être
   * vérifiés pour l'instant. Réessayer » (round 1, S-2): said ONCE, beside
   * the tips the plans alone give, with the retry the fatal branch alone
   * used to reach. Medium and Large; the Small card has no line for it and
   * its empty sentence already says the watering was not assessed.
   */
  const weatherNote = weatherError && (
    <Box
      data-tips-weather-note
      sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px', flexShrink: 0 }}
    >
      <Typography sx={{ fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.5, color: 'text.secondary' }}>
        {t('dashboard.blocks.tips.weatherUnavailable')}
      </Typography>
      <Button
        data-tips-weather-retry
        size="small"
        onClick={onRetry}
        disabled={refreshing}
        sx={{ p: 0, minWidth: 0, fontSize: DASHBOARD_TYPE.secondary, fontWeight: 700, textTransform: 'none' }}
      >
        {t('dashboard.retry')}
      </Button>
    </Box>
  );

  /**
   * What the block says when it has NO tip. « Rien à signaler » is a STATEMENT
   * and may only be made when at least one garden was checked (T6); with no
   * garden checked it says so instead — an unknown is not a zero — and with
   * no plant placed at all it says that.
   */
  const emptyMessage = (): string => {
    if (byGarden.length === 0) return t('dashboard.blocks.tips.empty');
    return byGarden.some((entry) => entry.evaluated)
      ? t('dashboard.blocks.tips.nothing')
      : t('dashboard.blocks.tips.unknownYet');
  };

  const nothing = (
    <InviteState
      icon={byGarden.some((entry) => entry.evaluated) ? <CheckBoxOutlinedIcon /> : <TipsIcon />}
      message={emptyMessage()}
      variant="catalogue"
    />
  );

  const moreButton = (rest: number) =>
    rest > 0 && (
      <Button
        data-tips-more
        variant="text"
        onClick={onExpand}
        sx={{ alignSelf: 'flex-start', mt: 'auto', p: 0, minWidth: 0, fontSize: DASHBOARD_TYPE.link, fontWeight: 700, textTransform: 'none' }}
      >
        {t('dashboard.blocks.tips.more', { count: rest })}
      </Button>
    );

  const smallBody = () => {
    const first = tips[0];
    if (!first) {
      return (
        <Typography data-tips-nothing sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary', m: 'auto 0' }}>
          {emptyMessage()}
        </Typography>
      );
    }
    return (
      <>
        {/* `.big` — « 3 conseils » (`A2Novice.dc.html` l. 317). */}
        <Typography
          data-tips-count
          sx={{ fontSize: DASHBOARD_TYPE.big, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}
        >
          {t('dashboard.blocks.tips.count', { count: tips.length })}
        </Typography>
        {/* The first tip, three lines at most (§ 10.12). */}
        <Typography
          data-tips-first
          sx={{
            flex: 1,
            minHeight: 0,
            fontSize: DASHBOARD_TYPE.body,
            lineHeight: 1.45,
            color: 'text.secondary',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {sentence(first)}
        </Typography>
        <Box sx={{ mt: 'auto' }}>{seeCell(first)}</Box>
      </>
    );
  };

  /**
   * Medium — two slots, a tip or an invitation each (`Main.dc.html`,
   * `A4Manquantes.dc.html`); the invitation takes its slot in the flow.
   *
   * TRUTH BEFORE FILLING (round 4, S-7 — GitHub `4054339776`): with no tip
   * and a garden whose orientation is unknown, the empty panel used to be
   * drawn ABOVE the invitation — « Rien à signaler — vos plantes sont là où
   * elles aiment être » beside a garden whose plants were NOT checked, which
   * is false — in a one-row card whose `overflow: hidden` then clipped the
   * invitation (measured in a real engine: on a phone the 109 px invitation
   * lost 91.5 px alone and 70.5 px beside a checked garden; on a desktop the
   * second of two lost 52.5 of its 65.5 px). When an invitation is drawn the
   * panel yields: the invitation alone says what there is to say, as in
   * Large where each group carries its own verdict (S-3). The panel stays
   * when nothing else is drawn — the early return below — where « rien à
   * signaler » is only said of gardens that were checked (T6).
   */
  const mediumBody = () => {
    const invites = gardensWithoutOrientation.slice(0, MEDIUM_SLOTS);
    const shown = tips.slice(0, Math.max(0, MEDIUM_SLOTS - invites.length));
    const rest = tips.length - shown.length;
    if (tips.length === 0 && invites.length === 0) {
      return (
        <>
          {nothing}
          {weatherNote}
          {unknownFoot}
        </>
      );
    }
    return (
      <>
        {shown.length > 0 && (
          <Box
            component="ul"
            sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', gap: '8px', listStyle: 'none', m: 0, p: 0 }}
          >
            {shown.map((tip) => row(tip, false))}
          </Box>
        )}
        {invites.map(invitation)}
        {weatherNote}
        {unknownFoot}
        {moreButton(rest)}
      </>
    );
  };

  /**
   * The Large groups — « Terrasse · 2 conseils », « Potager du fond · rien à
   * signaler » (`A3Expert.dc.html` l. 316-334): the type glyph at 17 px in the
   * primary colour, `.gname` 15 px / 700, the chip; the tips in a column with
   * 14 px between them; a 1 px divider between gardens.
   *
   * A group holds, in this order: the garden's tips; the A4 invitation when
   * the garden's orientation is unknown — IN its garden's group, where « rien
   * à signaler » would go, never under the scrolling zone (round 1, S-3 —
   * GitHub `4035502545`, arbitrated: outside the zone, with `flexShrink: 0`,
   * three invitations shrank the zone to 0 px on a phone and the tips went
   * unseen); « Rien à signaler » when the garden was checked and has nothing
   * to say (T6). The chip counts the tips, says « rien à signaler » for a
   * checked garden, and is absent when nothing was checked — a verdict the
   * widget cannot state.
   */
  const group = (entry: GardenAdvice, own: Tip[], unoriented: boolean, last: boolean) => {
    const TypeIcon = gardenTypeIcon(entry.garden.config.gardenType);
    const clear = entry.tips.length === 0 && entry.evaluated;
    const chipLabel =
      entry.tips.length > 0
        ? t('dashboard.blocks.tips.count', { count: entry.tips.length })
        : clear
          ? t('dashboard.blocks.tips.nothingChip')
          : null;
    return (
      <Box
        component="section"
        key={entry.garden.id}
        data-tips-group={entry.garden.id}
        aria-label={entry.garden.name}
        sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <TypeIcon aria-hidden sx={{ fontSize: 17, color: 'primary.main', flexShrink: 0 }} />
          <Typography
            component="h3"
            sx={{ fontSize: DASHBOARD_TYPE.gardenName, fontWeight: 700, lineHeight: 1.25, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {entry.garden.name}
          </Typography>
          {chipLabel !== null && (
            <Chip
              data-tips-group-chip
              label={chipLabel}
              size="small"
              sx={{ height: DASHBOARD_TYPE.chipHeight, fontSize: DASHBOARD_TYPE.chip, fontWeight: 700, backgroundColor: tk.pillBg, color: tk.pillText, flexShrink: 0 }}
            />
          )}
        </Box>
        {own.length > 0 && (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {own.map((tip) => row(tip, true))}
          </Box>
        )}
        {unoriented && invitation(entry.garden)}
        {clear && (
          <Typography
            data-tips-nothing={entry.garden.id}
            sx={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: DASHBOARD_TYPE.body, lineHeight: 1.45, color: 'text.secondary' }}
          >
            <CheckBoxOutlinedIcon aria-hidden sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
            {t('dashboard.blocks.tips.nothing')}
          </Typography>
        )}
        {!last && <Box aria-hidden sx={{ height: '1px', backgroundColor: 'borderSubtle', mt: '4px' }} />}
      </Box>
    );
  };

  const largeBody = () => {
    const shown = expanded ? tips : tips.slice(0, LARGE_ROWS);
    // Counted on the CAP, not on what is drawn, so the label does not change
    // under the reader's hand (the V26 rule).
    const rest = Math.max(0, tips.length - LARGE_ROWS);
    const shownIds = new Set(shown.map((tip) => tip.id));
    const unorientedIds = new Set(gardensWithoutOrientation.map((garden) => garden.id));
    // Every garden the widget has something to say about has its group, in
    // the gardens' order: one with tips shows the ones within the cap; one
    // whose orientation is unknown carries its invitation; one that was
    // checked and has none says « rien à signaler ». A garden that could not
    // be checked for another reason says nothing here (T6, Q7) — its reason
    // is drawn elsewhere.
    const groups = byGarden
      .map((entry) => ({
        entry,
        own: entry.tips.filter((tip) => shownIds.has(tip.id)),
        unoriented: unorientedIds.has(entry.garden.id),
      }))
      .filter(({ entry, own, unoriented }) => own.length > 0 || unoriented || (entry.tips.length === 0 && entry.evaluated));
    const groupsId = `${idPrefix}-groups`;
    if (groups.length === 0) {
      return (
        <>
          {nothing}
          {weatherNote}
          {unknownFoot}
        </>
      );
    }
    return (
      <>
        {/* COMPACT, at the top, and its own scroll when the card is too short
            (the O2 / V26 rules): the foot and the button below stay put. The
            invitations scroll WITH the groups they belong to (round 1, S-3):
            drawn under the zone with `flexShrink: 0`, three of them left it
            0 px on a phone and 13 px on a desktop with six — the tips were
            not clipped, they were gone. */}
        <Box
          id={groupsId}
          data-tips-groups
          sx={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          {groups.map(({ entry, own, unoriented }, index) => group(entry, own, unoriented, index === groups.length - 1))}
        </Box>
        {weatherNote}
        {unknownFoot}
        {rest > 0 && (
          <Button
            data-tips-more-tips
            variant="text"
            size="small"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-controls={groupsId}
            sx={{ alignSelf: 'flex-start', p: 0, minWidth: 0, fontSize: DASHBOARD_TYPE.secondary, fontWeight: 700, textTransform: 'none', flexShrink: 0 }}
          >
            {expanded ? t('dashboard.blocks.tips.collapse') : t('dashboard.blocks.tips.moreTips', { count: rest })}
          </Button>
        )}
      </>
    );
  };

  const body = (): ReactNode => {
    if (loading) {
      return (
        <Box data-tips-skeleton sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={34} />
          ))}
        </Box>
      );
    }
    if (loadError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}>
            {t('dashboard.blocks.tips.loadError')}
          </Typography>
          <Button size="small" onClick={onRetry} disabled={refreshing} sx={{ alignSelf: 'flex-start' }}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      );
    }
    if (size === 'small') return smallBody();
    if (size === 'medium') return mediumBody();
    return largeBody();
  };

  /**
   * `.pill.n.num` « 3 conseils » — the chip and the list read the same count.
   * Medium and Large only: the Small card's header carries no chip
   * (`A2Novice.dc.html` l. 316, a bare `.hd`) — its `.big` line says the count.
   */
  const chip = size !== 'small' && !loading && !loadError && tips.length > 0 && (
    <Chip
      data-tips-chip
      label={t('dashboard.blocks.tips.count', { count: tips.length })}
      size="small"
      sx={{
        height: DASHBOARD_TYPE.chipHeight,
        fontSize: DASHBOARD_TYPE.chip,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        backgroundColor: tk.pillBg,
        color: tk.pillText,
      }}
    />
  );

  /**
   * What the card ANNOUNCES to assistive technology (round 2, S-4 —
   * Extension `95084e7e` / `fc363e9a`): the sentence a state change puts on
   * screen — « Impossible de charger les conseils. » when the plans fail,
   * « Météo indisponible — … » when the forecast fails while the plans stand
   * — through a live region that exists from the FIRST render, empty: the
   * `WeatherInvite` recipe (round 1 of ③b, E7), `role="status"`,
   * `aria-live="polite"`, off-screen through `visuallyHidden`. A region
   * inserted together with its text is read unreliably, which is why the
   * attributes do not sit on the visible sentences themselves (they are
   * born with their text); one that is already there and whose text changes
   * is read once, politely — and an empty first render announces nothing.
   * The text is the sentence the reader sees, where it is drawn: nothing
   * while the card loads, nothing for the weather note on a Small card,
   * which does not draw it.
   *
   * Round 3, S-5 (GitHub `4052436613`): the text is written by an EFFECT,
   * into the DOM, never by the render that creates the region. Rendered as
   * a child, it was born WITH the region when the card mounted in a failed
   * state — the page's grid mounts once the preferences land, a widget
   * shown again is remounted — the very case the recipe calls unreliable;
   * and a « Réessayer » that failed again left the text as it was, so the
   * second failure was never said. Here the region is inserted with NO text
   * node, by construction; the effect below writes the sentence after the
   * commit that inserted it, empties it while a retry is out (a removal,
   * which is not announced) and writes it again when the retry fails — one
   * DOM write per change, guarded by `textContent !== next`, so nothing is
   * said twice for one change. An ASSUMED departure from the `WeatherInvite`
   * recipe, where React renders the text: the same through a local state —
   * `setState` in the effect, the form G-3 proposed — is an ERROR under this
   * project's `react-hooks/set-state-in-effect`, and writing the DOM is the
   * use that rule names as the effect's own. No timer, no promise: one
   * effect, two dependencies.
   */
  const announced = loading
    ? ''
    : loadError
      ? t('dashboard.blocks.tips.loadError')
      : weatherError && size !== 'small'
        ? t('dashboard.blocks.tips.weatherUnavailable')
        : '';
  // Round 5, S-8 (GitHub `4055087124`): each announced sentence follows the
  // ONE flag of its own aggregate — the fatal sentence the gardens', the
  // weather note the weather's — so a refresh of the OTHER aggregate neither
  // empties nor re-announces it; `refreshing`, the union, keeps the buttons.
  const announcedRefreshing = loadError ? gardensRefreshing : weatherRefreshing;
  const statusRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = statusRef.current;
    const next = announcedRefreshing ? '' : announced;
    if (node && node.textContent !== next) node.textContent = next;
  }, [announced, announcedRefreshing]);

  return (
    <DashboardBlock
      blockKey="tips"
      title={t('dashboard.blocks.tips.title')}
      size={size}
      editing={editing}
      chip={chip || undefined}
    >
      {/* Out of the flow (`position: absolute`): no gap of the column is spent on it. No child: its text is the effect's, above. */}
      <Typography ref={statusRef} role="status" aria-live="polite" data-tips-status sx={visuallyHidden} />
      {body()}
    </DashboardBlock>
  );
}
