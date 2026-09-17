import type { SvgIconComponent } from '@mui/icons-material';
import BalconyIcon from '@mui/icons-material/Balcony';
import DeckIcon from '@mui/icons-material/Deck';
import GrassIcon from '@mui/icons-material/Grass';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';

/**
 * The glyph of a garden TYPE (round 6, N5-1 — moved here from `GardensBlock`
 * in SMA-336 PR 4b/5, decision T12, when the Tips widget drew it a second
 * time).
 *
 * `A2Novice.dc.html` draws `<span class="pill type"><svg class="ic" width="14">…
 * </svg>Terrasse</span>` with `.pill.type .ic { color: var(--prim) }`, and
 * `A3Expert.dc.html` l. 316-330 puts the same three drawings, at 17 px, before
 * each garden name of the Tips groups. The paths were matched attribute for
 * attribute against `@mui/icons-material`: `terrace` → `Deck`, `balcony` →
 * `Balcony`, `inground` → `Grass`. The artboards never draw a `greenhouse` or
 * an `indoor` garden; rather than invent a glyph for them, those two borrow the
 * Gardens widget's own (`YardOutlined`, the entry of `BLOCK_ICONS`), so no chip
 * is bare and nothing is drawn that the design did not draw somewhere.
 *
 * A plain lookup in its OWN module so the components that read it stay
 * component-only files (react-refresh/only-export-components).
 */
export const GARDEN_TYPE_ICONS: Record<string, SvgIconComponent> = {
  terrace: DeckIcon,
  balcony: BalconyIcon,
  inground: GrassIcon,
  greenhouse: YardOutlinedIcon,
  indoor: YardOutlinedIcon,
};

/**
 * The glyph for a garden's `config.gardenType`, or the Gardens widget's own
 * when the type is unknown or unset — the Tips groups always carry one
 * (`A3Expert.dc.html`), where the Medium Gardens chip carries none for a
 * garden without a type.
 */
export function gardenTypeIcon(gardenType: string | null): SvgIconComponent {
  return (gardenType ? GARDEN_TYPE_ICONS[gardenType] : undefined) ?? YardOutlinedIcon;
}
