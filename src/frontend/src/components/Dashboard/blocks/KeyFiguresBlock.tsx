import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { visuallyHidden } from '@mui/utils';
import DashboardBlock from '../DashboardBlock';
import { KEY_FIGURE_ICONS } from './keyFigureIcons';
import { keyFigureTiles, type KeyFigureTile, type KeyFiguresWeatherStatus } from './keyFigures';
import { KEY_FIGURES_SHOWN, keyFiguresOptions } from './keyFiguresOptions';
import { DASHBOARD_KEY_FIGURES as K, DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { DashboardSize } from '../../../types/Dashboard';
import type { DashboardGardenData, DashboardTotals, DashboardVarietyData } from '../../../types/DashboardData';
import type { DashboardWeatherData } from '../../../types/DashboardWeather';
import type { GardenView } from '../../../utils/gardenStats';

interface Props {
  /** The Full width, its one size (A-N11). */
  size: DashboardSize;
  editing: boolean;
  /** The band's stored options: `{ figures: [...] }`, read through `keyFiguresOptions`. */
  options: Record<string, unknown> | null;
  gardens: DashboardGardenData[];
  /** The page's shared views (`useGardenViews`). */
  views: ReadonlyMap<string, GardenView>;
  varieties: DashboardVarietyData[];
  totals: DashboardTotals;
  weather: DashboardWeatherData;
  weatherStatus: KeyFiguresWeatherStatus;
  /** The transport aggregate — the gardens every figure is computed from. */
  loading: boolean;
  refreshing?: boolean;
  loadError: boolean;
  onRetry: () => void;
  /** « Créer un jardin » — the gesture of the empty band. */
  onCreate: () => void;
}

/**
 * The tiles' grid: four in a row from `md` (900 px), two by two below and on
 * a phone (arbitrage 2 — measured: at 900 px a tile offers ≈ 159 px, room for
 * seven English digits; at 800 px four in a row no longer do).
 *
 * Each tile is a SUBGRID of three rows — label, value, sub-line — spanning
 * three rows of this grid (pre-flight D13): the tiles of one row share their
 * row heights, so a label on two lines (« À faire aujourd'hui » on a phone,
 * three for « Cases libres en plein soleil » at 360 px) never pushes its value
 * below its neighbours' — the defect n° 7 of V3-04, fixed there by a 30 px
 * reserve that no longer covered the longest label; no magic number here.
 */
const tilesGridSx = {
  listStyle: 'none',
  m: 0,
  p: 0,
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
  columnGap: { xs: `${K.gridGapPhone}px`, sm: `${K.gridGap}px` },
  rowGap: { xs: `${K.gridGapPhone}px`, sm: `${K.gridGap}px` },
} as const;

/** One tile — the label, the value and its unit, the sub-line — said in one sentence to a screen reader. */
function Tile({ tile }: { tile: KeyFigureTile }) {
  const Icon = KEY_FIGURE_ICONS[tile.figure];
  return (
    <Box
      component="li"
      data-key-figure={tile.figure}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateRows: 'subgrid',
        gridRow: 'span 3',
        rowGap: `${K.tileGap}px`,
        alignContent: 'start',
        minWidth: 0,
        // A flat patch in the card: no border, no shadow — four bordered
        // cards would read as four widgets (contract § 4.5, [O] 23/09).
        borderRadius: `${K.tileRadius}px`,
        backgroundColor: 'surfaceSubtle',
        p: { xs: K.tilePaddingPhone, sm: K.tilePadding },
      }}
    >
      {/* The tile in one sentence — « Cases libres : 16 426 — où planter la
          suite » (pre-flight C.9) — and the drawing hidden from assistive
          technology, which would otherwise read a capitalised label, a lone
          number and a fragment. */}
      <Box component="span" sx={visuallyHidden}>
        {tile.spoken}
      </Box>
      <Box aria-hidden sx={{ display: 'flex', alignItems: 'flex-start', gap: `${K.iconGap}px`, minWidth: 0 }}>
        <Icon sx={{ fontSize: K.icon, color: 'primary.main', flexShrink: 0, mt: '1px' }} />
        <Typography
          component="span"
          data-key-figure-label
          sx={{
            // Exception 1 of arbitrage 1: 11 px capitals, like the table's
            // column headings. `text.secondary` on `surfaceSubtle`: 5.61:1 by
            // day, 5.33:1 by night (pre-flight C.5) — the mock-up's `--muted`
            // is not a token, and would fall to 4.54:1 at night.
            fontSize: K.label,
            lineHeight: 1.35,
            fontWeight: 800,
            letterSpacing: K.labelLetterSpacing,
            textTransform: 'uppercase',
            color: 'text.secondary',
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {tile.label}
        </Typography>
      </Box>
      <Box
        aria-hidden
        sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: `${K.valueUnitGap}px`, minWidth: 0 }}
      >
        <Typography
          component="span"
          data-key-figure-value
          data-soft={tile.soft || undefined}
          sx={{
            // 28 px from 600 px up; 22 px on a phone (exception 2 of arbitrage
            // 1). A word or a dash in place of a measure — « Aucune », « — »,
            // « Rien » — keeps the size, in 700 and the secondary colour.
            fontSize: { xs: K.valuePhone, sm: K.value },
            lineHeight: 1.1,
            fontWeight: tile.soft ? 700 : 800,
            color: tile.soft ? 'text.secondary' : 'text.primary',
            fontVariantNumeric: 'tabular-nums',
            // Seven digits hold on one line at every width (measured); a
            // figure is never broken between two of its digits.
            whiteSpace: 'nowrap',
          }}
        >
          {tile.value}
        </Typography>
        {tile.unit && (
          <Typography
            component="span"
            data-key-figure-unit
            sx={{ fontSize: K.unit, fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' }}
          >
            {tile.unit}
          </Typography>
        )}
      </Box>
      <Typography
        component="span"
        aria-hidden
        data-key-figure-sub
        sx={{ fontSize: K.sub, lineHeight: 1.4, color: 'text.secondary', minWidth: 0 }}
      >
        {tile.sub}
      </Typography>
    </Box>
  );
}

/**
 * The empty band — no garden yet: never four zeros (R5), but the invitation's
 * form (b), the card with a title, a body and a gesture, decided for the Large
 * and Full-width sizes (contract § 4.8, [A] 23/09 07:39, point 4).
 */
function EmptyBand({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  const tk = useDashboardTokens();
  return (
    <Box
      data-invite-card
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px',
        p: '16px 18px',
        borderRadius: '12px',
        border: `1.5px dashed ${tk.invBd}`,
        backgroundColor: tk.invBg,
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: K.inviteDisc,
          height: K.inviteDisc,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tk.invIcBg,
          color: 'primary.main',
        }}
      >
        <AddIcon sx={{ fontSize: 22 }} />
      </Box>
      <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '5px' }}>
        <Typography component="h3" sx={{ m: 0, fontSize: K.inviteTitle, lineHeight: 1.35, fontWeight: 800 }}>
          {t('dashboard.blocks.keyfigures.empty.title')}
        </Typography>
        <Typography sx={{ fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.5, mb: '5px' }}>
          {t('dashboard.blocks.keyfigures.empty.body')}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={onCreate}
          sx={{ minHeight: 34, fontSize: DASHBOARD_TYPE.secondary, fontWeight: 700 }}
        >
          {t('gardens.createGarden')}
        </Button>
      </Box>
    </Box>
  );
}

