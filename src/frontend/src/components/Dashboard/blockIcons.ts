import type { SvgIconComponent } from '@mui/icons-material';
import AgricultureOutlinedIcon from '@mui/icons-material/AgricultureOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
import type { DashboardBlockKey } from '../../types/Dashboard';

/**
 * SMA-336 — one icon per widget: the title row (amendment A2), the invitation
 * panels and the Customize gallery all read this table.
 *
 * ROUND 4 — the eight are no longer chosen, they are IDENTIFIED. Every `<svg
 * class="ic">` the frozen artboards put before a `<span class="hd-t">` was
 * matched path-for-path against `@mui/icons-material`, and each of the seven
 * titled widgets resolved to exactly one icon (`TaskAlt` and `TaskAltOutlined`
 * are the same drawing under two names; `Insights` likewise). Four entries were
 * a near-enough guess and moved:
 *
 * - tips     `LightbulbOutlined`          → `TipsAndUpdatesOutlined` (bulb + sparks)
 * - todo     `ChecklistOutlined`          → `TaskAltOutlined` (tick in a ring)
 * - counters `FormatListNumberedOutlined` → `LocalFloristOutlined` (a flower)
 * - stats    `QueryStatsOutlined`         → `InsightsOutlined` (line + sparks)
 *
 * Four were already exact and stay: gardens `YardOutlined`, month
 * `CalendarMonthOutlined`, harvest `AgricultureOutlined`, and weather.
 *
 * Weather is the one the artboards do not title: its card opens on the place
 * name (`.wx-place`, a `LocationOnOutlined` pin) rather than on a `.hd` row, so
 * there is no header glyph to match. `WbSunnyOutlined` is kept — it is the
 * artboard's own 44 px hero icon for the widget, matched path-for-path, so the
 * title row borrows the drawing the card already carries.
 *
 * A plain lookup in its OWN module so the components that read it stay
 * component-only files (react-refresh/only-export-components).
 */
export const BLOCK_ICONS: Record<DashboardBlockKey, SvgIconComponent> = {
  weather: WbSunnyOutlinedIcon,
  gardens: YardOutlinedIcon,
  tips: TipsAndUpdatesOutlinedIcon,
  month: CalendarMonthOutlinedIcon,
  todo: TaskAltOutlinedIcon,
  counters: LocalFloristOutlinedIcon,
  stats: InsightsOutlinedIcon,
  harvest: AgricultureOutlinedIcon,
};
