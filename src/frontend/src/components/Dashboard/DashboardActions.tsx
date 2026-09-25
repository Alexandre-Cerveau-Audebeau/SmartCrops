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
  /** Opens the create-a-garden dialog — in Edit mode, once the mode is over. */
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
 *
 * The zone is three parts, V3-05's `.acts`: the chip and the indicator
 * (`.a-top`), the two buttons the compact action bar repeats (`.rep`), and
 * « Créer un jardin ». On a phone (§ 4.1 of the v3 contract, drawn again by
 * V3-05), one part per line: the chip and the indicator, then « Modifier » —
 * « Terminé » — and « Personnaliser » in two equal halves, then « Créer un
 * jardin » the whole width. The indicator speaks on the chip's line, so
 * nothing under the finger moves when it does — except in the one state that
 * does not hold on that line, the failure beside the adjusted chip, where it
 * wraps under the chip for as long as it shows (decision (a), Alexandre
 * 25/09). While the grid has two columns, 600 to 1 199 px (SMA-437, lot V39,
 * PR B, T0 — decided on 25/09, option (a) of the T0 report), the zone has its
 * own line under the title: the chip and the indicator, then « Modifier » —
 * « Terminé » —, « Personnaliser » and « Créer un jardin », the pair anchored
 * at the start of its line. At 1 024 px the failure beside the adjusted chip
 * does not fit beside the title: the zone went under it for as long as it
 * showed, and « Terminé » with it. From 1 200 px up, with the grid's four
 * columns, the header's row, as before.
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
      sx={{
        display: 'flex',
        // A phone: one part per line, 8 px apart, each the whole width of the
        // header (`.vp.ph .acts`). From 600 px: one row that wraps, 12 px
        // apart (`.acts`). While the grid has two columns (600 to 1 199 px)
        // the zone has a line of its own under the title, the whole width of
        // the header (T0); from 1 200 px, beside the title, as before.
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        flexWrap: { sm: 'wrap' },
        gap: { xs: '8px', sm: '12px' },
        width: { xs: '100%', lg: 'auto' },
      }}
    >
      {/* The chip and the indicator, on one line (`.a-top`). On a phone the
          line wraps, 10 px apart (`.vp.ph .a-top`): the one state too wide
          for it puts the indicator under the chip (decision (a)). From 600
          to 1 199 px the line is the zone's first, whole: the pair starts the next one,
          at its start, and stays there whatever the indicator says — before
          T0 the indicator pushed the pair along the row, or down under it. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
          gap: { xs: '10px', sm: 0 },
          flexBasis: { sm: '100%', lg: 'auto' },
        }}
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
        {/* The save indicator's live region: mounted ONCE and born EMPTY, the
            same node then carrying « Enregistrement… », « Enregistré » or the
            failure (A-10.6 — the rule of #278, A-6). A region inserted already
            filled is not announced, and this one was mounted only once it had
            something to say. Never `display: none` while empty: that would
            take it out of the accessibility tree, the defect over again. The
            same idiom as the create dialog's region in `GardensDashboard`.
            From 600 px its 12 px stand BEFORE it and only while it speaks —
            a gap of its line would widen the row by 12 px around an empty
            region (pre-flight, risk 13). */}
        <Typography
          role="status"
          data-save-status
          sx={{
            fontSize: `${DASHBOARD_TYPE.chip}px`,
            color: saveState === 'error' ? 'error.main' : 'text.secondary',
            '&:not(:empty)': { ml: { sm: '12px' } },
          }}
        >
          {saveState === 'idle' ? '' : t(`dashboard.save.${saveState}`)}
        </Typography>
      </Box>
      {/* The two buttons the compact action bar repeats, in ONE wrapper of
          their own (`.rep`): two equal halves on a phone (A-10.3), side by
          side from 600 px. */}
      <Box
        data-page-actions
        sx={{
          display: { xs: 'grid', sm: 'flex' },
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))' },
          gap: { xs: '8px', sm: '12px' },
        }}
      >
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
        {/* In BOTH modes (A-7, Alexandre 25/09): the compact action bar
            carries « Personnaliser » in Edit mode and never adds a control the
            header lacks. `DashboardCustomizeOutlined`, and not `TuneRounded`
            (round 5, A10-11). The two glyphs were swapped: the artboard draws
            the four squares of `DashboardCustomizeOutlined` on « Personnaliser
            » and keeps the sliders of `Tune` for the level chip, and the page
            had the sliders here and nothing on the chip. Putting the chip's
            glyph back without moving this one would have drawn the same
            sliders twice, side by side, on two controls that do different
            things. Both paths were matched against `@mui/icons-material`
            attribute for attribute. */}
        <Button
          data-page-action="customize"
          variant="outlined"
          startIcon={<DashboardCustomizeOutlinedIcon />}
          onClick={onCustomize}
          disabled={unavailable}
        >
          {t('dashboard.customize')}
        </Button>
      </Box>
      {/* In BOTH modes, and active (A-7 amended — Alexandre, 25/09, fix
          round 1 of #291): the header keeps its arrangement when the page
          enters Edit mode. On a phone « Créer un jardin » keeps its line under
          the pair, so « Terminé » stands where « Modifier » stood; on the
          desktop, where the header aligns the zone to the right, the right
          edge of « Terminé » stays at « Modifier »'s. In Edit mode it ENDS the
          mode first, then opens the dialog: the page behind the veil is back
          at rest, and the debounced save of the layout runs on under the
          dialog. The same node in both modes, so the dialog gives the focus
          back to it when it closes. The whole width on a phone, where the
          zone stretches its parts (`.vp.ph .acts > .btn`). `Add` (round 6,
          N5-7): the path `Main.dc.html` draws on « Créer un jardin ». */}
      <Button
        data-create-garden
        variant="contained"
        startIcon={<AddIcon />}
        onClick={() => {
          if (editing) onEditingChange(false);
          onCreate();
        }}
      >
        {t('gardens.createGarden')}
      </Button>
    </Box>
  );
}