/**
 * SMA-437 lot 1, PR B, step B4 — the Key figures band: ONE widget in the Full
 * width, one card, one title, and its four figures as four TILES inside it
 * (contract § 4.5 — [A] 23/09 07:39: « jamais quatre widgets Petit »; the one
 * card is [O]: in Edit mode a widget carries its controls on one edge, and
 * four cards would read as four widgets). Always four, chosen and ordered from
 * the gear (step B5); the Expert's alone, at the head of its preset (B1).
 *
 * Its states (V16): a skeleton while the gardens load, the error with its
 * « Réessayer », the form-(b) invitation without a garden — then the tiles,
 * whose own difficult states (« — », « Aucune », « Rien », « sans la météo »)
 * are decided by `keyFigureTiles`, the one place the band, its catalogue and
 * its gallery thumbnail read.
 */
export default function KeyFiguresBlock({
  size,
  editing,
  options,
  gardens,
  views,
  varieties,
  totals,
  weather,
  weatherStatus,
  loading,
  refreshing = false,
  loadError,
  onRetry,
  onCreate,
}: Props) {
  const { t, i18n } = useTranslation();
  const figures = useMemo(() => keyFiguresOptions(options).figures, [options]);
  // Memoized on what the tiles read: the band re-renders with the page (a
  // drag, a keystroke in a dialog) far more often than its inputs change.
  const tiles = useMemo(
    () =>
      loading || loadError || gardens.length === 0
        ? []
        : keyFigureTiles(figures, { gardens, views, varieties, totals, weather, weatherStatus }, t, i18n.language),
    [loading, loadError, gardens, views, varieties, totals, weather, weatherStatus, figures, t, i18n.language]
  );

  const body = () => {
    if (loading) {
      return (
        <Box sx={tilesGridSx} aria-hidden>
          {Array.from({ length: KEY_FIGURES_SHOWN }, (_, index) => (
            <Skeleton key={index} variant="rounded" height={92} sx={{ borderRadius: `${K.tileRadius}px` }} />
          ))}
        </Box>
      );
    }
    if (loadError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
          <Typography sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}>
            {t('dashboard.blocks.keyfigures.loadError')}
          </Typography>
          <Button size="small" onClick={onRetry} disabled={refreshing}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      );
    }
    if (gardens.length === 0) return <EmptyBand onCreate={onCreate} />;
    return (
      // `role="list"` spelled out: WebKit drops the list semantics of a `ul`
      // drawn without its bullets.
      <Box component="ul" role="list" aria-label={t('dashboard.blocks.keyfigures.list')} sx={tilesGridSx}>
        {tiles.map((tile) => (
          <Tile key={tile.figure} tile={tile} />
        ))}
      </Box>
    );
  };

  return (
    <DashboardBlock
      blockKey="keyfigures"
      title={t('dashboard.blocks.keyfigures.title')}
      size={size}
      editing={editing}
    >
      {body()}
    </DashboardBlock>
  );
}
