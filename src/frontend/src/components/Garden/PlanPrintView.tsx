import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import GlobalStyles from '@mui/material/GlobalStyles';
import Portal from '@mui/material/Portal';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../../theme';
import { getPlannerTokens } from '../../theme/plannerTokens';
import type { CellData } from '../../types/GardenLayout';
import type { ExposureCategory } from '../../utils/exposure';
import { getPlantColor } from '../../utils/plantColor';
import {
  afterTwoFrames,
  EXPORT_CELL_PX,
  gridPixelSize,
  PLAN_PRINT_CSS,
  PRINT_FALLBACK_MS,
  PRINT_PAGE_MM,
  printScale,
} from '../../utils/planExport';
import GardenGrid, { type PlacementOverlay } from './GardenGrid';

// Day palette on paper whatever the app's mode (SMA-18 lot 3).
const LIGHT_THEME = createAppTheme('light');
const tk = getPlannerTokens('light');

/** One empty spacer row per page edge (round 2, V3 + F7): the vertical 12 mm
 * the @page rule no longer carries, rendered by the browser at the top and
 * the bottom of EVERY page because it repeats a table's <thead> and <tfoot>. */
const PAGE_SPACER_SX = {
  height: `${PRINT_PAGE_MM.margin}mm`,
  p: 0,
  border: 0,
} as const;

/** One printed row: the on-screen plant card's data + its quantity. */
export interface PrintPlantRow {
  plantId: string;
  plantName: string;
  scientificName: string;
  /** How many placements carry this plant on the map. */
  count: number;
}

export interface PlanPrintViewProps {
  gardenName: string;
  /** The page's own meta strings, verbatim (figures · type · facing). */
  metaFigures: string;
  metaTypeChip: string | null;
  metaFacingChip: string | null;
  printedAt: Date;
  /** document.title while the dialog is open — the browser's default PDF name. */
  documentTitle: string;
  grid: CellData[][];
  placements: PlacementOverlay[];
  cols: number;
  rows: number;
  exposure: (ExposureCategory | null)[][] | null;
  castShadow: boolean[][] | null;
  /** The legend to print under the grid (null when the box is unticked). */
  legend: ReactNode;
  plants: PrintPlantRow[];
  /** Called once: on `afterprint`, or by the fallback timer. */
  onDone: () => void;
}

/**
 * PDF export stage (SMA-18 lot 3, zero dependency): mounted by the page only
 * while a PDF job runs, portaled to <body> so the print stylesheet can hide
 * every other direct child. On screen it is display:none; on paper it is the
 * only thing — a table framed by two 12 mm spacer rows (<thead>/<tfoot>,
 * repeated on every page) around: name, the meta line the page already
 * computes, the date, the read-only grid scaled to the printable width (day
 * palette, layer per the box), the legend, the plant list with quantities,
 * a footer. Two frames after mounting it calls window.print(); the browser's
 * dialog produces the PDF (« Enregistrer au format PDF ») — accepted
 * deviation from a direct download. `afterprint` (or the fallback timer)
 * reports back so the page unmounts the view.
 */
