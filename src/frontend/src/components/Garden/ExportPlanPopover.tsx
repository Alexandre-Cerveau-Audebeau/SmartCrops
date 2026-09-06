import { Fragment, memo, useId, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Popover from '@mui/material/Popover';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import DownloadIcon from '@mui/icons-material/Download';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import type { PlannerTokens } from '../../theme/plannerTokens';
import { usePlannerTokens } from '../../theme/usePlannerTokens';

export type PlanExportFormat = 'pdf' | 'png';

/** What the user asked for — the page turns it into a job. */
export interface PlanExportRequest {
  format: PlanExportFormat;
  /** PNG: the exposure layer on the grid. PDF: the layer AND the legend. */
  includeLayer: boolean;
}

interface ExportPlanPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  /** True while a job runs — the form locks and the action shows progress. */
  exporting: boolean;
  onExport: (request: PlanExportRequest) => void;
  onClose: () => void;
}

// The two formats of the États mockup (popover export): PDF first and
// selected by default; each option = radio · icon · title + subtitle.
const FORMATS: ReadonlyArray<{
  value: PlanExportFormat;
  labelKey: string;
  subKey: string;
  Icon: ComponentType<SvgIconProps>;
  iconColor: (tk: PlannerTokens) => string;
}> = [
  {
    value: 'pdf',
    labelKey: 'planner.export.pdf',
    subKey: 'planner.export.pdfSub',
    Icon: PictureAsPdfOutlinedIcon,
    iconColor: (tk) => tk.dangTx,
  },
  {
    value: 'png',
    labelKey: 'planner.export.png',
    subKey: 'planner.export.pngSub',
    Icon: ImageOutlinedIcon,
    iconColor: (tk) => tk.tMeta,
  },
];

/**
 * The panel's form, mounted fresh on every opening (keyed on `open` by the
 * popover below) so the mockup's defaults — PDF, layer included — come back
 * each time without an effect resetting state.
 */
