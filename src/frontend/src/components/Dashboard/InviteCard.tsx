import { useCallback, useId, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import IconDisc from './IconDisc';
import { DASHBOARD_INVITE_CARD as C, DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import { useDashboardTokens } from '../../theme/useDashboardTokens';

/**
 * Where the card stands: stuck at the FOOT of a zone that scrolls (contract
 * A-21, A-22), or in the MIDDLE of a card that has nothing else to say (A-23).
 */
export type InviteCardPlace = 'foot' | 'middle';

/**
 * The gesture: a link to where the state is resolved, a button that resolves
 * it, or — when several places resolve it — a menu that names each (A-21 [P]).
 */
export type InviteCardGesture =
  | { label: string; to: string }
  | { label: string; onClick: () => void }
  | { label: string; items: ReadonlyArray<{ key: string; label: string; to: string }> };

interface Props {
  place: InviteCardPlace;
  icon: ReactNode;
  title: string;
  body: string;
  gesture: InviteCardGesture;
}

/** The gesture's button: outlined, 34 px, the secondary size in bold — the Key figures' empty band's own. */
const GESTURE_SX = { minHeight: C.button, fontSize: DASHBOARD_TYPE.secondary, fontWeight: 700 } as const;

/**
 * SMA-437, lot V3-06 — the invitation's form (b) (contract § 4.8): the card
 * with a title, a body and a gesture, as V3-06 draws it (`.inv-card`): a
 * 40 px disc, the title 16 px / 800, the body 14 px, an outlined button of
 * 34 px, on the invitation's ground and its dashed border.
 *
 * Two places, one component (Alexandre, 28/09):
 * - `foot` (A-21, A-22) — the LAST child of a zone that scrolls,
 *   `position: sticky; bottom: 0`: while the zone scrolls the card stays at
 *   its bottom and what passes beneath is hidden — the invitation tint over
 *   the card at 92 %, a 7 px blur of what is behind (`.pin`); at the end of
 *   the zone it is back in the flow, after the last row, covering nothing.
 *   Where the zone does not scroll — a phone, whose Large card takes its
 *   height — `sticky` is the flow itself. The zone keeps a control focused
 *   at the keyboard above the card (`padZone`, below);
 * - `middle` (A-23) — in the middle of a card with nothing else to say,
 *   `margin: auto`, 520 px at most (`.inv-card.mid`), on its own ground.
 *
 * The title is a heading of the card, as the Key figures' empty band has it;
 * the disc is decorative (`IconDisc`).
 */
export default function InviteCard({ place, icon, title, body, gesture }: Props) {
  const tk = useDashboardTokens();
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const buttonId = `${id}-gesture`;
  const menuId = `${id}-menu`;

  /**
   * WCAG 2.4.11 (Focus Not Obscured), as the page's sticky bar holds it with
   * `scroll-padding-top`: a control of the zone focused at the keyboard is
   * scrolled into view ABOVE the foot, not under it. The zone's
   * `scroll-padding-bottom` is the foot's height and the zone's row gap,
   * kept by an observer as the foot's words wrap — measured in a real
   * engine without it, a « Voir la case » under the foot took the focus and
   * stayed wholly hidden: it was in the zone's view, and the zone did not
   * move. Written to the DOM by the callback ref that holds the node, and
   * taken back with it; no state.
   */
  const padZone = useCallback((foot: HTMLElement | null) => {
    const zone = foot?.parentElement;
    if (!foot || !zone || typeof ResizeObserver === 'undefined') return;
    const pad = () => {
      // The foot's height to the pixel above — never a fraction of a line left under it.
      const height = Math.ceil(foot.getBoundingClientRect().height);
      zone.style.scrollPaddingBottom = `${height + (parseFloat(getComputedStyle(zone).rowGap) || 0)}px`;
    };
    pad();
    const observer = new ResizeObserver(pad);
    observer.observe(foot);
    return () => {
      observer.disconnect();
      zone.style.scrollPaddingBottom = '';
    };
  }, []);

  const action =
    'to' in gesture ? (
      <Button component={RouterLink} to={gesture.to} variant="outlined" size="small" sx={GESTURE_SX}>
        {gesture.label}
      </Button>
    ) : 'items' in gesture ? (
      <>
        {/* The MUI menu pattern (the navbar's profile menu): the button names the menu it opens while it is open —
            the list itself, `role="menu"`, which carries the id rather than the popover around it. */}
        <Button
          id={buttonId}
          variant="outlined"
          size="small"
          aria-haspopup="true"
          aria-controls={anchor ? menuId : undefined}
          aria-expanded={anchor ? 'true' : undefined}
          endIcon={<ExpandMoreIcon />}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={GESTURE_SX}
        >
          {gesture.label}
        </Button>
        <Menu
          anchorEl={anchor}
          open={anchor !== null}
          onClose={() => setAnchor(null)}
          disableScrollLock
          slotProps={{ list: { id: menuId, 'aria-labelledby': buttonId } }}
        >
          {gesture.items.map((item) => (
            <MenuItem key={item.key} component={RouterLink} to={item.to} onClick={() => setAnchor(null)}>
              {item.label}
            </MenuItem>
          ))}
        </Menu>
      </>
    ) : (
      <Button variant="outlined" size="small" onClick={gesture.onClick} sx={GESTURE_SX}>
        {gesture.label}
      </Button>
    );

  return (
    <Box
      ref={place === 'foot' ? padZone : undefined}
      data-invite-card={place}
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'flex-start',
        gap: `${C.gap}px`,
        p: C.padding,
        borderRadius: '12px',
        border: `1.5px dashed ${tk.invBd}`,
        flexShrink: 0,
        ...(place === 'foot'
          ? {
              position: 'sticky',
              bottom: 0,
              // Above what scrolls beneath it, whatever that positions — and
              // under the Edit mode's controls, at 3 (`SortableWidget`).
              zIndex: 1,
              backgroundColor: alpha(theme.palette.background.paper, C.footGround),
              backgroundImage: `linear-gradient(${tk.invTint}, ${tk.invTint})`,
              backdropFilter: `blur(${C.footBlur}px)`,
              WebkitBackdropFilter: `blur(${C.footBlur}px)`,
            }
          : { m: 'auto', width: '100%', maxWidth: C.middleMaxWidth, backgroundColor: tk.invBg }),
      })}
    >
      <IconDisc size={C.disc} iconSize={C.icon}>
        {icon}
      </IconDisc>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component="h3"
          sx={{ m: 0, fontSize: C.title, lineHeight: C.titleLineHeight, fontWeight: 800, color: 'text.primary' }}
        >
          {title}
        </Typography>
        <Typography sx={{ mt: '4px', fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.5, color: 'text.secondary' }}>
          {body}
        </Typography>
        <Box sx={{ mt: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{action}</Box>
      </Box>
    </Box>
  );
}
