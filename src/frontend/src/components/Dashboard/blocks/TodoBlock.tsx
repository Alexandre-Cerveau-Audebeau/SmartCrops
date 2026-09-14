import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import type { SvgIconComponent } from '@mui/icons-material';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import DashboardBlock from '../DashboardBlock';
import InviteState from '../InviteState';
import { BLOCK_ICONS } from '../blockIcons';
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
  /** Either aggregate still loading. */
  loading: boolean;
  /** Either aggregate failed — the tasks cannot be derived. */
  loadError: boolean;
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

const TASK_ICONS: Record<TodoTaskKind, SvgIconComponent> = {
  water: WaterDropOutlinedIcon,
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
 * non enregistré » — never in the browser's storage (§ 7: preferences live on
 * the server; a tick is not a preference).
 *
 * « Tailler » and « Semer » are PR 4/5, in the same function: until then the
 * block says so where it would otherwise stay silent — the empty state and the
 * Large footer carry « Tailler et Semer arrivent bientôt » — and `InviteBlock`
 * no longer draws this widget at all.
 */
export default function TodoBlock({
  size,
  editing,
  gardens,
  varieties,
  weather,
  loading,
  loadError,
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
  const missing = gardensWithoutWeather(gardens, weather);

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
          <Box
            aria-hidden
            sx={{
              width: 30,
              height: 30,
              flexShrink: 0,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tk.invIcBg,
              color: 'primary.main',
              '& .MuiSvgIcon-root': { fontSize: 16 },
            }}
          >
            <Icon />
          </Box>
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
      <Box
        aria-hidden
        sx={{
          width: 30,
          height: 30,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tk.invIcBg,
          color: 'primary.main',
          '& .MuiSvgIcon-root': { fontSize: 16 },
        }}
      >
        <LocationOnOutlinedIcon />
      </Box>
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

  const soonNote = (
    <Typography
      data-todo-soon
      sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
    >
      {t('dashboard.blocks.todo.soonKinds')}
    </Typography>
  );

  const nothing = (
    <InviteState icon={<TodoIcon />} message={t('dashboard.blocks.todo.nothing')} variant="catalogue" />
  );

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
        soonNote
      )}
    </Box>
  );

  const mediumBody = () => {
    if (tasks.length === 0) {
      return (
        <>
          {nothing}
          {invitation}
          {soonNote}
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
          {soonNote}
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
        <Typography data-todo-session sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}>
          {t('dashboard.blocks.todo.sessionOnly')}
        </Typography>
        {soonNote}
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

  return (
    <DashboardBlock
      blockKey="todo"
      title={t('dashboard.blocks.todo.title')}
      size={size}
      editing={editing}
      chip={chip || undefined}
    >
      {body()}
    </DashboardBlock>
  );
}
