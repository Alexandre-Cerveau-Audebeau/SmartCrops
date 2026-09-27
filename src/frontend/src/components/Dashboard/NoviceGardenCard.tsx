import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FilterVintageOutlinedIcon from '@mui/icons-material/FilterVintageOutlined';
import GardenActions from './GardenActions';
import GardenThumbnail from './GardenThumbnail';
import MissingDataMark from './MissingDataMark';
import { GARDEN_TYPE_ICONS } from './gardenTypeIcons';
import { TASK_ICONS } from './blocks/todoIcons';
import { todoSentence } from './blocks/todoSentence';
import WeatherGlyph from './blocks/WeatherGlyph';
import { displayTemperature } from './blocks/weatherFormat';
import type { NoviceCard } from './noviceCards';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import { DASHBOARD_NOVICE, DASHBOARD_TYPE, DASHBOARD_WEATHER } from '../../theme/dashboardTokens';
import { useDashboardTokens } from '../../theme/useDashboardTokens';
import type { DashboardGardenData } from '../../types/DashboardData';
import { formatRelativeDate } from '../../utils/formatRelativeDate';

interface Props {
  card: NoviceCard;
  /** The pencil: the rename dialog on this garden. */
  onRename: (garden: DashboardGardenData) => void;
  /** The bin: the type-the-name deletion of this garden. */
  onDelete: (garden: DashboardGardenData) => void;
  /** « Ajouter une ville », or the temperature chip: the location dialog on this garden. */
  onLocate: (gardenId: string) => void;
}

/** The focus ring of the card's own controls — the one the MÉTÉO cell's button draws. */
const FOCUS_RING = {
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
} as const;

/**
 * SMA-448, lot F2 (SMA-436) — one card of the Novice page, as V3-00 draws it
 * (variant B, Alexandre 22/09 16:39; contract v3 § 4.3), top to bottom: the
 * plan in a 58 px band; the name, 17 px / 800, with the pencil and the bin at
 * its right (V21); the chips — type · size, « N plantes », « Ornemental »;
 * the plants; the task of the day on its tinted band, which WRAPS, never an
 * ellipsis (22/09 16:17); the foot — the weather of the garden's own city, or
 * the dashed « Ajouter une ville », then « modifié il y a 2 h », then the
 * chevron.
 *
 * The name is the ONE link of the card a keyboard reaches; the chevron
 * repeats it for the pointer and is hidden from assistive technology, as on
 * the Medium row of the Gardens widget (a second tab stop to the same place
 * would be noise). The card is not a link as a whole: it holds buttons, and a
 * button inside an anchor is invalid content.
 *
 * What the card says comes from `noviceCards.ts`, derived once for the page:
 * the weather warning under the cards reads the same derivation (V1).
 */
