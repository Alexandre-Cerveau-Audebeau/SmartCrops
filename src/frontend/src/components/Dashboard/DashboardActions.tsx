import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import type { SaveState } from '../../hooks/useDashboardPreferences';
import { DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import { useDashboardTokens } from '../../theme/useDashboardTokens';
import type { DashboardLevel } from '../../types/Dashboard';

export interface DashboardActionsProps {
  /** The formula the level chip names. */
  level: DashboardLevel;
  /** The page departs from its formula's layout: the chip reads « · ajustée ». */
  adjusted: boolean;
  /** The layout is loading or could not be read: no chip, Edit and Customize disabled. */
  unavailable: boolean;
  /** Where the debounced save of the layout stands. */
  saveState: SaveState;
  /** The page is in Edit mode. */
  editing: boolean;
  /** Enters (`true`) or leaves (`false`) the Edit mode. */
  onEditingChange: (editing: boolean) => void;
  /** Opens the Customize panel. */
  onCustomize: () => void;
  /** Opens the create-a-garden dialog. */
  onCreate: () => void;
}

/**
 * SMA-437, lot V39 — the actions zone of the dashboard's header: the level
 * chip, the save indicator and the page's buttons, lifted out of
 * `GardensDashboard` so the compact action bar can draw the same buttons.
 *
 * « Modifier » and « Terminé » are ONE button (A-10.5): the same `Button` at
 * the same place of the tree, whose variant, glyph, label and action follow
 * `editing`. React keeps its DOM node, and the focus stays on it — at the
 * click and at the keyboard. The header used to draw one button per mode, and
 * the one pressed was unmounted: the focus fell to the `<body>` (measured in
 * Chrome by the lot's pre-flight).
 */
export default function DashboardActions({
  level,
  adjusted,
  unavailable,
  saveState,
  editing,
  onEditingChange,
  onCustomize,
  onCreate,
}: DashboardActionsProps) {
  const { t } = useTranslation();
  const tk = useDashboardTokens();
  const levelName = t(`dashboard.levels.${level}.name`);

  return (
    <Box
      data-dashboard-actions
      sx={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
    >
      {!unavailable && (
        /* A GLYPH before the label (round 5, A10-11). `Main.dc.html` puts
           one in front of each of the four header elements, and this was
           the one without: `<span class="lvl"><svg class="ic" …/>Vue
           Jardinier</span>`, whose path is `@mui/icons-material`'s `Tune`,
           matched attribute for attribute. `.lvl .ic { color: var(--prim) }`
           — the glyph is the chip's one coloured mark, like the glyph of a
           widget header. The outline stays: `.lvl` is the one chip of the
           page the artboard draws with a border rather than a fill. */
        <Chip
          data-level-chip
          icon={<TuneOutlinedIcon />}
          label={t(
            adjusted ? 'dashboard.levelChipAdjusted' : 'dashboard.levelChip',
            { level: levelName }
          )}
          variant="outlined"
          // `.lvl` verbatim (round 6, N5-5): `height: 32px; padding: 0 13px
          // 0 10px; border-radius: 16px; gap: 7px; font-size: 13px;
          // font-weight: 600`. A `size="small"` chip was 24 px high.
          sx={{
            height: 32,
            borderRadius: '16px',
            fontSize: 13,
            fontWeight: 600,
            // `.lvl { border: 1px solid var(--chip-bd); background: var(--card) }`
            borderColor: tk.chipBorder,
            backgroundColor: 'background.paper',
            '& .MuiChip-icon': { color: 'primary.main', fontSize: 18, ml: '10px', mr: 0 },
            '& .MuiChip-label': { pl: '7px', pr: '13px' },
          }}
        />
      )}
      {saveState !== 'idle' && (
        <Typography
          role="status"
          sx={{
            fontSize: `${DASHBOARD_TYPE.chip}px`,
            color: saveState === 'error' ? 'error.main' : 'text.secondary',
          }}
        >
          {t(`dashboard.save.${saveState}`)}
        </Typography>
      )}
      {/* ONE button for « Modifier » and « Terminé » (A-10.5) — see the
          docblock. `EditOutlined` (round 6, N5-6): the path `Main.dc.html`
          draws on « Modifier », matched attribute for attribute; « Terminé »
          is filled and carries no glyph. Disabled like « Personnaliser »
          while the layout is unavailable — « Terminé » never is. */}
      <Button
        data-page-action="edit"
        variant={editing ? 'contained' : 'outlined'}
        startIcon={editing ? undefined : <EditOutlinedIcon />}
        onClick={() => onEditingChange(!editing)}
        disabled={!editing && unavailable}
      >
        {t(editing ? 'dashboard.done' : 'dashboard.edit')}
      </Button>
      {/* In BOTH modes (A-7, Alexandre 25/09): the compact action bar carries
          « Personnaliser » in Edit mode and never adds a control the header
          lacks. `DashboardCustomizeOutlined`, and not `TuneRounded` (round 5,
          A10-11). The two glyphs were swapped: the artboard draws the four
          squares of `DashboardCustomizeOutlined` on « Personnaliser » and
          keeps the sliders of `Tune` for the level chip, and the page had the
          sliders here and nothing on the chip. Putting the chip's glyph back
          without moving this one would have drawn the same sliders twice,
          side by side, on two controls that do different things. Both paths
          were matched against `@mui/icons-material` attribute for attribute. */}
      <Button
        data-page-action="customize"
        variant="outlined"
        startIcon={<DashboardCustomizeOutlinedIcon />}
        onClick={onCustomize}
        disabled={unavailable}
      >
        {t('dashboard.customize')}
      </Button>
      {/* The one button that depends on the mode: gone in Edit mode, as
          before (A-7). `Add` (round 6, N5-7): the path `Main.dc.html` draws
          on « Créer un jardin ». */}
      {!editing && (
        <Button
          data-create-garden
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreate}
        >
          {t('gardens.createGarden')}
        </Button>
      )}
    </Box>
  );
}
