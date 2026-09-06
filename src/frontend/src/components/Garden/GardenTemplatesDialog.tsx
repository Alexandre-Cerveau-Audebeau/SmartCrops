import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import type { PlannerTokens } from '../../theme/plannerTokens';
import {
  GARDEN_TEMPLATES,
  templatePlacementCount,
  type GardenTemplate,
  type GardenTemplateKey,
} from '../../utils/gardenTemplates';
import TemplatePreview from './TemplatePreview';

interface Props {
  open: boolean;
  /**
   * "Use this template" stays disabled, with a waiting label, until the
   * active-language catalog is loaded: the template's scientific names
   * resolve against it, so applying earlier would omit every plant.
   */
  catalogReady: boolean;
  /** Name → catalog id, for the preview colours (the page's resolver). */
  resolvePlantId?: (scientificName: string) => string | undefined;
  /** Escape, backdrop click and the close button all land here. */
  onClose: () => void;
  onApply: (key: GardenTemplateKey) => void;
}

// Three cards of ~228 px plus the mockup's 24 px padding.
const PAPER_WIDTH_PX = 780;

function TemplateCard({
  template,
  active,
  catalogReady,
  resolvePlantId,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onApply,
  tk,
}: {
  template: GardenTemplate;
  /** Hovered OR holding focus — the dialog derives it from its two states. */
  active: boolean;
  catalogReady: boolean;
  resolvePlantId?: (scientificName: string) => string | undefined;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onApply: (key: GardenTemplateKey) => void;
  tk: PlannerTokens;
}) {
  const { t } = useTranslation();
  const title = t(`planner.templates.items.${template.key}.title`);
  const description = t(`planner.templates.items.${template.key}.description`);
  const meta = t('planner.templates.meta', {
    count: templatePlacementCount(template),
    cols: template.cols,
    rows: template.rows,
    cellSize: t(`planner.templates.cellSizes.${template.cellSize}`),
  });

  return (
    <Box
      role="group"
      aria-label={t('planner.templates.cardLabel', { title, meta })}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        p: '14px',
        borderRadius: '12px',
        bgcolor: tk.searchBg,
        // Mockup: the hovered / focused card takes the green border.
        border: `2px solid ${active ? tk.prim : tk.inputBd}`,
        transition: 'border-color .15s',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <TemplatePreview
          template={template}
          resolvePlantId={resolvePlantId}
          cellPx={18}
        />
      </Box>
      <Typography
        component="h3"
        sx={{ fontSize: 15, fontWeight: 800, color: tk.tTitle, lineHeight: 1.2 }}
      >
        {title}
      </Typography>
      <Typography sx={{ fontSize: 12.5, color: tk.tMeta, lineHeight: 1.4 }}>
        {description}
      </Typography>
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tk.muted }}>
        {meta}
      </Typography>
      {/* Mockup: filled on the active card, outlined on the others. */}
      <Button
        variant={active ? 'contained' : 'outlined'}
        disabled={!catalogReady}
        onClick={() => onApply(template.key)}
        sx={{
          mt: 'auto',
          textTransform: 'none',
          fontWeight: 700,
          ...(active
            ? { bgcolor: tk.prim, '&:hover': { bgcolor: tk.prim } }
            : {
                color: tk.obtnTx,
                borderColor: tk.obtnBd,
                '&:hover': { borderColor: tk.prim },
              }),
        }}
      >
        {catalogReady
          ? t('planner.templates.use')
          : t('planner.templates.waitingCatalog')}
      </Button>
    </Box>
  );
}

/**
 * "Modèles de jardin" (SMA-18 lot 2), transcribed from the validated mockup:
 * grid icon + title + subtitle + close, three cards in a row (one column
 * below sm) — preview, title, description, meta, "Use this template" — and
 * the footer note. The dialog owns NO planner state: it only reports the
 * chosen key; the page resolves the plants and dispatches APPLY_TEMPLATE.
 *
 * Footer wording deviates from the mockup on purpose ("Your plant list is
 * kept" → "Plants already placed are kept when their spot stays free"): the
 * garden has no plant list apart from its placements (SMA-6 Option A —
 * membership IS placement), so what a template can preserve is a placement
 * whose cells stay free, nothing more — the note says exactly that.
 */
