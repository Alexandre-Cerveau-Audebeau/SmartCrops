import Box from '@mui/material/Box';
import { useDashboardTokens } from '../../theme/useDashboardTokens';

interface Props {
  label: string;
}

/**
 * SMA-336 PR 2/5 — the invitation motif at the size of a table CELL.
 *
 * `InviteState` says « this widget has nothing » across a whole card. This says
 * « this figure is missing » in the place the figure would have been, which is
 * what the frozen design calls the marker at the exact spot of the data.
 *
 * It carries NO gesture, and that is deliberate in this lot: the design gives
 * the unlocated weather cell an « Add » link, but the endpoint behind it lands
 * in PR 3/5, and PR 1/5 settled that a control which does nothing is worse than
 * saying « soon ».
 */
export default function MissingDataMark({ label }: Props) {
  const tk = useDashboardTokens();

  return (
    <Box
      component="span"
      data-missing-mark
      sx={{
        display: 'inline-block',
        px: '8px',
        py: '2px',
        borderRadius: '8px',
        fontSize: 13,
        color: 'text.secondary',
        backgroundColor: tk.invBg,
        border: `1px dashed ${tk.invBd}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  );
}
