import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import SwapVertOutlinedIcon from '@mui/icons-material/SwapVertOutlined';
import ReorderableList from '../ReorderableList';
import { useHoldOptionsPanelEscape } from '../optionsPanelEscape';
import { KEY_FIGURE_GROUPS, keyFigureTiles, type KeyFigureTile, type KeyFiguresInput } from './keyFigures';
import {
  DEFAULT_KEY_FIGURES,
  KEY_FIGURES,
  isDefaultSelection,
  keyFiguresOptions,
  moveFigure,
  replaceFigure,
  type KeyFigure,
} from './keyFiguresOptions';
import { DASHBOARD_KEY_FIGURES as K, DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';

interface Props {
  /** The band's stored options — `{ figures: [...] }` and whatever else another build keeps there. */
  options: Record<string, unknown> | null;
  /**
   * What the figures are computed from — or null while the gardens are not
   * known (loading, failed, none): the panel then names the figures without
   * their values, never with the zeros an empty aggregate would give.
   */
  input: KeyFiguresInput | null;
  /** The whole options document, re-written — the layout PUT replaces it wholesale. */
  onChange: (options: Record<string, unknown>) => void;
}

/** The 11 px capitals of the panel's section and group headings — exception 1 of arbitrage 1. */
const headingSx = {
  fontSize: K.label,
  lineHeight: 1.3,
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'text.secondary',
} as const;

/** Aides, notes, marks: 14 px — arbitrage 1 (13 → 14). */
const noteSx = { fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.45, color: 'text.secondary' } as const;

/**
 * SMA-437 lot 1, PR B, step B5 — the gear of the Key figures band: « Toujours
 * quatre » (contract § 4.5; A-N23, [A] 23/09: the mechanics of the four
 * emplacements). Four numbered rows, the reading order of the tiles; one
 * REPLACES a figure — never adds, never removes, so three or five figures are
 * impossible to form — and choosing a figure already shown SWAPS the two
 * places: no duplicate, no hole, no error message. The order moves by the
 * handle or by ▲ ▼ (`ReorderableList`, the brick the Customize panel and the
 * gardens' order will reuse); « Rétablir les chiffres par défaut » is inert on
 * the four of 23/09.
 *
 * « Remplacer » opens the catalogue IN the same panel — the 22 figures in V3-04's
 * five groups, a radio group whose value column says what each figure reads
 * today. Escape there comes back to the four (the panel stays open), as it
 * cancels a keyboard drag: the `Popover` leaves Escape to the panel while
 * either is under way (`useHoldOptionsPanelEscape`).
 *
 * Writing the figures never turns the chip « · ajustée »: `isAdjusted` reads
 * no `options` (V19).
 *
 * One departure from V3-04, assumed: the artboard puts « Annuler » and
 * « Remplacer » in the panel's FOOT, in place of « Terminé »; the foot belongs
 * to the `Popover` every widget shares (`SortableWidget`), so the two buttons
 * close the catalogue's body instead, and « Terminé » stays under them.
 */
export default function KeyFiguresOptionsPanel({ options, input, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  const parsed = keyFiguresOptions(options);
  const figures = parsed.figures;

  // The one live region of the panel: what a move, a replacement or a reset
  // did, said once (the reorderable list hands its sentences here). Round 1,
  // S2 — the rule learned in #278: a live region is announced when text
  // CHANGES inside it, not when it is inserted already filled. So it is mounted
  // ONCE, outside the two views, born empty, and stays mounted; its text is
  // written into it by its ref — never rendered by React, never set in an
  // effect.
  const regionRef = useRef<HTMLDivElement | null>(null);
  const say = useCallback((text: string) => {
    if (regionRef.current) regionRef.current.textContent = text;
  }, []);
  // What a replacement or a swap says: written once the four emplacements are
  // drawn again — the ref callback of their view, as it mounts after the
  // catalogue closes, after the emplacement took the focus back — into the
  // region that stayed: a mutation the region announces. Never into the
  // catalogue it closes.
  const pendingSaid = useRef<string | null>(null);
  const sayPendingOnReturn = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && pendingSaid.current !== null) {
        say(pendingSaid.current);
        pendingSaid.current = null;
      }
    },
    [say]
  );
  const [dragging, setDragging] = useState(false);
  /** The catalogue, open on emplacement `slot` with `choice` checked; null on the four emplacements. */
  const [catalogue, setCatalogue] = useState<{ slot: number; choice: KeyFigure } | null>(null);
  useHoldOptionsPanelEscape(dragging || catalogue !== null);

  // The emplacement the catalogue was opened from: its button takes the focus
  // back as the four emplacements are drawn again (its ref callback, below).
  const pendingFocus = useRef<number | null>(null);

  // Every figure's tile, computed ONCE while the panel is open (the Popover
  // mounts its body only then) — the catalogue shows each value.
  const gardens = input?.gardens;
  const views = input?.views;
  const varieties = input?.varieties;
  const totals = input?.totals;
  const weather = input?.weather;
  const weatherStatus = input?.weatherStatus;
  const tiles = useMemo(() => {
    if (!gardens || gardens.length === 0 || !views || !varieties || !totals || !weather || !weatherStatus) return null;
    return new Map(
      keyFigureTiles(KEY_FIGURES, { gardens, views, varieties, totals, weather, weatherStatus }, t, i18n.language).map(
        (tile): [KeyFigure, KeyFigureTile] => [tile.figure, tile]
      )
    );
  }, [gardens, views, varieties, totals, weather, weatherStatus, t, i18n.language]);

  const nameOf = (figure: KeyFigure) => t(`dashboard.blocks.keyfigures.figures.${figure}.label`);
  /** « 16 426 », « 2,66 ha », « — » — the figure's value as its tile draws it, or nothing before the gardens are known. */
  const valueOf = (figure: KeyFigure) => {
    const tile = tiles?.get(figure);
    if (!tile) return null;
    return tile.unit ? `${tile.value}\u00a0${tile.unit}` : tile.value;
  };
  const placeOf = (index: number) =>
    t('dashboard.blocks.keyfigures.panel.place', { count: index + 1, ordinal: true });

  const write = (next: KeyFigure[]) => onChange({ ...parsed, figures: next });

  const openCatalogue = (slot: number) => {
    // The region stays under the catalogue: what it said of the four is not
    // left standing there.
    say('');
    setCatalogue({ slot, choice: figures[slot]! });
  };
  const closeCatalogue = () => {
    if (catalogue) pendingFocus.current = catalogue.slot;
    setCatalogue(null);
  };

  const applyChoice = () => {
    if (!catalogue) return;
    const { slot, choice } = catalogue;
    const previous = figures[slot]!;
    if (choice !== previous) {
      const elsewhere = figures.indexOf(choice);
      write(replaceFigure(figures, slot, choice));
      pendingSaid.current = (
        elsewhere >= 0
          ? t('dashboard.blocks.keyfigures.panel.swapped', { figure: nameOf(choice), other: nameOf(previous) })
          : t('dashboard.blocks.keyfigures.panel.replaced', {
              figure: nameOf(choice),
              previous: nameOf(previous),
              place: placeOf(slot),
            })
      );
    }
    closeCatalogue();
  };

  // No children: React never renders its text, so a re-render never
  // rewrites what `say` wrote. What it holds styles it — the note's tint once
  // it says something, nothing while it is empty.
  const liveRegion = (
    <Box
      ref={regionRef}
      role="status"
      aria-live="polite"
      data-key-figures-said
      sx={{
        ...noteSx,
        color: 'text.primary',
        '&:not(:empty)': { mt: '10px', backgroundColor: 'surfaceSubtle', borderRadius: '8px', p: '8px 10px' },
      }}
    />
  );

  /** The catalogue, open on emplacement `open.slot` with `open.choice` checked. */
  const renderCatalogue = (open: { slot: number; choice: KeyFigure }) => {
    const shownAt = (figure: KeyFigure) => figures.indexOf(figure);
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape comes back to the four emplacements; the panel stays open.
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeCatalogue();
      }
    };
    return (
      <Box
        onKeyDown={onKeyDown}
        data-key-figures-catalogue
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '10px', py: '4px' }}
      >
        <Button
          size="small"
          startIcon={<ChevronLeftIcon />}
          onClick={closeCatalogue}
          sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.secondary, fontWeight: 700, pl: 0 }}
        >
          {t('dashboard.blocks.keyfigures.panel.back')}
        </Button>
        <Typography component="h4" sx={{ m: 0, fontSize: DASHBOARD_TYPE.body, fontWeight: 700, lineHeight: 1.35 }}>
          {t('dashboard.blocks.keyfigures.panel.catalogueTitle', {
            figure: nameOf(figures[open.slot]!),
            place: placeOf(open.slot),
          })}
        </Typography>
        <RadioGroup
          aria-label={t('dashboard.blocks.keyfigures.panel.catalogueLabel')}
          value={open.choice}
          onChange={(event) => setCatalogue({ ...open, choice: event.target.value as KeyFigure })}
          sx={{ gap: '2px' }}
        >
          {Object.entries(KEY_FIGURE_GROUPS).map(([group, members]) => (
            <Box key={group} sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <Typography sx={{ ...headingSx, mt: '6px', mb: '2px' }}>
                {t(`dashboard.blocks.keyfigures.panel.groups.${group}`)}
              </Typography>
              {members.map((figure) => {
                const at = shownAt(figure);
                const mark =
                  at === open.slot
                    ? t('dashboard.blocks.keyfigures.panel.markCurrent')
                    : at >= 0
                      ? t('dashboard.blocks.keyfigures.panel.markShown', { place: placeOf(at) })
                      : null;
                const value = valueOf(figure);
                return (
                  <FormControlLabel
                    key={figure}
                    value={figure}
                    control={<Radio size="small" autoFocus={figure === open.choice} />}
                    sx={{
                      m: 0,
                      alignItems: 'flex-start',
                      borderRadius: '8px',
                      pr: '6px',
                      ...(figure === open.choice && { backgroundColor: tk.tint }),
                      '& .MuiFormControlLabel-label': { flex: 1, minWidth: 0, pt: '7px', pb: '6px' },
                    }}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <Typography component="span" sx={{ fontSize: DASHBOARD_TYPE.secondary, fontWeight: 600, lineHeight: 1.3 }}>
                            {nameOf(figure)}
                          </Typography>
                          {mark && (
                            <Typography component="span" sx={{ ...noteSx, fontWeight: 700, lineHeight: 1.3 }}>
                              {mark}
                            </Typography>
                          )}
                        </Box>
                        {value && (
                          <Typography
                            component="span"
                            sx={{ ...noteSx, lineHeight: 1.3, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                          >
                            {value}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                );
              })}
            </Box>
          ))}
        </RadioGroup>
        <Box sx={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <SwapVertOutlinedIcon aria-hidden sx={{ fontSize: 18, color: 'primary.main', mt: '1px' }} />
          <Typography sx={{ ...noteSx, color: 'text.primary' }}>{t('dashboard.blocks.keyfigures.panel.swapNote')}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button size="small" onClick={closeCatalogue} sx={{ fontSize: 15, fontWeight: 700 }}>
            {t('dashboard.blocks.keyfigures.panel.cancel')}
          </Button>
          <Button size="small" variant="contained" onClick={applyChoice} sx={{ minHeight: 34, fontSize: DASHBOARD_TYPE.secondary }}>
            {t('dashboard.blocks.keyfigures.panel.replace')}
          </Button>
        </Box>
      </Box>
    );
  };

  /** The four emplacements. */
  const renderSlots = () => {
    const atDefault = isDefaultSelection(figures);
    return (
      <Box ref={sayPendingOnReturn} sx={{ display: 'flex', flexDirection: 'column', gap: '10px', py: '4px' }}>
        <Typography component="h4" sx={{ ...headingSx, m: 0, mt: '2px' }}>
          {t('dashboard.blocks.keyfigures.panel.section')}
        </Typography>
        <Typography sx={noteSx}>
          <Box component="b" sx={{ color: 'text.primary' }}>
            {t('dashboard.blocks.keyfigures.panel.helpLead')}
          </Box>{' '}
          {t('dashboard.blocks.keyfigures.panel.help')}
        </Typography>
        <ReorderableList
          items={figures}
          getId={(figure) => figure}
          getName={nameOf}
          placeOf={placeOf}
          label={t('dashboard.blocks.keyfigures.panel.list')}
          onMove={(from, to) => write(moveFigure(figures, from, to))}
          onAnnounce={say}
          onDraggingChange={setDragging}
          renderRow={(figure, index) => {
            const value = valueOf(figure);
            return (
              <>
                <Box
                  aria-hidden
                  sx={{
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    // The emplacement's number: 13 px, the chips' size (arbitrage 1).
                    fontSize: DASHBOARD_TYPE.chip,
                    fontWeight: 800,
                    backgroundColor: tk.okBg,
                    color: tk.okText,
                  }}
                >
                  {index + 1}
                </Box>
                <ButtonBase
                  ref={(node: HTMLButtonElement | null) => {
                    if (node && pendingFocus.current === index) {
                      pendingFocus.current = null;
                      node.focus();
                    }
                  }}
                  onClick={() => openCatalogue(index)}
                  aria-label={t('dashboard.blocks.keyfigures.panel.replaceSlot', { figure: nameOf(figure), place: placeOf(index) })}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: '4px',
                    p: '5px 2px 5px 8px',
                    borderRadius: '8px',
                    textAlign: 'left',
                    '&:hover': { backgroundColor: 'surfaceSubtle' },
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <Typography component="span" sx={{ fontSize: DASHBOARD_TYPE.secondary, fontWeight: 700, lineHeight: 1.3 }}>
                      {nameOf(figure)}
                    </Typography>
                    {value && (
                      <Typography component="span" sx={{ ...noteSx, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>
                        {value}
                      </Typography>
                    )}
                  </Box>
                  <ChevronRightIcon aria-hidden sx={{ fontSize: 20, color: 'primary.main', flexShrink: 0 }} />
                </ButtonBase>
              </>
            );
          }}
        />
        <Button
          size="small"
          startIcon={<RestartAltOutlinedIcon />}
          aria-disabled={atDefault || undefined}
          onClick={() => {
            if (atDefault) return;
            write([...DEFAULT_KEY_FIGURES]);
            say(t('dashboard.blocks.keyfigures.panel.resetSaid'));
          }}
          sx={{
            alignSelf: 'flex-start',
            fontSize: DASHBOARD_TYPE.secondary,
            fontWeight: 700,
            pl: '4px',
            '&[aria-disabled="true"]': { color: 'text.secondary', fontWeight: 600, cursor: 'default', backgroundColor: 'transparent' },
          }}
        >
          {t('dashboard.blocks.keyfigures.panel.reset')}
        </Button>
        {atDefault && <Typography sx={{ ...noteSx, mt: '-6px' }}>{t('dashboard.blocks.keyfigures.panel.resetDone')}</Typography>}
      </Box>
    );
  };

  // The region OUTSIDE the two views: the same node for the whole life of the
  // panel, whichever view is drawn above it.
  return (
    <Box>
      {catalogue !== null ? renderCatalogue(catalogue) : renderSlots()}
      {liveRegion}
    </Box>
  );
}