export default function GardenTemplatesDialog({
  open,
  catalogReady,
  resolvePlantId,
  onClose,
  onApply,
}: Props) {
  const { t } = useTranslation();
  const tk = usePlannerTokens();
  const titleId = useId();
  const descriptionId = useId();
  // The active card = the hovered one OR the one holding keyboard focus —
  // two states, tracked independently (CodeRabbit round 1): with a single
  // state, the pointer leaving a card the keyboard had focused cleared its
  // border and filled button while focus was still inside it. mouseleave
  // only releases hover; blur only releases focus.
  const [hoverKey, setHoverKey] = useState<GardenTemplateKey | null>(null);
  const [focusKey, setFocusKey] = useState<GardenTemplateKey | null>(null);
  const resetActive = () => {
    setHoverKey(null);
    setFocusKey(null);
  };

  // Reset both keys on the CLOSING edge (open → false), whichever side closed
  // the dialog (CodeRabbit round 2): handleClose and handleApply reset on
  // their own, but a parent that flips `open` itself would otherwise re-open
  // with the last hovered / focused card still active, with no pointer or
  // focus on it. Render-time adjust — the DeleteGardenDialog idiom (lot 1):
  // react-hooks/set-state-in-effect forbids the effect variant; keyed on the
  // edge so the opening fade never flashes a reset.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) resetActive();
  }

  const handleClose = () => {
    resetActive();
    onClose();
  };
  const handleApply = (key: GardenTemplateKey) => {
    resetActive();
    onApply(key);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      maxWidth={false}
      disableScrollLock
      slotProps={{
        backdrop: { sx: { bgcolor: tk.scrim } },
        paper: {
          sx: {
            width: `${PAPER_WIDTH_PX}px`,
            maxWidth: '100%',
            m: 2,
            borderRadius: '14px',
            boxShadow: tk.shadow,
            bgcolor: tk.card,
            // Same rule as the config dialog: no dark-mode elevation overlay,
            // the paper IS tk.card in both modes.
            backgroundImage: 'none',
          },
        },
      }}
    >
      <Box sx={{ p: '24px', color: tk.tMeta }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 3 }}>
          <GridViewOutlinedIcon sx={{ color: tk.prim, mt: '2px' }} />
          <Box sx={{ flex: 1 }}>
            <Typography
              id={titleId}
              component="h2"
              sx={{ fontSize: 20, fontWeight: 800, color: tk.tTitle, lineHeight: 1.2 }}
            >
              {t('planner.templates.title')}
            </Typography>
            <Typography
              id={descriptionId}
              sx={{ fontSize: 13.5, color: tk.muted, mt: '2px' }}
            >
              {t('planner.templates.subtitle')}
            </Typography>
          </Box>
          <IconButton
            aria-label={t('planner.templates.close')}
            onClick={handleClose}
            size="small"
            sx={{ color: tk.muted }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* The three cards — one row, one column below sm. */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
            gap: '14px',
            mb: 2.5,
          }}
        >
          {GARDEN_TEMPLATES.map((template) => (
            <TemplateCard
              key={template.key}
              template={template}
              active={hoverKey === template.key || focusKey === template.key}
              catalogReady={catalogReady}
              resolvePlantId={resolvePlantId}
              onMouseEnter={() => setHoverKey(template.key)}
              onMouseLeave={() => setHoverKey(null)}
              onFocus={() => setFocusKey(template.key)}
              onBlur={() => setFocusKey(null)}
              onApply={handleApply}
              tk={tk}
            />
          ))}
        </Box>

        {/* Footer note */}
        <Typography sx={{ fontSize: 12, color: tk.muted, lineHeight: 1.4 }}>
          {t('planner.templates.note')}
        </Typography>
      </Box>
    </Dialog>
  );
}
