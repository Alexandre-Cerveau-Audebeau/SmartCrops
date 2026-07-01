import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Zoom from '@mui/material/Zoom';
import useScrollTrigger from '@mui/material/useScrollTrigger';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

/**
 * SMA-126: global "back to top" floating action button. Mounted once in the
 * layout so it covers every page (notably the infinite-scroll Library and long
 * plant-detail pages). Hidden at the top of the page, it zooms in once the user
 * has scrolled past ~400px and scrolls the window back up on click — smoothly,
 * unless the user prefers reduced motion. Anchored bottom-right at
 * `theme.zIndex.fab` so it floats above content but below MUI dialogs (1300).
 */
export default function BackToTop() {
  const { t } = useTranslation();
  const trigger = useScrollTrigger({ disableHysteresis: true, threshold: 400 });

  const handleClick = () => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <Zoom in={trigger}>
      <Box
        sx={{
          position: 'fixed',
          // SMA-248 — below md the AI assistant FAB occupies the bottom slot, so
          // the arrow is raised above it across the whole mobile range (xs+sm);
          // md+ keeps the original 24px (no AI FAB there → desktop unchanged).
          bottom: { xs: 76, md: 24 },
          right: { xs: 16, sm: 24 },
          zIndex: (theme) => theme.zIndex.fab,
        }}
      >
        <Fab
          size="small"
          color="primary"
          aria-label={t('common.backToTop')}
          onClick={handleClick}
        >
          <KeyboardArrowUpIcon />
        </Fab>
      </Box>
    </Zoom>
  );
}
