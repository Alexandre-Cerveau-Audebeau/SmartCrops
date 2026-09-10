import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
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

  /**
   * One option row (round 4, A7) — `A8Options.dc.html`'s `.pop-r`:
   * `display: flex; align-items: center; gap: 14px; height: 48px`, opening on a
   * 22 px glyph. The panel had none, so two settings of very different weight —
   * a switch and a whole garden filter — read as one undifferentiated column.
   *
   * The two glyphs are the artboard's own, matched path-for-path:
   * `PhotoCameraOutlined` for the photos switch and `YardOutlined` for the
   * garden select — the SAME drawing the Gardens widget carries in its title,
   * which is what says the filter is about those gardens.
   */
  const optionRow = (icon: React.ReactNode, control: React.ReactNode) => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        minHeight: 48,
      }}
    >
      <Box
        aria-hidden
        sx={{
          display: 'flex',
          flexShrink: 0,
          color: 'text.secondary',
          '& > svg': { fontSize: 22 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>{control}</Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {optionRow(
        <PhotoCameraOutlinedIcon />,
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
          slotProps={{ typography: { fontSize: 15 } }}
          sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
          labelPlacement="start"
        />
      )}
      {optionRow(
        <YardOutlinedIcon />,
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
      )}
    </Box>
  );
}
