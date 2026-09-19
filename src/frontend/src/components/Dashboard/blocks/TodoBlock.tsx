import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import type { SvgIconComponent } from '@mui/icons-material';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import SpaOutlinedIcon from '@mui/icons-material/SpaOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import DashboardBlock from '../DashboardBlock';
import IconDisc from '../IconDisc';
import InviteState from '../InviteState';
import { BLOCK_ICONS } from '../blockIcons';
import { monthLabel } from './plantCalendar';
import { gardensWithoutWeather, todoTasks, type TodoTask, type TodoTaskKind } from './todoTasks';
import { displayTemperature, nameList } from './weatherFormat';
import { weekdayLong } from './weatherTime';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import { DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { DashboardSize } from '../../../types/Dashboard';
import type { DashboardGardenData, DashboardVarietyData } from '../../../types/DashboardData';
import type { DashboardWeatherData } from '../../../types/DashboardWeather';
import { formatCount } from '../../../utils/formatNumber';

interface Props {
  size: DashboardSize;
  editing?: boolean;
  gardens: DashboardGardenData[];
  varieties: DashboardVarietyData[];
  weather: DashboardWeatherData;
  /**
   * The GARDENS aggregate is still loading. Only that one blocks: without the
   * plans there is nothing to derive, with or without a forecast.
   */
  loading: boolean;
  /** The GARDENS aggregate failed — no plan, hence no task of any kind. */
  loadError: boolean;
  /**
   * The weather aggregate is loading or failed (round 1, C2 — Extension
   * `a0894658`, GitHub outside-diff). NOT blocking: `todoTasks` derives
   * « Tailler » and « Semer » from the plans and the catalog alone, so they
   * are shown and the block says, in one line, that the watering half is not
   * planned — the ③b « indisponible » pattern rather than an empty card.
   */
  weatherUnavailable?: boolean;
  refreshing?: boolean;
  onRetry: () => void;
  /** « Ajouter une ville → » of the invitation: the location dialog on the profile default. */
  onLocate: (gardenId: string | null) => void;
  /** « +N tâches → »: the rest of the list is reached by growing the widget. */
  onExpand: () => void;
}

/** Rows a Medium card lists before « +N » — « À faire 4 tâches » (`_spec.md` § 4). */
const MEDIUM_ROWS = 4;
/** …and with an invitation sharing the card: « 2 + « +2 tâches → » » (`_spec.md` § 4, § 7). */
const MEDIUM_ROWS_WITH_INVITE = 2;

/**
 * The glyph of each kind, matched path-for-path against the artboards:
 * `WaterDropOutlined`, `AcUnitOutlined` (PR 3b/5), and — PR 4a/5 —
 * `ContentCutOutlined` for « Tailler » and `SpaOutlined` for « Semer »
 * (`Main.dc.html`, the four Medium rows).
 */
const TASK_ICONS: Record<TodoTaskKind, SvgIconComponent> = {
  water: WaterDropOutlinedIcon,
  prune: ContentCutOutlinedIcon,
  sow: SpaOutlinedIcon,
  cold: AcUnitOutlinedIcon,
  frost: AcUnitOutlinedIcon,
};

/**
 * SMA-336 PR 3b/5 — « À faire aujourd'hui », fed by the weather (pre-flight
 * § F.5, `Main.dc.html`, `A4Manquantes.dc.html`): the two weather tasks per
 * garden — water tonight, protect from the cold — from the ONE pure function
 * `todoTasks`, which the header chip and the list both read.
 *
 * Medium lists up to four tasks and « +N tâches → »; with gardens the weather
 * cannot plan for, two tasks, the A4 invitation « Sans la météo de X et Y,
 * leurs arrosages ne sont pas planifiés — Ajouter une ville → », and « +N ».
 * Large groups by garden (« Terrasse · 3 »), with checkboxes held in React
 * state for the session ONLY — « Cases cochées pour cette session seulement —
 * non enregistrées » — never in the browser's storage (§ 7: preferences live on
 * the server; a tick is not a preference).
 *
 * SMA-336 PR 4a/5 — « Tailler » and « Semer » arrived in the same function, so
 * the « Tailler et Semer arrivent bientôt » note went with them: the block no
 * longer promises anything it does not show. They name PLANTS rather than count
 * them (« Tailler — Thym, Romarin et Tournesol (septembre) ») and need no
 * weather, so a garden with no city now has tasks of its own — and the A4
 * invitation says what is missing, watering, rather than everything.
 */
export default function TodoBlock({
  size,
  editing,
  gardens,
  varieties,
  weather,
  loading,
  loadError,
  weatherUnavailable = false,
  refreshing = false,
  onRetry,
  onLocate,
  onExpand,
}: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  const { system } = useUnitSystem();
  // Session-only ticks: gone with the component, by design.
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  const TodoIcon = BLOCK_ICONS.todo;

  // ONE derivation for the chip and the list.
  const tasks = todoTasks(gardens, varieties, weather);
  /**
   * The gardens no city has been given to. Meaningful ONLY once the weather
   * aggregate has landed: while it loads or after it fails, every garden looks
   * unlocated, and « Sans la météo de X et Y — Ajouter une ville → » would ask
   * the gardener to fix something that is not broken. The note below says the
   * true thing in that case.
   */
  const missing = weatherUnavailable ? [] : gardensWithoutWeather(gardens, weather);
  /** Watering cannot be planned — the aggregate is down, or some gardens have no city. */
  const wateringUnknown = weatherUnavailable || missing.length > 0;

  const toggle = (id: string) =>
    setDone((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const degrees = (celsius: number) =>
    t('dashboard.blocks.weather.degrees', { value: displayTemperature(celsius, system) });

  /**
   * The sentence of a task — with the garden in brackets on an ungrouped list
   * of several gardens. A cold task names the TOLERANCE it is about (round 1,
   * O1: « 3 plantes sensibles sous 8° », not « 3 plantes connues sensibles »);
   * a task planned on a place's LAST KNOWN weather says so (G2).
   */
  const label = (task: TodoTask, grouped: boolean): string => {
    // PR 4a/5 — the calendar tasks name PLANTS, not a number of them
    // (`Main.dc.html`: « Tailler — Thym, Romarin et Tournesol (septembre) »).
    // Past three, `nameList` closes with the « N autres » the weather
    // invitation already uses, so the row never grows past one line.
    if (task.month !== null) {
      const plants = nameList(task.names, i18n.language, (count) =>
        t('dashboard.blocks.weather.others', { count })
      );
      const month = monthLabel(task.month.month, i18n.language);
      const key = grouped ? `${task.kind}Grouped` : task.kind;
      return t(`dashboard.blocks.todo.${key}`, { plants, garden: task.gardenName, month });
    }
    const plants =
      task.kind === 'cold'
        ? t('dashboard.blocks.todo.sensitivePlants', {
            count: task.count,
            threshold: task.toleranceC === null ? '' : degrees(task.toleranceC),
          })
        : t('dashboard.blocks.todo.plants', { count: task.count });
    const when = task.today
      ? t('dashboard.blocks.todo.tonight')
      : t('dashboard.blocks.todo.eveningOf', {
          day: weekdayLong(task.date, i18n.language) ?? task.date,
        });
    const temp = task.tempC === null ? '' : degrees(task.tempC);
    const key = grouped ? `${task.kind}Grouped` : task.kind;
    const sentence = t(`dashboard.blocks.todo.${key}`, { plants, garden: task.gardenName, temp, when });
    return task.stale ? t('dashboard.blocks.todo.stale', { task: sentence }) : sentence;
  };

  const row = (task: TodoTask, grouped: boolean, checkbox: boolean) => {
    const Icon = TASK_ICONS[task.kind];
    const text = label(task, grouped);
    const ticked = done.has(task.id);
    return (
      <Box
        component="li"
        key={task.id}
        data-todo-task={task.kind}
        data-todo-stale={task.stale ? '' : undefined}
        sx={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}
      >
        {checkbox ? (
          <Checkbox
            checked={ticked}
            onChange={() => toggle(task.id)}
            size="small"
            sx={{ p: '4px', ml: '-4px' }}
            slotProps={{ input: { 'aria-label': t('dashboard.blocks.todo.done', { task: text }) } }}
          />
        ) : (
          /* `.inv-ic` at 30 px — the disc before each task of the artboard. */
          <IconDisc>
            <Icon />
          </IconDisc>
        )}
        <Typography
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: DASHBOARD_TYPE.body,
            lineHeight: 1.45,
            color: ticked ? 'text.disabled' : 'text.secondary',
            textDecoration: ticked ? 'line-through' : 'none',
          }}
        >
          {text}
        </Typography>
      </Box>
    );
  };

  /** « Sans la météo de X et Y, leurs arrosages ne sont pas planifiés — Ajouter une ville → » (A4). */
  const invitation = missing.length > 0 && (
    <Box
      data-todo-invite
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
      <IconDisc>
        <LocationOnOutlinedIcon />
      </IconDisc>
      {/* A `div`, not Typography's default `<p>` (round 1, E2): the « Ajouter
          une ville → » link below is a `<button>`, which HTML forbids inside a
          paragraph — the parser would close the `<p>` before it and the two
          halves of one sentence would come apart. */}
      <Typography
        component="div"
        sx={{ flex: 1, minWidth: 0, fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.5, color: 'text.secondary' }}
      >
        {t('dashboard.blocks.todo.noWeather', {
          count: missing.length,
          gardens: nameList(
            missing.map((garden) => garden.name),
            i18n.language,
            (count) => t('dashboard.blocks.weather.others', { count })
          ),
        })}
        <Button
          variant="text"
          size="small"
          onClick={() => onLocate(null)}
          sx={{ p: 0, minWidth: 0, fontSize: DASHBOARD_TYPE.link, fontWeight: 700, textTransform: 'none', verticalAlign: 'baseline' }}
        >
          {t('dashboard.blocks.todo.addCity')}
        </Button>
      </Typography>
    </Box>
  );

  /**
   * « Météo indisponible — les arrosages ne sont pas planifiés » (round 1,
   * C2): the ③b « indisponible » sentence, said ONCE, beside the tasks the
   * calendar could still derive. It replaces the A4 invitation while the
   * weather is out, since there is nothing for the gardener to add.
   */
  const weatherNote = weatherUnavailable && (
    <Typography
      data-todo-weather-note
      sx={{ fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.5, color: 'text.secondary', flexShrink: 0 }}
    >
      {t('dashboard.blocks.todo.weatherUnavailable')}
    </Typography>
  );

  /**
   * Nothing derived. « Rien à faire aujourd'hui » is a STATEMENT, and it may
   * only be made when the block knows: with the watering half unknown — no
   * forecast, or gardens with no city — it says so instead (round 1, C4 —
   * GitHub `4016156990`). An unknown is not a zero.
   */
  const emptyMessage = wateringUnknown
    ? t('dashboard.blocks.todo.unknownYet')
    : t('dashboard.blocks.todo.nothing');

  const nothing = <InviteState icon={<TodoIcon />} message={emptyMessage} variant="catalogue" />;

  const smallBody = () => (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <Box>
        <Typography data-todo-count sx={{ fontSize: DASHBOARD_TYPE.big, fontWeight: 800, lineHeight: 1.1 }}>
          {formatCount(tasks.length, i18n.language)}
        </Typography>
        <Typography sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}>
          {t('dashboard.blocks.todo.count', { count: tasks.length })}
        </Typography>
      </Box>
      {tasks[0] ? (
        <Typography
          sx={{
            fontSize: DASHBOARD_TYPE.body,
            color: 'text.secondary',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {label(tasks[0], gardens.length <= 1)}
        </Typography>
      ) : (
        /* The 1×1 card has no room for the tinted panel, and PR 4a/5 left it
           with nothing to say once « Tailler et Semer arrivent bientôt »
           went: the honest sentence, plain — and the honest sentence is
           « nous ne savons pas encore » whenever the watering half is unknown
           (round 1, C4). No room here for the note the other two sizes carry,
           so the wording is where the whole distinction is made. */
        <Typography
          data-todo-nothing
          sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}
        >
          {emptyMessage}
        </Typography>
      )}
    </Box>
  );

  const mediumBody = () => {
    if (tasks.length === 0) {
      return (
        <>
          {nothing}
          {invitation}
          {weatherNote}
        </>
      );
    }
    const cap = invitation ? MEDIUM_ROWS_WITH_INVITE : MEDIUM_ROWS;
    const shown = tasks.slice(0, cap);
    const rest = tasks.length - shown.length;
    return (
      <>
        <Box
          component="ul"
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-evenly',
            gap: '8px',
            listStyle: 'none',
            m: 0,
            p: 0,
          }}
        >
          {shown.map((task) => row(task, gardens.length <= 1, false))}
        </Box>
        {invitation}
        {weatherNote}
        {rest > 0 && (
          <Button
            variant="text"
            onClick={onExpand}
            sx={{ alignSelf: 'flex-start', p: 0, minWidth: 0, fontSize: DASHBOARD_TYPE.link, fontWeight: 700, textTransform: 'none' }}
          >
            {t('dashboard.blocks.todo.more', { count: rest })}
          </Button>
        )}
      </>
    );
  };

  const largeBody = () => {
    if (tasks.length === 0) {
      return (
        <>
          {nothing}
          {invitation}
          {weatherNote}
        </>
      );
    }
    // Grouped by garden, in the gardens' order — « Terrasse · 3 ».
    const groups = gardens
      .map((garden) => ({ garden, tasks: tasks.filter((task) => task.gardenId === garden.id) }))
      .filter((group) => group.tasks.length > 0);
    return (
      <>
        {/* COMPACT, at the top, never stretched (round 1, O2 — the V3 rule):
            with `flex: 1` this list took the leftover height of a Large card
            and pushed the three notes to the foot, leaving a void under three
            tasks. It now takes the height of what it lists and shrinks — with
            its own scroll — only when the card is too short for it; whatever
            is left over stays at the bottom, under the notes. */}
        <Box
          data-todo-groups
          sx={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          {groups.map(({ garden, tasks: own }) => (
            <Box component="section" key={garden.id} data-todo-group={garden.id} aria-label={garden.name}>
              <Typography
                component="h3"
                sx={{
                  fontSize: DASHBOARD_TYPE.chip,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                  mb: '6px',
                }}
              >
                {t('dashboard.blocks.todo.group', { garden: garden.name, count: own.length })}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {own.map((task) => row(task, true, true))}
              </Box>
            </Box>
          ))}
        </Box>
        {invitation}
        {weatherNote}
        <Typography data-todo-session sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}>
          {t('dashboard.blocks.todo.sessionOnly')}
        </Typography>
      </>
    );
  };

  const body = (): ReactNode => {
    if (loading) {
      return (
        <Box data-todo-skeleton sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={30} />
          ))}
        </Box>
      );
    }
    if (loadError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}>
            {t('dashboard.blocks.todo.loadError')}
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

  const chip = !loading && !loadError && tasks.length > 0 && (
    <Chip
      data-todo-chip
      label={t('dashboard.blocks.todo.count', { count: tasks.length })}
      size="small"
      sx={{
        height: DASHBOARD_TYPE.chipHeight,
        fontSize: DASHBOARD_TYPE.chip,
        fontWeight: 700,
        backgroundColor: tk.pillBg,
        color: tk.pillText,
      }}
    />
  );

  /**
   * What the card ANNOUNCES to assistive technology (round 2 of ④b, S-4's
   * family — the same absence as the Tips block's note): « Météo
   * indisponible — les arrosages ne sont pas planifiés pour l'instant. »
   * when it is put on screen, through a live region that exists from the
   * FIRST render, empty — the `WeatherInvite` recipe (round 1 of ③b, E7),
   * `role="status"`, `aria-live="polite"`, off-screen through
   * `visuallyHidden`. A region inserted together with its text is read
   * unreliably; one already there whose text changes is read once,
   * politely, and an empty first render announces nothing. The text is the
   * sentence the reader sees, where it is drawn: Medium and Large, not while
   * the plans load or fail, not on a Small card, which does not draw it.
   */
  const announced =
    !loading && !loadError && weatherUnavailable && size !== 'small'
      ? t('dashboard.blocks.todo.weatherUnavailable')
      : '';

  return (
    <DashboardBlock
      blockKey="todo"
      title={t('dashboard.blocks.todo.title')}
      size={size}
      editing={editing}
      chip={chip || undefined}
    >
      {/* Out of the flow (`position: absolute`): no gap of the column is spent on it. */}
      <Typography role="status" aria-live="polite" data-todo-status sx={visuallyHidden}>
        {announced}
      </Typography>
      {body()}
    </DashboardBlock>
  );
}
