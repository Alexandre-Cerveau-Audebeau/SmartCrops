import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import { Sym } from './Sym';
import { useColorMode } from '../hooks/useColorMode';

/**
 * Day/Night segmented switch (SMA-184). Both options stay visible; the active
 * one is a raised white pill with a colored icon (sun = amber, moon = indigo),
 * the inactive one is muted white — tuned for the green footer bar. Mirrors the
 * app's raised-white-pill toggle pattern (UnitSystemToggle).
 */
export default function ThemeModeSwitch() {
  const { t } = useTranslation();
  const { mode, setMode } = useColorMode();

  const cell = (active: boolean, activeColor: string) => ({
    width: 32,
    height: 26,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    bgcolor: active ? '#fff' : 'transparent',
    color: active ? activeColor : 'rgba(255,255,255,0.55)',
    transition: 'background-color .15s, color .15s',
  });

  return (
    <Box
      role="group"
      aria-label={t('footer.theme', 'Theme')}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        p: '3px',
        borderRadius: 999,
        bgcolor: 'rgba(255,255,255,0.14)',
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={() => setMode('light')}
        aria-label={t('footer.lightMode', 'Light mode')}
        aria-pressed={mode === 'light'}
        sx={cell(mode === 'light', '#E8943A')}
      >
        <Sym name="wb_sunny" size={18} color="inherit" />
      </Box>
      <Box
        component="button"
        type="button"
        onClick={() => setMode('dark')}
        aria-label={t('footer.darkMode', 'Dark mode')}
        aria-pressed={mode === 'dark'}
        sx={cell(mode === 'dark', '#3E5BA6')}
      >
        <Sym name="dark_mode" size={18} color="inherit" />
      </Box>
    </Box>
  );
}
