import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/Close';
import GrassIcon from '@mui/icons-material/Grass';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PersonIcon from '@mui/icons-material/Person';
import StorefrontIcon from '@mui/icons-material/Storefront';
import TuneIcon from '@mui/icons-material/Tune';
import { NAV_BG } from '../../constants/colors';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import ComingSoonChip from '../ComingSoonChip';
import LanguageMenu from '../LanguageMenu';
import UnitSystemSwitch from './UnitSystemSwitch';
import LogoButton from '../LogoButton';
import ProfileMenuHeader from './ProfileMenuHeader';

interface NavLink {
  key: string;
  to: string;
  enabled: boolean;
  icon: ReactNode;
  comingSoon?: boolean;
}

const navLinks: NavLink[] = [
  {
    key: 'nav.library',
    to: '/library',
    enabled: true,
    icon: <LocalFloristIcon sx={{ fontSize: 18 }} />,
  },
  {
    key: 'nav.myGardens',
    to: '/gardens',
    enabled: true,
    icon: <GrassIcon sx={{ fontSize: 18 }} />,
  },
  {
    key: 'nav.shop',
    to: '/shop',
    enabled: true,
    icon: <StorefrontIcon sx={{ fontSize: 18 }} />,
    comingSoon: true,
  },
];

// SMA-152 (W2): a clearer-than-default hover for the plain profile-menu rows
// (Notifications/Settings/Logout) — a translucent brand green ~2.5x the MUI
// default. The header row keeps its own (darker) green hover.
const menuRowHoverSx = {
  '&:hover': { bgcolor: 'rgba(46,139,87,0.10)' },
} as const;

