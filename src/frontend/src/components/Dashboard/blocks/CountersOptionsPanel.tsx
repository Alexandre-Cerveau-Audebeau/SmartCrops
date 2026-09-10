import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import type { DashboardGardenData } from '../../../types/DashboardData';
import {
  COUNTERS_GARDEN_ALL,
  countersOptions,
  resolveCountersGarden,
} from './countersOptions';

interface Props {
  options: Record<string, unknown> | null;
  gardens: DashboardGardenData[];
  onChange: (options: Record<string, unknown>) => void;
}

/**
 * SMA-336 PR 2/5 — the two settings the frozen design gives the Counters widget
 * (artboard A8): « Plant photos » and « Garden ».
 *
 * They write to `DashboardBlock.options`, the free-form document PR 1/5 stored
 * and round-tripped without ever writing to it — this is the first lot that
 * does. The whole document is replaced on each change rather than patched:
 * that is how the layout PUT works, and a partial write would have to guess
 * what the other half currently holds.
 *
 * Changing an option does NOT make the layout « adjusted ». The level chip
 * tracks what the user REARRANGED — order, size, visibility — and turning plant
 * photos on is not a rearrangement. `isAdjusted` excludes options on purpose;
 * this panel is the reason that exclusion exists.
 */
export default function CountersOptionsPanel({
  options,
  gardens,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const current = countersOptions(options);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={current.photos}
            onChange={(event) =>
              onChange({ ...current, photos: event.target.checked })
            }
          />
        }
        label={t('dashboard.blocks.counters.options.photos')}
        slotProps={{ typography: { fontSize: 14 } }}
      />
      <TextField
        select
        size="small"
        fullWidth
        label={t('dashboard.blocks.counters.options.garden')}
        // A stored id whose garden is gone would leave the select with no
        // matching item, and MUI renders that as an empty box the user cannot
        // read. Falling back to « all » shows the truth: no filter applies —
        // and the rule is `countersOptions`' now, so this select and the
        // widget's own list cannot drift apart (round 1, E8).
        value={resolveCountersGarden(current.garden, gardens)}
        onChange={(event) => onChange({ ...current, garden: event.target.value })}
      >
        <MenuItem value={COUNTERS_GARDEN_ALL}>
          {t('dashboard.blocks.counters.allGardens')}
        </MenuItem>
        {gardens.map((garden) => (
          <MenuItem key={garden.id} value={garden.id}>
            {garden.name}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
}
