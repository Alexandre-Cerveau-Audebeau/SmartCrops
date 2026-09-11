import Box from '@mui/material/Box';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import { EXPOSURE_ORDER, type ExposureTally } from '../../utils/gardenStats';

interface Props {
  /** Cells rated in each category — the shares are derived from their sum. */
  tally: ExposureTally;
  /** 16 px for the whole-page bar, 12 px on a per-garden row (`A3Expert`). */
  height: number;
  /**
   * The complete distribution in words, for assistive technology (round 5, C1).
   *
   * WITH it the bar is an `img` carrying this as its alternative text; WITHOUT
   * it the bar stays decorative — see the component docstring for which caller
   * is which, and why.
   */
  label?: string;
}

/**
 * SMA-336 round 4 (A6) — the exposure distribution as ONE segmented bar.
 *
 * `A3Expert.dc.html` draws it twice, and both times as a single rounded strip
 * whose four segments are the four shares:
 *
 *   <div style="display:flex; height:16px; border-radius:999px; overflow:hidden">
 *     <span class="ex-full"      style="width:54%"></span>
 *     <span class="ex-morning"   style="width:18%"></span>
 *     <span class="ex-afternoon" style="width:17%"></span>
 *     <span class="ex-shade"     style="width:11%"></span>
 *   </div>
 *
 * The widget had four stacked rows instead, one per category — three sections of
 * four 42 px lines in a card that offers about 200, which is what made the Large
 * Statistics card scroll inside itself (V7). A bar is also the honest shape for
 * a set of shares that sum to a whole: four lines state four numbers, a bar
 * states the proportion between them.
 *
 * The colours are the PLANNER's, verbatim, like {@link ExposureDot}: a cell the
 * planner paints « full sun » and a dashboard segment that calls it something
 * else would be the same garden disagreeing with itself.
 *
 * DECORATIVE BY DEFAULT — `aria-hidden` — and that is right for the AGGREGATE
 * bar: the legend directly under it prints all four categories with all four
 * percentages, so the strip is the picture of a figure already written down, and
 * announcing it again would read the same distribution twice.
 *
 * It is NOT right for a per-garden bar, and round 5 (C1) fixes that. Those rows
 * print only the dominant category and its share, the legend above them carries
 * the whole-page distribution and not each garden's, and the bar itself was
 * hidden — so the other three shares of a given garden existed nowhere a screen
 * reader could reach. A caller that has no other way to state the distribution
 * passes `label`, and the bar becomes an `img` with that text as its
 * alternative; a caller whose figures are already written out passes nothing and
 * the bar stays what it was. Colour is therefore never the only signal, which is
 * the rule § 7 of the design contract sets for every chip and swatch of this
 * page.
 *
 * The empty tally renders the track alone. A garden whose plan rates no cell is
 * the only way there is, and an empty strip says « nothing measured » where four
 * zero-width segments would say nothing at all.
 */
export default function ExposureBar({ tally, height, label }: Props) {
  const tk = usePlannerTokens();
  const total = EXPOSURE_ORDER.reduce(
    (sum, category) => sum + tally[category],
    0
  );

  return (
    <Box
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
      data-exposure-bar
      sx={{
        display: 'flex',
        width: '100%',
        minWidth: 0,
        height,
        borderRadius: '999px',
        overflow: 'hidden',
        backgroundColor: 'action.hover',
      }}
    >
      {total > 0 &&
        EXPOSURE_ORDER.filter((category) => tally[category] > 0).map(
          (category) => (
            <Box
              key={category}
              sx={{
                width: `${(tally[category] / total) * 100}%`,
                backgroundColor: tk.expo[category].fill,
              }}
            />
          )
        )}
    </Box>
  );
}
