import type { SvgIconComponent } from '@mui/icons-material';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import SpaOutlinedIcon from '@mui/icons-material/SpaOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import type { TodoTaskKind } from './todoTasks';

/**
 * The glyph of each kind of task, matched path-for-path against the
 * artboards: `WaterDropOutlined`, `AcUnitOutlined` (SMA-336 PR 3b/5), and —
 * PR 4a/5 — `ContentCutOutlined` for « Tailler » and `SpaOutlined` for
 * « Semer » (`Main.dc.html`, the four Medium rows).
 *
 * In a module of its own since SMA-448, lot F2: the Novice card draws the
 * task of the day with the same glyph as the « À faire » widget, from the one
 * table — and a component file exports components only
 * (react-refresh/only-export-components).
 */
export const TASK_ICONS: Record<TodoTaskKind, SvgIconComponent> = {
  water: WaterDropOutlinedIcon,
  prune: ContentCutOutlinedIcon,
  sow: SpaOutlinedIcon,
  cold: AcUnitOutlinedIcon,
  frost: AcUnitOutlinedIcon,
};
