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
  /**
   * Whether `gardens` is the aggregate's answer (round 7, S13 — Extension
   * #6-5). It is ALSO what the hook hands out while the aggregate is still
   * loading, and after a failed replacement: an empty list both times, from
   * which `resolveCountersGarden` can only answer « all ». Edit mode is gated
   * on the LAYOUT being loaded, not on the aggregate, so this panel is
   * reachable in both states — and a photos toggle taken then would have
   * written « all » over a garden the user had chosen. Not `gardens.length`:
   * a successful empty answer is a known state, and « all » is its truth.
   */
  ready: boolean;
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
 *
 * A component at module scope rather than a closure rebuilt per render (round
 * 7, S12 — Extension #6-4): it closes over nothing, and this gives the
 * 48 / 14 / 22 px geometry one owner the other panels can reuse the day they
 * gain option rows of their own.
 */
function OptionRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
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
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

export default function CountersOptionsPanel({
  options,
  gardens,
  ready,
  onChange,
}: Props) {
  const { t } = useTranslation();
  // Resolved on READ and on WRITE (round 6, Extension #4-8 / #5-8): the select
  // showed `resolveCountersGarden(...)` while both `onChange` handlers spread
  // the parsed document with its possibly-dead id, so a user who toggled the
  // photos switch re-persisted a garden that no longer exists. The document a
  // reader gets back now names a garden that exists, and a future reader that
  // skips the resolver cannot regress. `countersOptions` carries the keys this
  // build does not own (Extension #4-11), and the spread keeps them.
  const parsed = countersOptions(options);
  const current = {
    ...parsed,
    garden: resolveCountersGarden(parsed.garden, gardens),
  };
  // What a write carries for the garden the user did NOT touch: the resolved
  // id once the aggregate has answered, the STORED id while it has not (round
  // 7, S13). The select still shows the resolved value — « all » is the only
  // garden an empty list can name — but showing it is not the same as
  // persisting it over a choice this render cannot see.
  const written = ready ? current : { ...current, garden: parsed.garden };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <OptionRow icon={<PhotoCameraOutlinedIcon />}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={current.photos}
              onChange={(event) =>
                onChange({ ...written, photos: event.target.checked })
              }
            />
          }
          label={t('dashboard.blocks.counters.options.photos')}
          slotProps={{ typography: { fontSize: 15 } }}
          sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
          labelPlacement="start"
        />
      </OptionRow>
      <OptionRow icon={<YardOutlinedIcon />}>
        <TextField
        select
        size="small"
        fullWidth
        label={t('dashboard.blocks.counters.options.garden')}
        // A stored id whose garden is gone would leave the select with no
        // matching item, and MUI renders that as an empty box the user cannot
        // read. Falling back to « all » shows the truth: no filter applies —
        // and the rule is `countersOptions`' now, so this select and the
        // widget's own list cannot drift apart (round 1, E8). Resolved once,
        // above, so the value shown is the value written.
        value={current.garden}
        onChange={(event) => onChange({ ...written, garden: event.target.value })}
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
      </OptionRow>
    </Box>
  );
}