export default function Navbar() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  const theme = useTheme();
  const mode = theme.palette.mode;
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { language, setLanguage } = useLanguage();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const toggleLanguage = () => setLanguage(language === 'en' ? 'fr' : 'en');

  const toggleDrawer = (open: boolean) => () => setDrawerOpen(open);

  const profileMenuOpen = Boolean(profileAnchor);
  const openProfileMenu = (e: React.MouseEvent<HTMLElement>) =>
    setProfileAnchor(e.currentTarget);
  const closeProfileMenu = () => setProfileAnchor(null);

  // Reuse the existing logout pattern: a rejected logout still leaves the user
  // in the logged-out state, so we swallow it.
  const handleLogout = async () => {
    closeProfileMenu();
    try {
      await logout();
    } catch {
      /* user sees logged-out state regardless */
    }
  };

  const handleDrawerLogout = async () => {
    // Close the drawer first so a slow logout never leaves it stuck open
    // (mirrors the desktop menu's close-then-logout order).
    setDrawerOpen(false);
    try {
      await logout();
    } catch {
      /* user sees logged-out state regardless */
    }
  };

  const profileLabel = user?.displayName || user?.email || '';
  // Show the email line only when it differs from the displayed name (avoids
  // duplicating it when there's no separate display name).
  const profileEmail =
    user?.email && user.email !== profileLabel ? user.email : '';

  const drawer = (
    <Box sx={{ width: 260 }} role="presentation">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          bgcolor: NAV_BG,
        }}
      >
        <Box
          component={RouterLink}
          to="/"
          aria-label={t('nav.homeAriaLabel')}
          onClick={toggleDrawer(false)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <LogoButton height={26} withHover={true} noLink />
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
            SmartCrops
          </Typography>
        </Box>
        <IconButton
          onClick={toggleDrawer(false)}
          sx={{ color: '#fff' }}
          aria-label={t('nav.closeMenu')}
        >
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />
      <List>
        {navLinks.map((link) => {
          const isActive = location.pathname.startsWith(link.to);
          return (
            <ListItem
              key={link.key}
              disablePadding
              secondaryAction={link.comingSoon ? <ComingSoonChip /> : undefined}
            >
              <ListItemButton
                component={RouterLink}
                to={link.to}
                disabled={!link.enabled}
                onClick={toggleDrawer(false)}
                aria-current={isActive ? 'page' : undefined}
                sx={{
                  bgcolor: isActive ? 'rgba(46,125,50,0.08)' : 'transparent',
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{link.icon}</ListItemIcon>
                <ListItemText
                  primary={t(link.key)}
                  primaryTypographyProps={{ fontWeight: isActive ? 700 : 400 }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      <Divider />
      {isAuthenticated && (
        <>
          <List>
            <ListItem disablePadding>
              <ListItemButton
                component={RouterLink}
                to="/profile"
                onClick={toggleDrawer(false)}
                aria-label={t('nav.editProfile')}
                sx={{
                  bgcolor: mode === 'dark' ? 'surfaceSubtle' : '#F2F7EE',
                  py: 1.5,
                }}
              >
                <ProfileMenuHeader
                  name={profileLabel}
                  email={profileEmail}
                  avatarSize={40}
                />
              </ListItemButton>
            </ListItem>
            <ListItem
              disablePadding
              secondaryAction={<ComingSoonChip />}
              aria-label={`${t('nav.notifications')} — ${t('common.comingSoon')}`}
              sx={{ px: 2, py: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <NotificationsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t('nav.notifications')} />
            </ListItem>
            <ListItem
              disablePadding
              secondaryAction={<ComingSoonChip />}
              aria-label={`${t('nav.settings')} — ${t('common.comingSoon')}`}
              sx={{ px: 2, py: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <TuneIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t('nav.settings')} />
            </ListItem>
          </List>
          <Divider />
        </>
      )}
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Button
          variant="outlined"
          fullWidth
          onClick={toggleLanguage}
          aria-label={t('nav.switchLanguage', { lang: language.toUpperCase() })}
        >
          <Box
            component="span"
            sx={{ fontWeight: language === 'fr' ? 700 : 400 }}
          >
            FR
          </Box>
          {' / '}
          <Box
            component="span"
            sx={{ fontWeight: language === 'en' ? 700 : 400 }}
          >
            EN
          </Box>
        </Button>
        {isAuthenticated ? (
          <Button
            variant="outlined"
            fullWidth
            startIcon={<LogoutIcon />}
            onClick={handleDrawerLogout}
          >
            {t('nav.logout')}
          </Button>
        ) : (
          <Button
            variant="contained"
            fullWidth
            component={RouterLink}
            to="/login"
            onClick={toggleDrawer(false)}
          >
            {t('nav.login')}
          </Button>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      <AppBar position="fixed" sx={{ bgcolor: NAV_BG, boxShadow: 2 }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          {/* Left: logo + brand (single link) */}
          <Box
            component={RouterLink}
            to="/"
            aria-label={t('nav.homeAriaLabel')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <LogoButton height={30} withHover={true} noLink />
            <Typography
              variant="h6"
              sx={{ color: '#fff', fontWeight: 700, letterSpacing: 0.5 }}
            >
              SmartCrops
            </Typography>
          </Box>

          {isMobile ? (
            // SMA-247 — units switch sits to the left of the hamburger on mobile.
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <UnitSystemSwitch />
              <IconButton
                onClick={toggleDrawer(true)}
                sx={{ color: '#fff' }}
                aria-label={t('nav.openMenu')}
              >
                <MenuIcon />
              </IconButton>
            </Box>
          ) : (
            <>
              {/* Center: nav links */}
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {navLinks.map((link) => {
                  const isActive = location.pathname.startsWith(link.to);
                  return (
                    <Box
                      key={link.key}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      <Button
                        component={RouterLink}
                        to={link.to}
                        disabled={!link.enabled}
                        aria-current={isActive ? 'page' : undefined}
                        sx={{
                          color: link.enabled
                            ? '#fff'
                            : 'rgba(255,255,255,0.4)',
                          opacity: isActive ? 1 : 0.7,
                          bgcolor: isActive
                            ? 'rgba(255,255,255,0.15)'
                            : 'transparent',
                          borderRadius: 1,
                          '&:hover': {
                            bgcolor: 'rgba(255,255,255,0.1)',
                            opacity: 1,
                          },
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                          }}
                        >
                          {link.icon}
                          {t(link.key)}
                        </Box>
                      </Button>
                      {link.comingSoon && <ComingSoonChip />}
                    </Box>
                  );
                })}
              </Box>

              {/* Right: language + auth */}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <LanguageMenu />
                {isAuthenticated ? (
                  <>
                    <Button
                      variant="text"
                      size="small"
                      onClick={openProfileMenu}
                      startIcon={<PersonIcon />}
                      endIcon={<ArrowDropDownIcon />}
                      id="profile-menu-button"
                      aria-haspopup="true"
                      aria-controls={
                        profileMenuOpen ? 'profile-menu' : undefined
                      }
                      aria-expanded={profileMenuOpen ? 'true' : undefined}
                      sx={{
                        color: 'rgba(255,255,255,0.8)',
                        textTransform: 'none',
                        '&:hover': { color: '#fff' },
                      }}
                    >
                      {profileLabel}
                    </Button>
                    <Menu
                      id="profile-menu"
                      anchorEl={profileAnchor}
                      open={profileMenuOpen}
                      onClose={closeProfileMenu}
                      disableScrollLock
                      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                      slotProps={{
                        paper: { sx: { overflow: 'hidden' } },
                        list: {
                          'aria-labelledby': 'profile-menu-button',
                          sx: { py: 0 },
                        },
                      }}
                    >
                      <MenuItem
                        component={RouterLink}
                        to="/profile"
                        onClick={closeProfileMenu}
                        aria-label={t('nav.editProfile')}
                        sx={{
                          bgcolor:
                            mode === 'dark' ? 'surfaceSubtle' : '#F2F7EE',
                          py: 1.5,
                          '&:hover': {
                            bgcolor:
                              mode === 'dark' ? 'brandTintBg' : '#E0EDD4',
                          },
                        }}
                      >
                        <ProfileMenuHeader
                          name={profileLabel}
                          email={profileEmail}
                          avatarSize={38}
                        />
                      </MenuItem>
                      <MenuItem onClick={closeProfileMenu} sx={menuRowHoverSx}>
                        <ListItemIcon>
                          <NotificationsIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={t('nav.notifications')} />
                        <ComingSoonChip sx={{ ml: 1.5 }} />
                      </MenuItem>
                      <MenuItem onClick={closeProfileMenu} sx={menuRowHoverSx}>
                        <ListItemIcon>
                          <TuneIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={t('nav.settings')} />
                        <ComingSoonChip sx={{ ml: 1.5 }} />
                      </MenuItem>
                      <Divider />
                      <MenuItem onClick={handleLogout} sx={menuRowHoverSx}>
                        <ListItemIcon>
                          <LogoutIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={t('nav.logout')} />
                      </MenuItem>
                    </Menu>
                  </>
                ) : (
                  <Button
                    variant="contained"
                    color="secondary"
                    size="small"
                    component={RouterLink}
                    to="/login"
                  >
                    {t('nav.login')}
                  </Button>
                )}
              </Box>
            </>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="left" open={drawerOpen} onClose={toggleDrawer(false)}>
        {drawer}
      </Drawer>
    </>
  );
}