function ExportPlanForm({
  titleId,
  exporting,
  onExport,
}: {
  titleId: string;
  exporting: boolean;
  onExport: (request: PlanExportRequest) => void;
}) {
  const { t } = useTranslation();
  const tk = usePlannerTokens();
  const [format, setFormat] = useState<PlanExportFormat>('pdf');
  const [includeLayer, setIncludeLayer] = useState(true);

  return (
    <Box
      sx={{
        p: '18px',
        width: 324,
        maxWidth: 'calc(100vw - 32px)',
        boxSizing: 'border-box',
      }}
    >
      <Typography
        id={titleId}
        component="h2"
        sx={{ fontSize: 15, fontWeight: 800, color: tk.tTitle, mb: '13px' }}
      >
        {t('planner.export.title')}
      </Typography>
      <RadioGroup
        aria-label={t('planner.export.formatLabel')}
        value={format}
        onChange={(_, value) => setFormat(value as PlanExportFormat)}
        sx={{ gap: '8px', mb: '13px' }}
      >
        {FORMATS.map(({ value, labelKey, subKey, Icon, iconColor }) => {
          const selected = format === value;
          return (
            <Fragment key={value}>
              <FormControlLabel
                value={value}
                disabled={exporting}
                control={
                  <Radio
                    size="small"
                    sx={{
                      p: '2px',
                      color: tk.muted,
                      '&.Mui-checked': { color: tk.prim },
                    }}
                  />
                }
                label={
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    <Icon sx={{ fontSize: 20, color: iconColor(tk) }} />
                    <Box>
                      <Typography
                        component="span"
                        sx={{
                          display: 'block',
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: tk.tTitle,
                        }}
                      >
                        {t(labelKey)}
                      </Typography>
                      <Typography
                        component="span"
                        sx={{
                          display: 'block',
                          fontSize: 11.5,
                          color: tk.muted,
                        }}
                      >
                        {t(subKey)}
                      </Typography>
                    </Box>
                  </Box>
                }
                sx={{
                  m: 0,
                  gap: '10px',
                  borderRadius: '9px',
                  // Mockup: the selected option carries a 2px --prim border on
                  // the §12 selected-card fill (nearest existing token); the
                  // other a 1px input border. The padding compensates the
                  // border width so both boxes share one outer size.
                  border: selected
                    ? `2px solid ${tk.prim}`
                    : `1px solid ${tk.inputBd}`,
                  p: selected ? '10px 11px' : '11px 12px',
                  bgcolor: selected ? tk.typeSelBg : 'transparent',
                }}
              />
              {/* Round 1 (orchestrator): the PDF is saved from the browser's
                print dialog — a discreet reminder under the selected option,
                outside the radio's label so its accessible name stays the
                mockup's. */}
              {value === 'pdf' && selected && (
                <Typography
                  data-testid="export-pdf-hint"
                  sx={{ fontSize: 12, color: tk.tMeta, px: '12px', mt: '-2px' }}
                >
                  {t('planner.export.pdfHint')}
                </Typography>
              )}
            </Fragment>
          );
        })}
      </RadioGroup>
      <FormControlLabel
        disabled={exporting}
        control={
          <Checkbox
            size="small"
            checked={includeLayer}
            onChange={(_, checked) => setIncludeLayer(checked)}
            sx={{
              p: '2px',
              color: tk.muted,
              '&.Mui-checked': { color: tk.prim },
            }}
          />
        }
        // Format-aware (CodeRabbit #266 round 1): the PNG stage renders the
        // grid alone, so its label must not promise the legend the PDF adds.
        label={t(
          format === 'pdf'
            ? 'planner.export.includeLayerPdf'
            : 'planner.export.includeLayerPng'
        )}
        sx={{
          m: 0,
          mb: '15px',
          gap: '9px',
          '& .MuiFormControlLabel-label': { fontSize: 13, color: tk.tMeta },
        }}
      />
      <Button
        variant="contained"
        fullWidth
        disabled={exporting}
        onClick={() => onExport({ format, includeLayer })}
        startIcon={
          exporting ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            <DownloadIcon sx={{ fontSize: 18 }} />
          )
        }
        sx={{ height: 42, borderRadius: '8px', fontSize: 14, fontWeight: 800 }}
      >
        {exporting
          ? t('planner.export.inProgress')
          : t('planner.export.button')}
      </Button>
    </Box>
  );
}

/**
 * « Exporter le plan » (SMA-18 lot 3, États mockup "Popover export"):
 * anchored to the header's Export button — PDF (A4 landscape: plan + legend
 * + plant list) or PNG (2×, grid only, transparent), plus the format-aware
 * "include the Exposure layer (and legend)" box, then one Export action. Esc
 * / click-away close (Popover's own behavior); the Paper is the labelled
 * dialog.
 */
export const ExportPlanPopover = memo(function ExportPlanPopover({
  open,
  anchorEl,
  exporting,
  onExport,
  onClose,
}: ExportPlanPopoverProps) {
  const tk = usePlannerTokens();
  const titleId = useId();

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      disableScrollLock
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-labelledby': titleId,
          sx: {
            mt: '6px',
            // backgroundImage: none kills MUI's dark-mode elevation overlay so
            // the §2 card hex renders exactly (the override-popover fix).
            bgcolor: tk.card,
            backgroundImage: 'none',
            border: `1px solid ${tk.cardBd}`,
            borderRadius: '12px',
            boxShadow: tk.shadow,
          },
        },
      }}
    >
      {/* Keyed on `open`: the form remounts the moment the panel closes, so
          a reopening during the exit transition still starts from the
          defaults (Popover alone unmounts its children only once the
          transition has exited). */}
      <ExportPlanForm
        key={open ? 'open' : 'closed'}
        titleId={titleId}
        exporting={exporting}
        onExport={onExport}
      />
    </Popover>
  );
});