export default function NoviceGardenCard({ card, onRename, onDelete, onLocate }: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  // °C or °F follow the product's one global toggle (V28).
  const { system } = useUnitSystem();
  const { garden, view, plants, task, weather } = card;
  const plannerPath = `/gardens/${garden.id}/planner`;

  // « Terrasse · 10 × 8 · 50 cm »: the type when the garden has one, its
  // size when it has a plan — the cell size only when it is one the product
  // names (the server keeps no list of them; an unknown value is not printed
  // as a key).
  const typeLabel = garden.config.gardenType ? t(`planner.config.type.${garden.config.gardenType}`) : null;
  const TypeIcon = garden.config.gardenType ? GARDEN_TYPE_ICONS[garden.config.gardenType] : undefined;
  const cellKey = garden.cellSize ? `planner.templates.cellSizes.${garden.cellSize}` : null;
  const sizeLabel =
    view?.hasPlan && garden.width && garden.height
      ? cellKey && i18n.exists(cellKey)
        ? t('dashboard.novice.size', { cols: garden.width, rows: garden.height, cell: t(cellKey) })
        : t('dashboard.blocks.gardens.dimensions', { cols: garden.width, rows: garden.height })
      : null;
  const typeChip =
    typeLabel && sizeLabel
      ? t('dashboard.novice.typeSize', { type: typeLabel, size: sizeLabel })
      : (typeLabel ?? sizeLabel);

  // The plants, four then « +N » — in the plan's order, as `noviceCards` lists them.
  const shownPlants = plants.slice(0, DASHBOARD_NOVICE.plantsShown);
  const morePlants = plants.length - shownPlants.length;
  const plantsLine =
    morePlants > 0
      ? t('dashboard.novice.plantsMore', { names: shownPlants.join(', '), count: morePlants })
      : shownPlants.join(', ');

  // « Modifié il y a 2 h » — or the mark when the wire value is not an
  // instant, never « now » (the Gardens widget's rule, round 8).
  const instant = Date.parse(garden.updatedAt);
  const modified = Number.isFinite(instant)
    ? t('dashboard.blocks.gardens.lastModified', {
        when: formatRelativeDate(new Date(garden.updatedAt), new Date(), i18n.language, 'short'),
      })
    : null;

  const TaskIcon = task ? TASK_ICONS[task.kind] : null;

  /** The weather pill — `.pill.wx` of the artboards: `warnBg` / `warnText`, a 14 px glyph. */
  const pillSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: DASHBOARD_TYPE.chipHeight,
    px: '10px',
    borderRadius: '999px',
    fontFamily: 'inherit',
    fontSize: DASHBOARD_TYPE.chip,
    lineHeight: 1,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    border: 0,
    m: 0,
    cursor: 'pointer',
    ...FOCUS_RING,
  } as const;

  /** The foot's weather: the figure, the place without one, the invitation, the failure, the wait. */
  const weatherFoot = () => {
    switch (weather.kind) {
      case 'loading':
        return (
          <Skeleton
            data-novice-weather-loading
            variant="rounded"
            width={88}
            height={DASHBOARD_TYPE.chipHeight}
          />
        );
      case 'unavailable':
        // The aggregate could not be read: the same words as the MÉTÉO column,
        // and never a figure kept from before (A-4).
        return (
          <Box component="span" data-novice-weather-unavailable>
            <MissingDataMark label={t('dashboard.blocks.weather.cellUnavailable')} />
          </Box>
        );
      case 'unlocated':
        // The dashed marker of the artboards (`.pill.miss`), a button: the
        // location dialog on THIS garden, named for a screen reader since
        // three cards may carry it.
        return (
          <Box
            component="button"
            type="button"
            data-novice-weather-add
            onClick={() => onLocate(garden.id)}
            aria-label={t('dashboard.blocks.weather.cellAddNamed', { name: garden.name })}
            sx={{
              ...pillSx,
              border: `1.5px dashed ${tk.invBd}`,
              backgroundColor: tk.invBg,
              color: 'primary.main',
            }}
          >
            <AddLocationAltOutlinedIcon sx={{ fontSize: DASHBOARD_WEATHER.cellIcon }} />
            {t('dashboard.blocks.weather.addCity')}
          </Box>
        );
      case 'silent':
        // Located, but the provider had nothing to say: the place and a dash
        // where the temperature would be — never an invented figure. The dash
        // is for the eye; assistive technology hears « Sans météo ».
        return (
          <Box
            component="button"
            type="button"
            data-novice-weather-silent
            onClick={() => onLocate(garden.id)}
            aria-label={t('dashboard.blocks.weather.cellEditNamed', { name: garden.name })}
            sx={{ ...pillSx, backgroundColor: tk.pillBg, color: tk.pillText }}
          >
            <Box component="span" aria-hidden sx={{ color: 'text.disabled' }}>
              —
            </Box>
            <Box component="span" sx={visuallyHidden}>
              {t('dashboard.blocks.weather.cellUnavailable')}
            </Box>
            {weather.place.name}
          </Box>
        );
      case 'figure':
        // « 24° · Lyon » (V3-02): the temperature of the moment at the
        // garden's own city — and the door to that city, as the MÉTÉO cell is
        // (V21 c): the Novice has no Weather widget to reach the dialog from.
        return (
          <Box
            component="button"
            type="button"
            data-novice-weather
            onClick={() => onLocate(garden.id)}
            aria-label={t('dashboard.blocks.weather.cellEditNamed', { name: garden.name })}
            sx={{ ...pillSx, backgroundColor: tk.warnBg, color: tk.warnText }}
          >
            <WeatherGlyph
              code={weather.current.conditionCode}
              isDay={weather.current.isDay}
              px={DASHBOARD_WEATHER.cellIcon}
            />
            {t('dashboard.novice.weather', {
              temperature: t('dashboard.blocks.weather.degrees', {
                value: displayTemperature(weather.current.tempC, system),
              }),
              place: weather.place.name,
            })}
          </Box>
        );
    }
  };

  return (
    <Card
      variant="outlined"
      data-novice-card={garden.id}
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        borderColor: 'borderSubtle',
        overflow: 'hidden',
      }}
    >
      {/* The plan in a band — 58 px, 6 px of padding, a rule under it
          (contract § 4.3, 1). The plan FILLS its slot from edge to edge
          (V3-00 B: `.gcard-band .thumb { width: 100%; height: 100% }` —
          Alexandre, 27/09: « elle touche tous les bords de son emplacement »),
          its ratio kept and the rest cropped, centred — `object-fit: cover`,
          not the mock-up's stretch, which would draw a false plan. The slot
          is the band less its 6 px, as the mock-up keeps them. The frame is
          `data-crop` for the layout harness: what it cuts of the plan is the
          design, and its own measure asserts the plan covers it. A garden
          without a plan says so, in words. */}
      <Box
        data-novice-band
        sx={{
          height: DASHBOARD_NOVICE.band,
          p: `${DASHBOARD_NOVICE.bandPadding}px`,
          backgroundColor: tk.noviceBandBg,
          borderBottom: '1px solid',
          borderColor: 'borderSubtle',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {view?.hasPlan ? (
          <Box
            data-novice-plan
            data-crop
            sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: '6px' }}
          >
            <GardenThumbnail garden={garden} fit="cover" />
          </Box>
        ) : (
          <MissingDataMark label={t('dashboard.blocks.gardens.noPlan')} />
        )}
      </Box>

      <Box
        sx={{
          p: DASHBOARD_NOVICE.bodyPadding,
          display: 'flex',
          flexDirection: 'column',
          gap: `${DASHBOARD_NOVICE.bodyGap}px`,
          minWidth: 0,
          // The body takes the height left over, so the feet of the cards of
          // one row align whatever the number of chips or lines above them.
          flex: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: `${DASHBOARD_NOVICE.nameGap}px`, minWidth: 0 }}>
          {/* 17 px / 800, one line with an ellipsis (SMA-436 — the one
              ellipsis of the card a source allows, V5). The heading IS the
              link: the card names its garden and opens it in one place. */}
          <Typography
            component="h2"
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: DASHBOARD_TYPE.noviceGardenName,
              fontWeight: 800,
              lineHeight: 1.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <Box
              component={RouterLink}
              to={plannerPath}
              sx={{
                color: 'inherit',
                textDecoration: 'none',
                borderRadius: '4px',
                '&:hover': { textDecoration: 'underline', textUnderlineOffset: '3px' },
                ...FOCUS_RING,
              }}
            >
              {garden.name}
            </Box>
          </Typography>
          <GardenActions garden={garden} onRename={onRename} onDelete={onDelete} />
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: `${DASHBOARD_NOVICE.chipGap}px`, alignItems: 'center' }}>
          {typeChip && (
            <Chip
              label={typeChip}
              size="small"
              variant="outlined"
              icon={TypeIcon ? <TypeIcon /> : undefined}
              sx={{
                height: DASHBOARD_TYPE.chipHeight,
                fontSize: DASHBOARD_TYPE.chip,
                borderColor: tk.chipBorder,
                '& .MuiChip-icon': { color: 'primary.main', fontSize: 14, ml: '8px', mr: '-2px' },
              }}
            />
          )}
          <Chip
            data-novice-count
            label={t('gardens.plantsCount', { count: garden.placementCount })}
            size="small"
            sx={{
              height: DASHBOARD_TYPE.chipHeight,
              fontSize: DASHBOARD_TYPE.chip,
              fontWeight: 700,
              backgroundColor: tk.okBg,
              color: tk.okText,
            }}
          />
          {garden.isEdible === false && (
            <Chip
              label={t('dashboard.blocks.gardens.ornamental')}
              size="small"
              icon={<FilterVintageOutlinedIcon />}
              sx={{
                height: DASHBOARD_TYPE.chipHeight,
                fontSize: DASHBOARD_TYPE.chip,
                backgroundColor: tk.ornBg,
                color: tk.ornText,
                '& .MuiChip-icon': { color: 'inherit', fontSize: 13, ml: '8px', mr: '-2px' },
              }}
            />
          )}
        </Box>

        {plants.length > 0 && (
          <Typography
            data-novice-plants
            sx={{ fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.4, color: 'text.secondary' }}
          >
            {plantsLine}
          </Typography>
        )}

        {task && TaskIcon && (
          <Box
            data-novice-task={task.kind}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: `${DASHBOARD_NOVICE.taskGap}px`,
              backgroundColor: tk.invBg,
              borderRadius: `${DASHBOARD_NOVICE.taskRadius}px`,
              p: DASHBOARD_NOVICE.taskPadding,
              minWidth: 0,
            }}
          >
            <TaskIcon aria-hidden sx={{ fontSize: DASHBOARD_NOVICE.taskIcon, color: 'primary.main', flexShrink: 0 }} />
            <Typography
              sx={{
                fontSize: DASHBOARD_TYPE.secondary,
                fontWeight: 600,
                lineHeight: 1.4,
                color: 'text.secondary',
                minWidth: 0,
              }}
            >
              {t('dashboard.novice.task', { task: todoSentence(task, true, t, i18n.language, system) })}
            </Typography>
          </Box>
        )}
      </Box>

      {/* The foot: the weather, then — pushed right, wrapping under it on a
          narrow card rather than clipping — the date and the chevron. */}
      <Box
        data-novice-foot
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: `${DASHBOARD_NOVICE.footGap}px`,
          borderTop: '1px solid',
          borderColor: 'borderSubtle',
          p: DASHBOARD_NOVICE.footPadding,
          minWidth: 0,
        }}
      >
        {weatherFoot()}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: `${DASHBOARD_NOVICE.footGap}px` }}>
          {modified !== null ? (
            <Typography
              data-novice-modified
              sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary', whiteSpace: 'nowrap' }}
            >
              {modified}
            </Typography>
          ) : (
            <MissingDataMark label={t('dashboard.blocks.gardens.noDate')} />
          )}
          <Box
            component={RouterLink}
            to={plannerPath}
            aria-hidden="true"
            tabIndex={-1}
            data-novice-chevron
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              flexShrink: 0,
              color: 'primary.main',
              textDecoration: 'none',
            }}
          >
            <ChevronRightIcon sx={{ fontSize: DASHBOARD_NOVICE.chevron }} />
          </Box>
        </Box>
      </Box>
    </Card>
  );
}
