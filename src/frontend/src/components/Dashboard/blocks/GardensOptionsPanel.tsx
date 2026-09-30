import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import ReorderableList from '../ReorderableList';
import { useHoldOptionsPanelEscape } from '../optionsPanelEscape';
import { defaultGardensCount, gardensCap, gardensOptions } from './gardensOptions';
import type { GardenOrder } from '../../../hooks/useGardenOrder';
import { DASHBOARD_KEY_FIGURES as K, DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import { GARDENS_COUNTS, GARDENS_COUNT_ALL, type GardenSort, type GardensCount } from '../../../types/Dashboard';
import type { DashboardGardenData } from '../../../types/DashboardData';

interface Props {
  /** The widget's stored options — `{ count, sort }` and whatever else another build keeps there. */
  options: Record<string, unknown> | null;
  /** The sorts the account's formula serves (`FormulaCapabilities.gardenSorts`): the panel draws these and no other. */
  sorts: readonly GardenSort[];
  /** The aggregate's gardens — what the custom order lists, every one of them. */
  gardens: readonly DashboardGardenData[];
  /** Whether `gardens` is the aggregate's answer (the Counters panel's `ready`): the order is not drawn on an empty answer. */
  ready: boolean;
  /** The whole options document, re-written — the layout PUT replaces it wholesale. */
  onChange: (options: Record<string, unknown>) => void;
  /** The account's custom order, owned by the page (`useGardenOrder`): read and moved here. */
  order: GardenOrder;
}

/** The 11 px capitals of the panel's section headings — the exception the band's panel already carries (A-1.1). */
const headingSx = {
  fontSize: K.label,
  lineHeight: 1.3,
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'text.secondary',
} as const;

/** Aides, notes: 14 px (A-1.1). */
const noteSx = { fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.45, color: 'text.secondary' } as const;

/**
 * SMA-448, lot F5-a — the gear of the Gardens widget (V3-04 § 4; decided by
 * Alexandre on 28/09 — contract v3 A-N3, A-N4, A-N5): « Jardins affichés » in a
 * segmented group — 5 · 8 · 10 · Tous, 8 on a desktop and 5 on a phone until
 * the user chooses, the choice then holding on every screen —; « Trier par »
 * as a radio group of the sorts the FORMULA serves, each with its sense —
 * three for the Gardener, five for the Expert, never one the server would
 * refuse (R8); and, under « Ordre personnalisé », the COMPLETE list of the
 * gardens in the same `ReorderableList` as the band's four figures — the
 * handle ⠿, ▲ ▼ that keep the focus, a rule where the widget's cut falls, the
 * « Nouveau » chip on a garden not yet ranked, and the two sentences of
 * V3-04. The order is a second write surface, the garden's own
 * (`useGardenOrder`): the panel says its state in its ONE live region, the
 * same region the list's moves speak through — born empty, written by its ref,
 * never rendered by React.
 *
 * Setting the count or the sort never turns the chip « · ajustée » (V19);
 * « Réinitialiser » keeps the count and the sort — a reset puts back a
 * layout, never a setting (SMA-437, lot V3-07, contract A-17) — and leaves
 * the order where it is: it belongs to the gardens, not to a layout.
 */
export default function GardensOptionsPanel({ options, sorts, gardens, ready, onChange, order }: Props) {
  const { t } = useTranslation();
  const tk = useDashboardTokens();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const parsed = gardensOptions(options, sorts);
  const count = parsed.count ?? defaultGardensCount(phone);
  const cap = gardensCap(count);

  // The one live region of the panel (the rule of #278, S2 of PR #288): a
  // region is announced when text CHANGES inside it, not when it is inserted
  // already filled — mounted once, born empty, written by its ref.
  const regionRef = useRef<HTMLDivElement | null>(null);
  const say = useCallback((text: string) => {
    if (regionRef.current) regionRef.current.textContent = text;
  }, []);
  const [dragging, setDragging] = useState(false);
  useHoldOptionsPanelEscape(dragging);

  // What the last write of the ORDER did, said when it lands or fails —
  // never while it waits: a move is announced by the list the instant it is
  // made, and « pending » would overwrite that sentence before it is heard
  // [P]. Never at the mount either: a panel opened after a write must not
  // announce the past. A DOM write from the ref, no state.
  const saidStateRef = useRef(order.state);
  useEffect(() => {
    if (saidStateRef.current === order.state) return;
    saidStateRef.current = order.state;
    if (order.state === 'saved') say(t('dashboard.blocks.gardens.options.orderSaved'));
    if (order.state === 'error') say(t('dashboard.blocks.gardens.options.orderError'));
  }, [order.state, say, t]);

  // What a write carries: the STORED document — every key another build
  // keeps there —, its `count` and `sort` only where the user CHOSE them
  // (the server refuses a `count: null`, and a default written down would
  // stop following the screen it is read on). `parsed` resolves; it is never
  // written back.
  const stored = options ?? {};
  const without = (document: Record<string, unknown>, key: string): Record<string, unknown> =>
    Object.fromEntries(Object.entries(document).filter(([candidate]) => candidate !== key));
  const chosenSort = typeof stored.sort === 'string' && stored.sort === parsed.sort;
  const document: Record<string, unknown> = {
    ...without(without(stored, 'count'), 'sort'),
    ...(parsed.count !== null ? { count: parsed.count } : {}),
    ...(chosenSort ? { sort: parsed.sort } : {}),
  };
  /** The document re-written with `count`, or without it (back to the default). */
  const writeCount = (next: GardensCount | null) =>
    onChange(next === null ? without(document, 'count') : { ...document, count: next });
  const writeSort = (next: GardenSort) => onChange({ ...document, sort: next });

  const byId = new Map(gardens.map((garden) => [garden.id, garden]));
  const ordered = order.ids.map((id) => byId.get(id)).filter((garden): garden is DashboardGardenData => garden !== undefined);
  // What `isNew` asks of the WHOLE list, read once per list (PR #300, fix
  // round 1, A — the family of the rank lookup): whether any garden is ranked
  // on the server, and the local order as a set. Each row ran
  // `gardens.some` or `order.order.includes` for its own chip, and the list
  // holds every garden — a scan per row, O(n²) for an Expert without a limit.
  const anyRanked = useMemo(() => gardens.some((candidate) => candidate.sortOrder !== null), [gardens]);
  const localOrder = useMemo(() => (order.order === null ? null : new Set(order.order)), [order.order]);
  /** « Nouveau »: a garden not yet ranked while others are — at the head, without a write (A-N5). */
  const isNew = (garden: DashboardGardenData) =>
    localOrder === null
      ? garden.sortOrder === null && anyRanked
      : !localOrder.has(garden.id) && localOrder.size > 0;
  const placeOf = (index: number) => t('dashboard.blocks.gardens.options.place', { count: index + 1, ordinal: true });

  return (
    <Box data-gardens-options sx={{ display: 'flex', flexDirection: 'column', gap: '14px', py: '4px' }}>
      {/* ── Jardins affichés (A-N4) ─────────────────────────────────────── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Typography component="h4" sx={{ ...headingSx, m: 0 }}>
          {t('dashboard.blocks.gardens.options.countSection')}
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={String(count)}
          aria-label={t('dashboard.blocks.gardens.options.countGroup')}
          onChange={(_event, value: string | null) => {
            if (value === null) return;
            writeCount(value === GARDENS_COUNT_ALL ? GARDENS_COUNT_ALL : (Number(value) as GardensCount));
          }}
          sx={{
            '& .MuiToggleButton-root': {
              height: 36,
              fontSize: DASHBOARD_TYPE.secondary,
              fontWeight: 700,
              textTransform: 'none',
              borderColor: tk.chipBorder,
              '&.Mui-selected': { backgroundColor: 'primary.main', color: 'primary.contrastText' },
              '&.Mui-selected:hover': { backgroundColor: 'primary.dark' },
            },
          }}
        >
          {GARDENS_COUNTS.map((value) => (
            <ToggleButton key={value} value={String(value)}>
              {value}
            </ToggleButton>
          ))}
          <ToggleButton value={GARDENS_COUNT_ALL}>{t('dashboard.blocks.gardens.options.countAll')}</ToggleButton>
        </ToggleButtonGroup>
        {parsed.count === null ? (
          <Typography sx={noteSx}>{t('dashboard.blocks.gardens.options.countHelp')}</Typography>
        ) : (
          <Typography sx={noteSx}>
            {t('dashboard.blocks.gardens.options.countChosen')}{' '}
            <Button
              size="small"
              onClick={() => writeCount(null)}
              sx={{ p: 0, minWidth: 0, fontSize: DASHBOARD_TYPE.secondary, fontWeight: 700, textTransform: 'none', verticalAlign: 'baseline' }}
            >
              {t('dashboard.blocks.gardens.options.countReset')}
            </Button>
          </Typography>
        )}
      </Box>

      {/* ── Trier par (A-N3): the sorts the formula serves, and no other ─── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Typography component="h4" sx={{ ...headingSx, m: 0 }}>
          {t('dashboard.blocks.gardens.options.sortSection')}
        </Typography>
        <RadioGroup
          aria-label={t('dashboard.blocks.gardens.options.sortGroup')}
          value={parsed.sort}
          onChange={(event) => writeSort(event.target.value as GardenSort)}
          sx={{ gap: '2px' }}
        >
          {sorts.map((sort) => (
            <FormControlLabel
              key={sort}
              value={sort}
              control={<Radio size="small" />}
              sx={{
                m: 0,
                alignItems: 'flex-start',
                borderRadius: '8px',
                pr: '6px',
                ...(sort === parsed.sort && { backgroundColor: tk.tint }),
                '& .MuiFormControlLabel-label': { flex: 1, minWidth: 0, pt: '7px', pb: '6px' },
              }}
              label={
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <Typography component="span" sx={{ fontSize: DASHBOARD_TYPE.secondary, fontWeight: 600, lineHeight: 1.3 }}>
                    {t(`dashboard.blocks.gardens.options.sorts.${sort}.label`)}
                  </Typography>
                  <Typography component="span" sx={{ ...noteSx, lineHeight: 1.3 }}>
                    {t(`dashboard.blocks.gardens.options.sorts.${sort}.sense`)}
                  </Typography>
                </Box>
              }
            />
          ))}
        </RadioGroup>
      </Box>

      {/* ── Votre ordre (A-N5): the complete list, the Expert's alone ───── */}
      {parsed.sort === 'custom' && (
        <Box data-gardens-order sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Typography component="h4" sx={{ ...headingSx, m: 0 }}>
            {t('dashboard.blocks.gardens.options.orderSection', { count: ordered.length })}
          </Typography>
          {!ready ? (
            <Typography sx={noteSx}>{t('dashboard.blocks.gardens.options.notReady')}</Typography>
          ) : (
            <>
              <Typography sx={noteSx}>
                {cap === null
                  ? t('dashboard.blocks.gardens.options.orderHelpAll')
                  : t('dashboard.blocks.gardens.options.orderHelp', { count: cap })}
              </Typography>
              <ReorderableList
                items={ordered}
                getId={(garden) => garden.id}
                getName={(garden) => garden.name}
                placeOf={placeOf}
                label={t('dashboard.blocks.gardens.options.orderList')}
                onMove={order.move}
                onAnnounce={say}
                onDraggingChange={setDragging}
                renderRow={(garden, index) => (
                  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px', py: '4px' }}>
                    {/* The rule where the widget's cut falls (V3-04): said on
                        the first row beyond it, as the row's own eyebrow. */}
                    {cap !== null && index === cap && (
                      <Typography component="span" data-gardens-order-beyond sx={{ ...headingSx, fontSize: 10, letterSpacing: '0.05em' }}>
                        {t('dashboard.blocks.gardens.options.orderBeyond', { count: cap })}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      {/* A long name WRAPS (V5: no ellipsis a source did not
                          allow — the widget's own name cell has one, this
                          row has none), the row growing with it. */}
                      <Typography
                        component="span"
                        sx={{
                          fontSize: DASHBOARD_TYPE.secondary,
                          fontWeight: 700,
                          lineHeight: 1.3,
                          minWidth: 0,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {garden.name}
                      </Typography>
                      {isNew(garden) && (
                        <Chip
                          data-gardens-order-new
                          label={t('dashboard.blocks.gardens.options.newChip')}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: tk.okBg,
                            color: tk.okText,
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </Box>
                  </Box>
                )}
              />
              <Typography sx={noteSx}>{t('dashboard.blocks.gardens.options.orderKept')}</Typography>
              <Typography sx={noteSx}>{t('dashboard.blocks.gardens.options.orderNew')}</Typography>
            </>
          )}
        </Box>
      )}

      {/* No children: React never renders its text, so a re-render never
          rewrites what `say` wrote. The note's tint once it says something. */}
      <Box
        ref={regionRef}
        role="status"
        aria-live="polite"
        data-gardens-options-said
        sx={{
          ...noteSx,
          color: 'text.primary',
          '&:not(:empty)': { backgroundColor: 'surfaceSubtle', borderRadius: '8px', p: '8px 10px' },
        }}
      />
    </Box>
  );
}
