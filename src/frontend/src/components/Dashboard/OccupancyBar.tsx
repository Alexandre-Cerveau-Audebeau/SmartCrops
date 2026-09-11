import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import { formatCount } from '../../utils/formatNumber';

interface Props {
  percent: number;
  /**
   * Draw the track alone (round 4, A6).
   *
   * `A3Expert.dc.html` puts the Statistics rows on a three-column grid —
   * `120px minmax(0, 1fr) 120px` — with the bar in the middle and « 20 m² ·
   * 68 % » in the third column, so the figure travels with the surface rather
   * than with the bar. The Gardens table has no such column and keeps the
   * figure here.
   */
  valueHidden?: boolean;
  /**
   * Let the track fill its column instead of stopping at 64 px (round 4, A6).
   *
   * The cap is what keeps the table's 84 px OCCUPATION cell narrow; the
   * Statistics grid gives the bar a whole `minmax(0, 1fr)` track and a capped
   * bar would float in it.
   */
  stretch?: boolean;
}

/**
 * SMA-336 PR 2/5 — the occupancy bar of the Gardens table and the Statistics
 * rows: a track, a fill, and the figure beside it.
 *
 * The number is written out, not left to the bar. A bar alone states a
 * proportion by length only, which neither a screen reader nor a
 * colour-blind reader can take — and the frozen design prints the percentage
 * next to it for exactly that reason.
 */
export default function OccupancyBar({
  percent,
  valueHidden = false,
  stretch = false,
}: Props) {
  const { i18n } = useTranslation();
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        ...(stretch && { width: '100%', minWidth: 0 }),
      }}
    >
      {/* 9 px, and fully rounded (round 5, A10-8). `Main.dc.html` l. 172:
          `.bar { height: 9px; border-radius: 999px; background: var(--track);
          overflow: hidden }` over `.bar i { height: 100%; border-radius: 999px;
          background: var(--prim) }`. The bar was 6 px on a 3 px radius, which
          at a 10 % fill drew a sliver too thin to read as a quantity. */}
      <Box
        aria-hidden
        data-occupancy-track
        sx={{
          flex: 1,
          minWidth: stretch ? 0 : 28,
          ...(stretch ? null : { maxWidth: 64 }),
          height: 9,
          borderRadius: '999px',
          backgroundColor: 'action.hover',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${clamped}%`,
            height: '100%',
            borderRadius: '999px',
            backgroundColor: 'primary.main',
          }}
        />
      </Box>
      {valueHidden ? null : (
      <Typography
        component="span"
        sx={{
          fontSize: DASHBOARD_TYPE.body,
          fontWeight: 700,
          // Round 2: « 10 % » was breaking across two lines in the Gardens
          // table's OCCUPATION cell. The space between the figure and the sign
          // is an ordinary one, so a squeezed column was free to wrap there —
          // and a percentage split over two lines is not a percentage. The
          // cell is narrow by design (84 px); this is what keeps the figure
          // whole in it.
          whiteSpace: 'nowrap',
        }}
      >
        {/* Locale-formatted, like every other figure of the three widgets
            (round 1, G5) — the percentage is whole, but the rule is that no
            number reaches the screen through raw concatenation. */}
        {`${formatCount(clamped, i18n.language)} %`}
      </Typography>
      )}
    </Box>
  );
}
