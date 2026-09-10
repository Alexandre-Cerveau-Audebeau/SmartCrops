import type { SvgIconComponent } from '@mui/icons-material';
import AgricultureOutlinedIcon from '@mui/icons-material/AgricultureOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import FormatListNumberedOutlinedIcon from '@mui/icons-material/FormatListNumberedOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
import type { DashboardBlockKey } from '../../types/Dashboard';

/**
 * SMA-336 — one icon per widget, used by the invitation panels and by the
 * Customize gallery. A plain lookup in its OWN module so the components that
 * read it stay component-only files (react-refresh/only-export-components).
 */
export const BLOCK_ICONS: Record<DashboardBlockKey, SvgIconComponent> = {
  weather: WbSunnyOutlinedIcon,
  gardens: YardOutlinedIcon,
  tips: LightbulbOutlinedIcon,
  month: CalendarMonthOutlinedIcon,
  todo: ChecklistOutlinedIcon,
  counters: FormatListNumberedOutlinedIcon,
  stats: QueryStatsOutlinedIcon,
  harvest: AgricultureOutlinedIcon,
};
