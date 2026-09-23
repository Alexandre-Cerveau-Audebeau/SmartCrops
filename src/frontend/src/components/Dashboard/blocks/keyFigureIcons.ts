import type { SvgIconComponent } from '@mui/icons-material';
import AgricultureOutlinedIcon from '@mui/icons-material/AgricultureOutlined';
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import DonutLargeOutlinedIcon from '@mui/icons-material/DonutLargeOutlined';
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined';
import ExploreOffOutlinedIcon from '@mui/icons-material/ExploreOffOutlined';
import FilterVintageOutlinedIcon from '@mui/icons-material/FilterVintageOutlined';
import GrassOutlinedIcon from '@mui/icons-material/GrassOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import ShoppingBasketOutlinedIcon from '@mui/icons-material/ShoppingBasketOutlined';
import SpaOutlinedIcon from '@mui/icons-material/SpaOutlined';
import SquareFootOutlinedIcon from '@mui/icons-material/SquareFootOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
import type { KeyFigure } from './keyFiguresOptions';

/**
 * SMA-437 lot 1, PR B, step B4 — the glyph of each of the 22 figures, the one
 * V3-04 draws before its label: every path of its icon table matched against
 * `@mui/icons-material` 7.3.11, the Outlined drawing where the artboard's is
 * the Outlined one. Three cells share `GridOn` and two `WbSunny`, as they do
 * on the artboard: the label tells them apart.
 *
 * A plain lookup in its OWN module so the components that read it stay
 * component-only files (react-refresh/only-export-components) — the rule
 * `blockIcons.ts` keeps.
 */
export const KEY_FIGURE_ICONS: Record<KeyFigure, SvgIconComponent> = {
  gardens: YardOutlinedIcon,
  plants: GrassOutlinedIcon,
  varieties: FilterVintageOutlinedIcon,
  edible: ShoppingBasketOutlinedIcon,
  ornam: LocalFloristOutlinedIcon,
  surface: SquareFootOutlinedIcon,
  active: GridOnOutlinedIcon,
  planted: GridOnOutlinedIcon,
  occupancy: DonutLargeOutlinedIcon,
  free: GridOnOutlinedIcon,
  freeSun: WbSunnyOutlinedIcon,
  sunShare: WbSunnyOutlinedIcon,
  prune: ContentCutOutlinedIcon,
  sow: SpaOutlinedIcon,
  harvest: AgricultureOutlinedIcon,
  flower: LocalFloristOutlinedIcon,
  todo: TaskAltOutlinedIcon,
  tips: TipsAndUpdatesOutlinedIcon,
  noplan: DrawOutlinedIcon,
  noorient: ExploreOffOutlinedIcon,
  located: LocationOnOutlinedIcon,
  cities: LocationCityOutlinedIcon,
};
