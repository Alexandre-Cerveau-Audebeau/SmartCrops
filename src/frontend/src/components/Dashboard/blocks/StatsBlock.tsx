import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import DashboardBlock from '../DashboardBlock';
import ExposureBar from '../ExposureBar';
import ExposureDot from '../ExposureDot';
import InviteState from '../InviteState';
import MissingDataMark from '../MissingDataMark';
import OccupancyBar from '../OccupancyBar';
import { DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { DashboardSize } from '../../../types/Dashboard';
import type { DashboardGardenData } from '../../../types/DashboardData';
import {
  DASHBOARD_MOMENT,
  DASHBOARD_SEASON,
  EXPOSURE_ORDER,
  ratedCells,
  sumExposureTallies,
  type ExposureTally,
} from '../../../utils/gardenStats';
import { useGardenViews } from '../../../hooks/useGardenViews';
import { formatCount, formatDecimal } from '../../../utils/formatNumber';

interface Props {
  size: DashboardSize;
  editing?: boolean;
  gardens: DashboardGardenData[];
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
}

/**
 * SMA-336 PR 2/5 — « Statistics »: the three sections of the frozen design —
 * occupancy per garden, the dominant exposure across everything, and exposure
 * per garden — plus the active surface and the free-cell count.
 *
 * Every figure is derived here, from the plans the aggregate transports. The
 * exposure engine is asked for SUMMER at NOON and nothing else (decision D12),
 * and the header says so: the planner lets a user pick the season and the
 * moment, this widget has no such control, and deriving them from a clock would
 * make the numbers change under someone who changed nothing.
 *
 * A garden with no saved layout has neither a surface nor an exposure. It still
 * appears — with a marker where its figures would be, rather than a zero. Zero
 * is a measurement; « not drawn yet » is not.
 *
 * ROUND 4 (A6) redraws the Large card on `A3Expert.dc.html`: the three sections
 * share one grid, the dominant exposure is a single segmented bar with a
 * pastille legend instead of four stacked rows, and each per-garden row carries
 * its own bar and figure. The section that shrinks is the middle one — about
 * 168 px of rows for about 64 — and with three gardens the card now fits its
 * 566 px footprint instead of scrolling inside itself (V7). `overflowY: 'auto'`
 * stays: each further garden costs another 84 px (one occupancy row and one
 * exposure row), so a long list still has to scroll — inside the card, which is
 * what the design asks for, and never over the widget below it.
 */
export default function StatsBlock({
  size,
  editing,
  gardens,
  loading,
  loadError,
  onRetry,
}: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();

  // The SAME views the Gardens widget reads (round 1, E22): both are on an
  // Expert page at once, and the exposure engine used to run twice per garden
  // per load because each widget derived its own copy.
  const byId = useGardenViews(gardens);
  const views = gardens.map((garden) => ({
    garden,
    view: byId.get(garden.id)!,
  }));

  const planned = views.filter((entry) => entry.view.hasPlan);
  const totalSurface = planned.reduce(
    (sum, entry) => sum + entry.view.surfaceM2,
    0
  );
  const totalActive = planned.reduce(
    (sum, entry) => sum + entry.view.activeCells,
    0
  );
  const totalOccupied = planned.reduce(
    (sum, entry) => sum + entry.view.occupiedCells,
    0
  );
  const totalFree = planned.reduce((sum, entry) => sum + entry.view.freeCells, 0);
  const distribution = sumExposureTallies(planned.map((e) => e.view.exposure));
  const freeDistribution = sumExposureTallies(
    planned.map((e) => e.view.freeExposure)
  );
  // ONE denominator for every share (round 6, Extension #4-10): the page
  // distribution, each garden's spoken label and its printed share divide by
  // the same helper, so what a screen reader hears and what the eye reads
  // cannot drift apart.
  const totalRated = ratedCells(distribution);

  /**
   * One section label of a Large card.
   *
   * A HEADING, not styled text (round 1, E13). A Large card carries three of
   * these, each introducing its own list of rows; as bare `Typography` a screen
   * reader met three unlabelled groups with no way to jump between them. The
   * widget card's own title is the `h2` that `DashboardBlock` renders, so these
   * sit one level below it. `h3` changes nothing on screen — the styling is
   * unchanged and the existing tests select them by text.
   */
  const sectionTitle = (label: string) => (
    <Typography
      component="h3"
      sx={{
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'text.secondary',
        m: 0,
      }}
    >
      {label}
    </Typography>
  );

  // Locale-formatted, never `toFixed` (round 1, G5): `toFixed` always writes a
  // point, so the French widget printed « 1.8 m² » where the language uses a
  // comma. One fractional digit, as the frozen design has it.
  const surfaceText = (value: number) =>
    t('dashboard.blocks.stats.surface', {
      value: formatDecimal(value, i18n.language, 1),
    });

  const percentText = (value: number) =>
    `${formatCount(Math.round(value), i18n.language)} %`;

  const share = (part: number, whole: number) =>
    whole > 0 ? percentText((part / whole) * 100) : '—';

  /**
   * One garden's WHOLE exposure distribution, in words (round 5, C1).
   *
   * The per-garden rows state the dominant category and its share and nothing
   * else; the legend above them describes the page, not a garden. So the other
   * three shares of a given garden were nowhere a screen reader could reach —
   * the bar that draws them is decorative by construction. This is the text the
   * bar carries as its alternative.
   *
   * FOUR named fragments in one key rather than a list joined in code: i18next
   * selects a plural form from one `count`, the separators between the four
   * belong to the language, and the same rule already governs the page meta line
   * and the free-cell sentence.
   */
  const exposureSummary = (name: string, tally: ExposureTally) => {
    const rated = ratedCells(tally);
    const fragment = (category: (typeof EXPOSURE_ORDER)[number]) =>
      t('dashboard.blocks.stats.exposureShare', {
        category: t(`planner.exposure.categories.${category}`),
        percent: share(tally[category], rated),
      });

    return t('dashboard.blocks.stats.exposureSummary', {
      garden: name,
      full: fragment('full'),
      morning: fragment('morning'),
      afternoon: fragment('afternoon'),
      shade: fragment('shade'),
    });
  };

  /**
   * One row of a Large section (round 4, A6).
   *
   * `A3Expert.dc.html` gives both list sections the SAME three-track grid —
   * `grid-template-columns: 120px minmax(0, 1fr) 120px; gap: 14px;
   * align-items: center; min-height: 42px` — a name that ellipsizes, a bar that
   * takes the room left, and a right-aligned figure. They were two flex rows
   * with the bar squeezed between them, so the figures of the two sections did
   * not line up with each other.
   *
   * ROUND 5 (B2) RE-PROPORTIONS IT. The artboard's own gardens are « Terrasse »,
   * « Balcon sud » and « Potager du fond », and 120 px holds them; real ones do
   * not fit — « Test Template… », « Another anoth… » — while the bar beside them
   * took a whole 248 px to say one percentage. The label track goes to 160 px,
   * which is about nineteen characters at 15 px semibold instead of about
   * fourteen, and the bar keeps 212 px of the 516 a Large card offers:
   * 160 + 14 + 212 + 14 + 116.
   *
   * The last track becomes 116 px rather than `auto`, and that is the second
   * half of the fix. Each row is its own grid, so an `auto` track sized itself
   * on ITS OWN content: « 20 m² · 68 % » and « 3 m² · 50 % » are not the same
   * width, and every bar in the section therefore ended at a different x. A
   * fixed maximum is what makes rows of separate grids line up, and the
   * `min-content` floor is what stops the figure being clipped on a card too
   * narrow to grant it — the bar collapses first, which is the right order.
   */
  const statRow = (
    key: string,
    name: string,
    middle: React.ReactNode,
    value: React.ReactNode
  ) => (
    <Box
      key={key}
      data-stat-row
      sx={{
        display: 'grid',
        gridTemplateColumns:
          'minmax(0, 160px) minmax(0, 1fr) minmax(min-content, 116px)',
        gap: '14px',
        alignItems: 'center',
        minHeight: 42,
      }}
    >
      <Typography
        sx={{
          minWidth: 0,
          fontSize: DASHBOARD_TYPE.body,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </Typography>
      {middle}
      {value}
    </Box>
  );

  const rowValue = (text: React.ReactNode) => (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '6px',
        whiteSpace: 'nowrap',
        fontSize: DASHBOARD_TYPE.secondary,
        fontWeight: 600,
        color: 'text.secondary',
      }}
    >
      {text}
    </Box>
  );

  /**
   * OCCUPATION PAR JARDIN — « Terrasse · [bar] · 20 m² · 68 % » (round 4, A6).
   *
   * The surface was nowhere on these rows; the artboard prints it beside the
   * percentage, which is what turns a share into a quantity — 68 % of a 20 m²
   * terrace and 68 % of a 3 m² balcony are not the same news.
   */
  const occupancyRows = (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {views.map(({ garden, view }) =>
        statRow(
          garden.id,
          garden.name,
          // B3 — the marker sits where the VALUE goes, and the bar track is
          // left empty. It used to be the middle child, and a `MissingDataMark`
          // is a grid item like any other: stretched across a whole `1fr` track
          // it drew a 212 px dashed lozenge that read as an empty bar, which is
          // the one thing rule 4 of the design contract forbids a missing
          // figure from looking like. In the value column it keeps its natural
          // width, right-aligned where `A3Expert` puts « 20 m² · 68 % » — and
          // it replaces the « — » that stood there saying nothing.
          view.hasPlan ? (
            <OccupancyBar percent={view.occupancyPercent} valueHidden stretch />
          ) : (
            <Box />
          ),
          rowValue(
            view.hasPlan ? (
              t('dashboard.blocks.stats.occupancyValue', {
                surface: surfaceText(view.surfaceM2),
                percent: percentText(view.occupancyPercent),
              })
            ) : (
              <MissingDataMark label={t('dashboard.blocks.stats.noPlan')} />
            )
          )
        )
      )}
    </Box>
  );

  /**
   * EXPOSITION DOMINANTE — ONE segmented bar, then a legend (round 4, A6).
   *
   * It was a vertical list of four 42 px rows, one per category. `A3Expert`
   * draws a single 16 px strip and puts the four figures under it as pastilles:
   *
   *   <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:8px">
   *     <span class="lg"><span class="sw-ex ex-full"></span>Plein soleil
   *       <span class="num">54 %</span></span>…
   *
   * 168 px of rows become about 64, which is the single biggest reason the
   * Large card stopped scrolling inside itself (V7) — see the widget docstring.
   * A bar is also the right shape for four shares of one whole, which four
   * separate lines never state.
   */
  const distributionRows = (
    <Box>
      <ExposureBar tally={distribution} height={16} />
      <Box
        sx={{
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          mt: '8px',
        }}
      >
        {EXPOSURE_ORDER.map((category) => (
          <Box
            key={category}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: DASHBOARD_TYPE.secondary,
              fontWeight: 600,
              color: 'text.secondary',
            }}
          >
            <ExposureDot category={category} size={12} />
            {/* The LONG label here — « afternoon sun », not « afternoon ». The
                short form exists for the table, where the column is 51 px. */}
            <Box component="span">
              {t(`planner.exposure.categories.${category}`)}
            </Box>
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {share(distribution[category], totalRated)}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );

  /**
   * EXPOSITION PAR JARDIN — a segmented bar per garden, the dominant share on
   * the right (round 4, A6).
   *
   * `A3Expert` gives each garden its own 12 px strip and closes the row with the
   * dominant category's swatch and its percentage — « ▨ 62 % ». The rows named
   * the dominant category in words and said nothing about the other three, so
   * two gardens that are 62 % and 98 % full sun read exactly alike.
   *
   * The name of the dominant category has not been lost: it is what the swatch
   * stands for, and the accessible label carries it in words, so the row still
   * says which exposure the figure is about without colour being the signal.
   */
  const perGardenExposureRows = (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {views.map(({ garden, view }) => {
        const rated = ratedCells(view.exposure);

        return statRow(
          garden.id,
          garden.name,
          view.dominantExposure ? (
            // NAMED, where the aggregate bar above is decorative (round 5, C1):
            // this is the only place a garden's four shares are stated at all.
            <ExposureBar
              tally={view.exposure}
              height={12}
              label={exposureSummary(garden.name, view.exposure)}
            />
          ) : (
            // B3, again: the marker belongs in the value column, not stretched
            // across the bar's track.
            <Box />
          ),
          view.dominantExposure
            ? rowValue(
                <>
                  <ExposureDot category={view.dominantExposure} size={12} />
                  {/* The swatch is the artboard's whole right column, and a
                      colour alone is not a label. The name of the category
                      travels with the figure for assistive technology; on
                      screen it is the LEGEND of the section directly above
                      that maps each colour to its name, which is how the
                      artboard resolves it too — and adding the word here would
                      cost the 120 px track the figure needs. */}
                  <Box component="span" sx={visuallyHidden}>
                    {t(`planner.exposure.categories.${view.dominantExposure}`)}
                  </Box>
                  <Box
                    component="span"
                    sx={{ fontWeight: 700, color: 'text.primary' }}
                  >
                    {share(view.exposure[view.dominantExposure], rated)}
                  </Box>
                </>
              )
            : rowValue(
                <MissingDataMark label={t('dashboard.blocks.stats.noPlan')} />
              )
        );
      })}
    </Box>
  );

  /**
   * « N cases libres, dont M en plein soleil » — two counts, each with its own
   * cardinality (round 1, E15 / E16 / G7).
   *
   * i18next selects a plural form from ONE variable, `count`, so a sentence
   * carrying two numbers could only ever agree with the first: « 1 cases libres,
   * dont 1 en plein soleil ». Each count is rendered by its own plural-aware key
   * and the wrapper only joins the two fragments.
   */
  const freeCellsLine = (
    <Typography
      sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
    >
      {t('dashboard.blocks.stats.freeCells', {
        free: t('dashboard.blocks.stats.freeCellsCount', { count: totalFree }),
        sunny: t('dashboard.blocks.stats.sunnyCount', {
          count: freeDistribution.full,
        }),
      })}
    </Typography>
  );

  /**
   * The card's own two figures, and where each size states them.
   *
   * Small and Medium open on the big surface, as they always have. LARGE states
   * it in the HEADER CHIP instead (round 5, A10-7) — `A3Expert.dc.html` writes
   * `<span class="pill n num">42,5 m² · occupation moyenne 67 %</span>` in the
   * `.hd-r` of this widget and then goes straight to `<div class="sec-t">
   * Occupation par jardin</div>`, with no headline at all. Printing both would
   * state « 42,5 m² » twice in one card, 60 px apart.
   *
   * The second line — « 68 cases actives · 40 plantées » — STAYS at every size,
   * chip or no chip. The artboard drops it on the Large card, and rule 3 of the
   * design contract does not allow that: « plus la taille est grande, plus il y
   * a d'informations — jamais un contenu différent », and a Large card that
   * showed less than the Medium one would be exactly that.
   *
   * `data-stats-surface` stays on whichever node carries the surface ALONE, so
   * it never has to be parsed out of a longer sentence — the Large card's total
   * is asked for through `data-stats-chip` instead.
   */
  const headline = (withSurface: boolean) => (
    <Box>
      {withSurface && (
        <Typography
          data-stats-surface
          sx={{ fontSize: DASHBOARD_TYPE.big, fontWeight: 800, lineHeight: 1.1 }}
        >
          {surfaceText(totalSurface)}
        </Typography>
      )}
      <Typography
        sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
      >
        {/* Same two-count rule as the free-cell line above. */}
        {t('dashboard.blocks.stats.activeCells', {
          active: t('dashboard.blocks.stats.activeCellsCount', {
            count: totalActive,
          }),
          occupied: t('dashboard.blocks.stats.occupiedCount', {
            count: totalOccupied,
          }),
        })}
      </Typography>
    </Box>
  );

  /**
   * « 42,5 m² · occupation moyenne 67 % » — the header chip of the Large card
   * (round 5, A10-7), with our own figures.
   *
   * `A3Expert.dc.html` gives it `.pill.n`, the same neutral fill as the Gardens
   * and Conseils chips, so it is drawn from the same two tokens (A10-5).
   *
   * The occupancy is the card's own OVERALL share — planted cells over plantable
   * cells across every drawn garden — and not the mean of the per-garden
   * percentages. It is the figure every other number on the card is consistent
   * with, and it is the one that does not let a 3 m² balcony weigh as much as a
   * 20 m² terrace. (The artboard's own trio, 68 / 50 / 77 on 20 / 3 / 19,5 m²,
   * gives neither 67 % by mean nor by weight: its numbers are drawn, not
   * derived.)
   */
  const headerChip = (
    <Chip
      data-stats-chip
      label={t('dashboard.blocks.stats.headerChip', {
        surface: surfaceText(totalSurface),
        percent: percentText(
          totalActive > 0 ? (totalOccupied / totalActive) * 100 : 0
        ),
      })}
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

  const smallBody = () => (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {headline(true)}
      {freeCellsLine}
    </Box>
  );

  const mediumBody = () => (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {headline(true)}
      {sectionTitle(t('dashboard.blocks.stats.occupancySection'))}
      {occupancyRows}
      {freeCellsLine}
    </Box>
  );

  const largeBody = () => (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {headline(false)}
      {sectionTitle(t('dashboard.blocks.stats.occupancySection'))}
      {occupancyRows}
      {sectionTitle(
        t('dashboard.blocks.stats.exposureSection', {
          season: t(`planner.exposure.seasons.${DASHBOARD_SEASON}`),
          moment: t(`planner.exposure.moments.${DASHBOARD_MOMENT}`),
        })
      )}
      {distributionRows}
      {sectionTitle(t('dashboard.blocks.stats.perGardenExposureSection'))}
      {perGardenExposureRows}
      {freeCellsLine}
    </Box>
  );

  const body = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={42} />
          ))}
        </Box>
      );
    }

    if (loadError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography
            sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}
          >
            {t('dashboard.loadError')}
          </Typography>
          <Button size="small" onClick={onRetry}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      );
    }

    if (gardens.length === 0) {
      return (
        <InviteState
          icon={<InsightsOutlinedIcon />}
          message={t('dashboard.blocks.stats.empty')}
          variant="catalogue"
        />
      );
    }

    if (planned.length === 0) {
      // Every garden exists but none has a layout: there is a gesture, and it
      // is in the planner, so this one is an invitation rather than a statement.
      return (
        <InviteState
          icon={<InsightsOutlinedIcon />}
          message={t('dashboard.blocks.stats.noPlans')}
          variant="catalogue"
        />
      );
    }

    if (size === 'small') return smallBody();
    if (size === 'medium') return mediumBody();
    return largeBody();
  };

  return (
    <DashboardBlock
      blockKey="stats"
      title={t('dashboard.blocks.stats.title')}
      size={size}
      editing={editing}
      // Only where the artboard puts it, and only when the figures exist: a
      // card that is loading, has failed, has no garden or has no drawn plan
      // has no surface and no occupancy to state.
      chip={
        size === 'large' && !loading && !loadError && planned.length > 0
          ? headerChip
          : undefined
      }
    >
      {body()}
    </DashboardBlock>
  );
}