export function PlanPrintView({
  gardenName,
  metaFigures,
  metaTypeChip,
  metaFacingChip,
  printedAt,
  documentTitle,
  grid,
  placements,
  cols,
  rows,
  exposure,
  castShadow,
  legend,
  plants,
  onDone,
}: PlanPrintViewProps) {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    let settled = false;
    let cancelled = false;
    let fallback: number | undefined;
    const previousTitle = document.title;
    const finish = () => {
      if (settled) return;
      settled = true;
      onDone();
    };
    window.addEventListener('afterprint', finish);
    document.title = documentTitle;
    afterTwoFrames().then(() => {
      if (cancelled) return;
      window.print();
      // Chrome and Firefox block inside print() until the dialog closes and
      // fire afterprint themselves; the timer only covers a browser that
      // returns early and never fires it.
      fallback = window.setTimeout(finish, PRINT_FALLBACK_MS);
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', finish);
      if (fallback !== undefined) window.clearTimeout(fallback);
      document.title = previousTitle;
    };
  }, [documentTitle, onDone]);

  const size = gridPixelSize(cols, rows);
  const scale = printScale(cols, rows);
  const meta = [metaFigures, metaTypeChip, metaFacingChip]
    .filter(Boolean)
    .join(' · ');
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'long',
  }).format(printedAt);

  return (
    <Portal>
      <ThemeProvider theme={LIGHT_THEME}>
        <GlobalStyles styles={PLAN_PRINT_CSS} />
        {/* The attribute is PLAN_PRINT_ROOT_ATTR — the stylesheet above hides
            every other <body> child on paper and this one on screen. Round 2
            (V3 + F7): the root is a TABLE whose <thead> and <tfoot> hold one
            empty 12 mm row each — the browser repeats both at the top and the
            bottom of EVERY printed page, which is how the vertical margin
            reaches page 2 and beyond now that @page keeps only the lateral
            margins (its zero top/bottom margin suppresses the browser's own
            header and footer). All the content sits in the <tbody>. */}
        <Box
          component="table"
          data-plan-print-root=""
          data-testid="plan-print-view"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            bgcolor: tk.card,
            color: tk.tTitle,
            fontFamily: LIGHT_THEME.typography.fontFamily,
          }}
        >
          <Box component="thead">
            <Box component="tr">
              <Box component="td" sx={PAGE_SPACER_SX} />
            </Box>
          </Box>
          <Box component="tbody">
            <Box component="tr">
              <Box
                component="td"
                sx={{ p: 0, border: 0, verticalAlign: 'top' }}
              >
                <Box component="header" sx={{ breakInside: 'avoid' }}>
                  <Typography
                    component="h1"
                    sx={{
                      fontSize: 24,
                      fontWeight: 800,
                      letterSpacing: '-0.01em',
                      lineHeight: 1.2,
                      color: tk.prim,
                    }}
                  >
                    {gardenName}
                  </Typography>
                  {meta && (
                    <Typography
                      data-testid="plan-print-meta"
                      sx={{
                        mt: '4px',
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: tk.tMeta,
                      }}
                    >
                      {meta}
                    </Typography>
                  )}
                  <Typography sx={{ mt: '2px', fontSize: 11, color: tk.muted }}>
                    {t('planner.export.print.date', { date })}
                  </Typography>
                </Box>

                {/* The grid keeps its on-screen geometry and is scaled as a whole
              (transform: scale, aspect preserved) into a wrapper sized to the
              scaled footprint, so the flow below never reserves the unscaled
              height. */}
                <Box
                  data-testid="plan-print-grid"
                  sx={{
                    mt: '10px',
                    width: size.width * scale,
                    height: size.height * scale,
                    breakInside: 'avoid',
                  }}
                >
                  <Box
                    sx={{
                      width: size.width,
                      height: size.height,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <GardenGrid
                      grid={grid}
                      shapeEditMode={false}
                      placements={placements}
                      exposure={exposure}
                      castShadow={castShadow}
                      cellSizePx={EXPORT_CELL_PX}
                    />
                  </Box>
                </Box>

                {legend && <Box sx={{ breakInside: 'avoid' }}>{legend}</Box>}

                {plants.length > 0 && (
                  <Box component="section" sx={{ mt: '16px' }}>
                    <Typography
                      component="h2"
                      sx={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: tk.tTitle,
                        mb: '6px',
                      }}
                    >
                      {t('planner.plantsInGarden')} ({plants.length})
                    </Typography>
                    <Table
                      size="small"
                      aria-label={t('planner.plantsInGarden')}
                      sx={{
                        '& th, & td': {
                          fontSize: 11.5,
                          py: '4px',
                          px: '8px',
                          borderColor: tk.divider,
                        },
                        '& th': { fontWeight: 700, color: tk.tTitle },
                      }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>
                            {t('planner.export.print.plant')}
                          </TableCell>
                          <TableCell>
                            {t('planner.export.print.scientificName')}
                          </TableCell>
                          <TableCell align="right">
                            {t('planner.export.print.quantity')}
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {plants.map((plant) => (
                          <TableRow
                            key={plant.plantId}
                            sx={{ breakInside: 'avoid' }}
                          >
                            <TableCell>
                              <Box
                                component="span"
                                aria-hidden
                                sx={{
                                  display: 'inline-block',
                                  width: 10,
                                  height: 10,
                                  mr: '6px',
                                  borderRadius: '3px',
                                  verticalAlign: 'middle',
                                  bgcolor: getPlantColor(plant.plantId),
                                  border: `1px solid ${tk.cardBd}`,
                                }}
                              />
                              {plant.plantName}
                            </TableCell>
                            <TableCell
                              sx={{ fontStyle: 'italic', color: tk.tSci }}
                            >
                              {plant.scientificName}
                            </TableCell>
                            <TableCell align="right">{plant.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                )}

                <Typography
                  component="footer"
                  sx={{ mt: '14px', fontSize: 10.5, color: tk.muted }}
                >
                  {t('planner.export.print.footer')}
                </Typography>
              </Box>
            </Box>
          </Box>
          <Box component="tfoot">
            <Box component="tr">
              <Box component="td" sx={PAGE_SPACER_SX} />
            </Box>
          </Box>
        </Box>
      </ThemeProvider>
    </Portal>
  );
}
