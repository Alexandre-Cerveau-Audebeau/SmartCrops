import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { arrayMove } from '@dnd-kit/sortable';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import ReorderableList from './ReorderableList';
import { BLOCK_ICONS } from './blockIcons';
import { permitsBlock, sizesFor } from '../../constants/dashboardCapabilities';
import { useLiveRegion } from '../../hooks/useLiveRegion';
import { DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import { useDashboardTokens } from '../../theme/useDashboardTokens';
import {
  NON_HIDABLE_BLOCK,
  type DashboardBlock,
  type DashboardBlockKey,
  type DashboardLevel,
  type DashboardSize,
  type FormulaCapabilities,
} from '../../types/Dashboard';

/** Stable id: the drawer names itself by its heading. */
const TITLE_ID = 'dashboard-customize-title';

interface Props {
  open: boolean;
  level: DashboardLevel;
  /**
   * What the formula permits, as served (SMA-448, S5); null until the layout
   * is read. The list offers only the widgets it lists, in only the sizes it
   * serves each of them.
   */
  capabilities: FormulaCapabilities | null;
  /** Every block of the layout, in the page's order — hidden ones included. */
  blocks: DashboardBlock[];
  /**
   * The layout is not its formula's preset (`isAdjusted` — order, sizes,
   * visibility; never the options, V19): « Réinitialiser » has something to
   * put back. On the preset it is inert, and says so.
   */
  adjusted: boolean;
  /**
   * A switch of formula is in flight (SMA-448, PR #293, fix round 1, S5): the
   * link to the choice, the list and the reset take no gesture until the
   * page stands at one formula again — none can be made, then lost.
   */
  switching: boolean;
  onClose: () => void;
  /**
   * « Changer de formule » (SMA-448, PR #297, fix round 1, A1): opens the
   * choice screen — the one place where the formula changes —, handed the
   * click so the page gives the focus back to the link when the screen
   * closes.
   */
  onChangeFormula: (event: React.MouseEvent<HTMLElement>) => void;
  onReset: () => void;
  /** The blocks in their new order — the write the Edit mode's drop makes. */
  onReorder: (blocks: DashboardBlock[]) => void;
  /** A widget shown or hidden — the Edit mode's « − », both ways. */
  onVisibilityChange: (key: DashboardBlockKey, hidden: boolean) => void;
  /** A widget's size, chosen — where the Edit mode's corner handle steps. */
  onSizeChange: (key: DashboardBlockKey, size: DashboardSize) => void;
}

/**
 * SMA-336 — the Customize panel. SMA-437, lot V3-07 (contract A-16, decided
 * by Alexandre on 28/09: « deux lignes par widget (A) »): the formula the page
 * is on, named, with the way to the choice screen (SMA-448, PR #297, fix
 * round 1, A1 — the formula changes in ONE place), then EVERY widget of the
 * formula in one reorderable list, in the page's order: the handle and ▲ ▼
 * of `ReorderableList`, the widget's glyph and name, the switch that shows or
 * hides it — the lock on Gardens, which is never hidden (V9) — and, on a
 * second line, the sizes the formula serves it. A hidden widget keeps its
 * place in the list, as it keeps its place in the grid: the list IS the
 * gallery, which is gone. What the list changes is the page's own state —
 * the one the Edit mode writes (§ 4.9: « les deux surfaces écrivent le même
 * état »). Nothing else — no plan, no quota, no upsell.
 */
export default function CustomizePanel({
  open,
  level,
  capabilities,
  blocks,
  adjusted,
  switching,
  onClose,
  onChangeFormula,
  onReset,
  onReorder,
  onVisibilityChange,
  onSizeChange,
}: Props) {
  const { t } = useTranslation();
  const tk = useDashboardTokens();
  // The widgets of the FORMULA (SMA-448, S5 — R1), in the page's order, the
  // hidden ones at their place: a block the served capabilities do not list
  // is never offered, whatever the layout carries; none before they are read.
  const listed = blocks.filter((block) => capabilities !== null && permitsBlock(capabilities, block.key));

  // The one live region of the panel — `useLiveRegion()` (SMA-437, lot V3-07,
  // P3; contract A-6, A-20), the rule of #278 and S2 of PR #288: mounted with
  // the panel, born empty, its text written by its ref, the same sentence
  // never written twice. A note ON SCREEN (PR #303, fix round 1, R1 —
  // Alexandre, 30/09): it keeps its sentence until the next one replaces it
  // or the drawer closes with it — emptied after 5 s, it folded, and
  // « Réinitialiser » under it moved up without a gesture. What the list
  // says of a move comes here too (`onAnnounce`).
  const { announce, regionProps } = useLiveRegion({ visible: true });

  // A row picked up at the keyboard: Escape then CANCELS the drag and must
  // not close the drawer under it (the options panel's rule, pre-flight C.9).
  // The drawer's handler runs before the sensor's, on the render the drag
  // started in, so the drawer reads the drag as still under way.
  const [dragging, setDragging] = useState(false);

  const nameOf = (key: DashboardBlockKey) => t(`dashboard.blocks.${key}.title`);
  const placeOf = (index: number) => t('dashboard.panel.place', { count: index + 1, ordinal: true });

  /** A move in the list: the formula's widgets permuted, any other block left at its index — the grid's rule for the hidden ones. */
  const move = (from: number, to: number) => {
    const moved = arrayMove(listed, from, to);
    const inList = new Set(listed);
    let next = 0;
    onReorder(blocks.map((block) => (inList.has(block) ? moved[next++]! : block)));
  };

  const setShown = (block: DashboardBlock, shown: boolean) => {
    onVisibilityChange(block.key, !shown);
    announce(t(shown ? 'dashboard.panel.shownSaid' : 'dashboard.panel.hiddenSaid', { widget: nameOf(block.key) }));
  };

  const setSize = (block: DashboardBlock, size: DashboardSize) => {
    if (size === block.size) return;
    onSizeChange(block.key, size);
    announce(t('dashboard.panel.sizedSaid', { widget: nameOf(block.key), size: t(`dashboard.sizes.${size}`) }));
  };

  const levelName = t(`dashboard.levels.${level}.name`);

  /**
   * « Réinitialiser la disposition X » (P2 — contract A-17): the preset's
   * layout back, each widget's settings kept, said in the region. Inert on the
   * preset itself (`aria-disabled`, never `disabled`: the focus stays on the
   * button it has just made inert — the band's « Rétablir » rule, § 4.5).
   */
  const reset = () => {
    if (!adjusted) return;
    onReset();
    announce(t('dashboard.panel.resetSaid', { level: levelName }));
  };

  const sectionTitleSx = {
    fontSize: `${DASHBOARD_TYPE.title}px`,
    fontWeight: 800,
    letterSpacing: DASHBOARD_TYPE.titleLetterSpacing,
    textTransform: 'uppercase' as const,
    color: 'text.secondary',
  };
  const noteSx = { fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.45, color: 'text.secondary' } as const;

  /** The first line of a row: the glyph, the name and what it says of the widget, the switch — or the lock. */
  const renderRow = (block: DashboardBlock) => {
    const Icon = BLOCK_ICONS[block.key];
    const name = nameOf(block.key);
    const locked = block.key === NON_HIDABLE_BLOCK;
    // Under the name (`.wl-n small`): « toujours affiché » on Gardens, what a
    // hidden widget is — « Bientôt disponible » for Harvest, which has no data
    // yet (R5) —, nothing on a widget shown.
    const sub = locked
      ? t('dashboard.panel.always')
      : block.hidden
        ? t(block.key === 'harvest' ? 'dashboard.soon' : 'dashboard.panel.hiddenRow')
        : null;
    return (
      <>
        <Icon aria-hidden sx={{ fontSize: 20, flexShrink: 0, color: block.hidden ? 'text.secondary' : 'primary.main' }} />
        <Box data-panel-widget={block.key} sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="span"
            sx={{
              display: 'block',
              fontSize: DASHBOARD_TYPE.secondary,
              fontWeight: 600,
              lineHeight: 1.3,
              color: block.hidden ? 'text.secondary' : 'text.primary',
            }}
          >
            {name}
          </Typography>
          {sub && (
            <Typography component="span" sx={{ ...noteSx, display: 'block', lineHeight: 1.3, mt: '1px' }}>
              {sub}
            </Typography>
          )}
        </Box>
        {locked ? (
          // As the Edit mode's lock (`SortableWidget`): a graphic WITH a text
          // alternative — assistive technology may ignore a bare `aria-label`.
          // As wide as the switch, so ▲ ▼ stay in one column down the list.
          <Box
            role="img"
            aria-label={t('dashboard.editMode.locked', { widget: name })}
            sx={{ width: 58, flexShrink: 0, display: 'inline-flex', justifyContent: 'center', color: 'text.secondary' }}
          >
            <LockOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
          </Box>
        ) : (
          <Switch
            checked={!block.hidden}
            disabled={switching}
            onChange={(event) => setShown(block, event.target.checked)}
            slotProps={{ input: { role: 'switch', 'aria-label': t('dashboard.panel.show', { widget: name }) } }}
            sx={{ flexShrink: 0 }}
          />
        )}
      </>
    );
  };

  /** The second line: the sizes the formula serves this widget, or its one size, said. */
  const renderSizes = (block: DashboardBlock) => {
    const sizes = capabilities === null ? null : sizesFor(block.key, capabilities);
    const name = nameOf(block.key);
    if (sizes === null || sizes.length === 1) {
      return (
        <Typography sx={noteSx}>
          {t('dashboard.panel.onlySize', { size: t(`dashboard.sizes.${sizes?.[0] ?? block.size}`) })}
        </Typography>
      );
    }
    return (
      <Box role="group" aria-label={t('dashboard.panel.sizeGroup', { widget: name })} sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {sizes.map((size) => {
          const pressed = size === block.size;
          return (
            // A pill of 28 px (`.sgb`): the chips' 13 px (V11's chip
            // exception), the chosen one filled in green.
            <ButtonBase
              key={size}
              data-pill
              aria-pressed={pressed}
              disabled={switching}
              onClick={() => setSize(block, size)}
              sx={{
                height: 28,
                px: '8px',
                borderRadius: '14px',
                border: '1px solid',
                borderColor: pressed ? 'primary.main' : tk.chipBorder,
                backgroundColor: pressed ? 'primary.main' : 'transparent',
                color: pressed ? 'primary.contrastText' : 'text.primary',
                fontSize: DASHBOARD_TYPE.chip,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
              }}
            >
              {t(`dashboard.sizes.${size}`)}
            </ButtonBase>
          );
        })}
      </Box>
    );
  };

  return (
    // The open temporary Drawer is a role="dialog"; without `aria-labelledby`
    // it has no accessible name at all (round 1, E5).
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      disableEscapeKeyDown={dragging}
      slotProps={{
        paper: {
          'aria-labelledby': TITLE_ID,
          // SMA-437, lot V3-07, P4 (contract A-18 — Alexandre, 28/09: « le
          // tiroir de nuit sans le voile MUI »; SMA-450): at night MUI lays
          // the elevation's veil over a Paper — 14.7 % of white at the
          // temporary Drawer's 16 —, and the panel's secondary text fell to
          // 3.9:1, under the 4.5 of V14. Removed on THIS drawer only, as on
          // the options Popover (D15); the theme's `MuiPaper` keeps it.
          sx: { width: { xs: '100%', sm: 380 }, backgroundImage: 'none' },
        },
      }}
    >
      <Box
        role="presentation"
        sx={{ p: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography id={TITLE_ID} component="h2" variant="h6" fontWeight={700}>
            {t('dashboard.panel.title')}
          </Typography>
          <IconButton
            onClick={onClose}
            aria-label={t('dashboard.panel.close')}
            size="small"
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* « Formule », the word of the screen (V31) — V3-07 [P, validée
              avec la planche] where the section said « Niveau ». */}
          <Typography sx={sectionTitleSx}>
            {t('dashboard.panel.formulaSection')}
          </Typography>
          {/* SMA-448, PR #297, fix round 1 (A1) — Alexandre, 27/09: « Pourquoi
              on peut quand même switch de formule depuis le menu
              Personnaliser ? Il faut centraliser cette fonctionnalité. » The
              three level cards (radios) the panel had since SMA-336, which
              switched the account's formula on the server since lot F1, are
              gone with the refusal they were said under: the formula is
              NAMED here — its name and its tagline, as the card of the level
              drew them — and CHANGED in one place, the choice screen (V3-01),
              which this link opens as the chip does. The page gives the focus
              back to the link when the screen closes. */}
          <Box
            data-panel-formula
            sx={{
              p: '12px',
              borderRadius: '10px',
              border: '1px solid',
              borderColor: 'primary.main',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <Typography sx={{ fontSize: `${DASHBOARD_TYPE.body}px`, fontWeight: 700 }}>
              {t(`dashboard.levels.${level}.name`)}
            </Typography>
            <Typography sx={{ fontSize: `${DASHBOARD_TYPE.secondary}px`, color: 'text.secondary' }}>
              {t(`dashboard.levels.${level}.tagline`)}
            </Typography>
            <Button
              data-panel-change-formula
              variant="text"
              size="small"
              onClick={onChangeFormula}
              disabled={switching}
              aria-haspopup="dialog"
              sx={{
                mt: '8px',
                alignSelf: 'flex-start',
                p: 0,
                minWidth: 0,
                fontSize: `${DASHBOARD_TYPE.secondary}px`,
                fontWeight: 700,
                textTransform: 'none',
              }}
            >
              {t('dashboard.formulaChooser.title')}
            </Button>
          </Box>
          {/* The note F20 rewritten (contract § 1.2, § 7.3; A-16): the formula
              decides what is available, the panel what is on the page. */}
          <Typography sx={noteSx}>
            {t('dashboard.panel.note', { level: levelName })}
          </Typography>
        </Box>

        <Divider />

        <Box data-panel-widgets sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography sx={sectionTitleSx}>
            {t('dashboard.panel.widgetsSection')}
          </Typography>
          <Typography sx={noteSx}>{t('dashboard.panel.help')}</Typography>
          <ReorderableList
            items={listed}
            getId={(block) => block.key}
            getName={(block) => nameOf(block.key)}
            placeOf={placeOf}
            label={t('dashboard.panel.widgetsSection')}
            onMove={move}
            onAnnounce={announce}
            onDraggingChange={setDragging}
            disabled={switching}
            renderRow={renderRow}
            renderBelow={renderSizes}
          />
          {/* No children: React never renders its text, so a re-render never
              rewrites what `announce` wrote. The note's tint once it says
              something (`.live:not(:empty)`), nothing while it is empty. */}
          <Box
            {...regionProps}
            data-customize-said
            sx={{
              ...noteSx,
              color: 'text.primary',
              '&:not(:empty)': { mt: '-6px', backgroundColor: 'surfaceSubtle', borderRadius: '8px', p: '8px 10px' },
            }}
          />
          {/* A GLYPH before the label (round 5, A10-12). `A7Personnaliser.dc.html`
              draws this control as `<div class="lnk">` opening on an 18 px
              `<svg class="ic">` whose path is `RestartAltOutlined`, matched
              attribute for attribute against `@mui/icons-material`. It is the
              same rule as A10-11 on the page header and A2 on the widget
              titles: in these artboards a control that acts carries a mark.
              Under the list since V3-07 (`.obs`, `align-self: flex-start`), at
              the panel's 14 px (V11). Inert on the preset: the secondary tone
              and the divider's border, never a text faded under V14. */}
          <Button
            variant="outlined"
            size="small"
            startIcon={<RestartAltOutlinedIcon />}
            aria-disabled={!adjusted || undefined}
            onClick={reset}
            disabled={switching}
            sx={{
              alignSelf: 'flex-start',
              fontSize: `${DASHBOARD_TYPE.secondary}px`,
              '&[aria-disabled="true"]': {
                color: 'text.secondary',
                borderColor: 'divider',
                cursor: 'default',
                backgroundColor: 'transparent',
              },
            }}
          >
            {t('dashboard.panel.reset', { level: levelName })}
          </Button>
          {/* What it does — or, on the preset, why it does nothing (V3-07 § 6,
              (a) and (a) inerte). */}
          <Typography sx={noteSx}>
            {t(adjusted ? 'dashboard.panel.resetNote' : 'dashboard.panel.resetDone')}
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
}
