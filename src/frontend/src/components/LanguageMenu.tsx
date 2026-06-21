import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import { alpha } from '@mui/material/styles';
import { Sym } from './Sym';
import { FlagFr, FlagUs } from './Flags';
import { useLanguage } from '../hooks/useLanguage';

// English / Français are endonyms — they stay constant regardless of the UI
// language, so they are intentionally NOT translated.
const LANGS = [
  { code: 'en', short: 'EN', label: 'English', Flag: FlagUs },
  { code: 'fr', short: 'FR', label: 'Français', Flag: FlagFr },
] as const;

/**
 * Styled language switcher (SMA-208) — a flag dropdown replacing the plain
 * "FR / EN" toggle. Drives the app's LanguageContext (`setLanguage`), which is
 * the source of truth: it persists to localStorage and keeps i18next in sync,
 * so we never call `i18n.changeLanguage` directly here. The trigger styling
 * (`#fff`, white hover) is tied to the green navbar; `primary`/`paper` come
 * from the theme so the menu is already dark-mode ready.
 */
export default function LanguageMenu() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const active = LANGS.find((l) => language.startsWith(l.code)) ?? LANGS[0];
  const ActiveFlag = active.Flag;

  return (
    <>
      <Button
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-haspopup="menu"
        aria-label={t('nav.changeLanguage', 'Change language')}
        startIcon={<ActiveFlag h={14} />}
        endIcon={<Sym name="expand_more" size={18} color="inherit" />}
        sx={{
          color: '#fff',
          textTransform: 'none',
          fontWeight: 600,
          fontSize: 14,
          px: 1,
          minWidth: 0,
          '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
        }}
      >
        {active.short}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        disableScrollLock
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: { sx: { mt: 1, minWidth: 184, borderRadius: '12px' } },
        }}
      >
        {LANGS.map(({ code, label, Flag }) => (
          <MenuItem
            key={code}
            selected={code === active.code}
            onClick={() => {
              setLanguage(code);
              setAnchorEl(null);
            }}
            sx={{
              gap: 1.25,
              fontSize: 14,
              fontWeight: code === active.code ? 700 : 500,
              '&.Mui-selected': {
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
                color: 'primary.dark',
              },
              '&.Mui-selected:hover': {
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.18),
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 0 }}>
              <Flag h={14} />
            </ListItemIcon>
            {label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
